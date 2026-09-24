/**
 * 搜索匹配、指板音集收集、根音解析、转位判定、演唱调派生。
 *
 * 从 theory.ts 抽出（原 674~701、705~738、748~766、847~877、886~926、932 行）。
 * validateBassConsistency / getActiveBaseStrings 属 bassConsistency 模块；
 * computeChordFingerprint / nameKeyOf 属 chordIdentity 模块。
 */

import { createLruCache } from '@/platform/utils/cache';
import { estimateValueBytes } from '@/platform/utils/common';

import { analyzeBestRootPitch } from './chordEngine';
import { getChordName, getChordRootPitch } from './chordName';
import { calcPitchIndex, composeNoteLabel, computeStringLabelAccidental } from './pitch';
import { transposeChordName } from './transpose';
import { getBaseStringsFor, isReentrantTuning, Tuning } from './tuning';

import type { ChordOrName } from './chordName';
import type { ChordNameSegments, NoteInput } from '@/domains/chord/types';
import type { GuitarStringEntity } from '@/domains/fretboard/types';

/** 查询词变体缓存：一次搜索里整个和弦列表共用同一个查询词，
 *  逐和弦重建 7 条正则替换链是纯重复——按查询词缓存后每键入一个新字符只算一次。
 *  值是几条短字符串（单条 ~0.1KB），上限与同组文本级缓存统一取 4096，按敲过的查询词量级放足 */
const searchVariantsCache = createLruCache<string[]>(4096, {
  name: '搜索变体',
  weigh: (_, value) => estimateValueBytes(value),
});

/** 生成查询词的等价变体 (ASCII 变音符 & Unicode 变音符 & 符号替换) */
const buildSearchVariants = (qLower: string): string[] => {
  const cached = searchVariantsCache.get(qLower);
  if (cached) return cached;

  const variants = [
    qLower,
    qLower.replace(/♯/g, '#').replace(/♭/g, 'b'),
    // 只把「紧跟在音名后」的 b 当降号（Bb→B♭、Ab→A♭）。裸 /b/g 会把音名 B 本身也替换掉
    // （Bm → ♭m、Bbmaj7 → ♭♭maj7），凭空造出脏变体、扩大误匹配面。
    // 不用 lookbehind（Safari 16.4 之前不支持，会在解析期直接抛 SyntaxError）：
    // 消费音名再回填同效，且 m7b5 这类「数字后的 b」本就不该替换（ASCII 别名已覆盖）。
    qLower.replace(/#/g, '♯').replace(/([a-gA-G])b/g, '$1♭'),
    // Δ/δ 是「大」的记号，只映射 maj。早先这里与下一行并列生成 'm' 变体，
    // 结果「搜 CΔ7」会命中 Cm7（大七被当成小七）
    qLower.replace(/δ|Δ/g, 'maj').replace(/♯/g, '#').replace(/♭/g, 'b'),
    qLower.replace(/ø|ø7/g, 'm7b5').replace(/♯/g, '#').replace(/♭/g, 'b'),
    qLower.replace(/°/g, 'dim').replace(/♯/g, '#').replace(/♭/g, 'b'),
  ];

  searchVariantsCache.set(qLower, variants);
  return variants;
};

/** 单和弦等价别名集合：只与和弦内容有关、与查询词无关，按对象引用缓存。
 *  和弦库的编辑总是产生新对象（草稿为 cloneDeep 副本），故按引用缓存不会读到过期别名 */
const chordAliasCache = new WeakMap<object, string[]>();

/** 收集和弦的全部等价别名字符串（标准全称 / 简写 / Unicode 与 ASCII 变体 / Δ·δ 符号别名） */
const collectChordAliases = (chord: { nameSegments?: ChordNameSegments | null; chordName?: string }): string[] => {
  if (typeof chord === 'object') {
    const cached = chordAliasCache.get(chord);
    if (cached) return cached;
  }

  const names = new Set<string>();
  if (chord.chordName) names.add(chord.chordName.toLowerCase());

  // 标准全称 (ASCII & Unicode)
  const fullNameAscii = getChordName(chord, { shorthand: false, useUnicode: false }).toLowerCase();
  const fullNameUnicode = getChordName(chord, { shorthand: false, useUnicode: true }).toLowerCase();
  if (fullNameAscii) names.add(fullNameAscii);
  if (fullNameUnicode) names.add(fullNameUnicode);

  // 简写名称 (ASCII & Unicode, 如 CM7, C°, Cø7, C+)
  const shortNameAscii = getChordName(chord, { shorthand: true, useUnicode: false }).toLowerCase();
  const shortNameUnicode = getChordName(chord, { shorthand: true, useUnicode: true }).toLowerCase();
  if (shortNameAscii) names.add(shortNameAscii);
  if (shortNameUnicode) names.add(shortNameUnicode);

  // 扩展特殊符号别名 (如 Δ7 对应 M7 / maj7)
  if (fullNameAscii.includes('maj')) {
    names.add(fullNameAscii.replace(/maj/g, 'δ'));
    names.add(fullNameAscii.replace(/maj/g, 'Δ'));
    names.add(fullNameAscii.replace(/maj/g, 'm'));
  }
  const aliases = Array.from(names);
  if (typeof chord === 'object') chordAliasCache.set(chord, aliases);

  return aliases;
};

/**
 * 智能模糊匹配和弦名称（支持全称、简写缩写、Unicode/ASCII 变音记号互通）
 * 例如：搜索 CM7 / CΔ7 / Cmaj7 均能匹配到 Cmaj7；
 *       搜索 C+ / Caug 均能匹配到 Caug；
 *       搜索 Cø / Cø7 / Cm7b5 均能匹配到 Cm7(b5)；
 *       搜索 C° / Cdim 均能匹配到 Cdim；
 *       搜索 F# / F♯ / Bb / B♭ 自动互通。
 */
export const matchChordSearch = (
  chord: { nameSegments?: ChordNameSegments | null; chordName?: string } | null | undefined,
  query: string
): boolean => {
  if (!chord) return false;
  const rawQ = query.trim();
  if (!rawQ) return true;

  const aliases = collectChordAliases(chord);
  const queryVariants = buildSearchVariants(rawQ.toLowerCase());

  for (const name of aliases) for (const q of queryVariants) if (name.includes(q)) return true;

  return false;
};

/**
 * 收集指板音集为 NoteInput[]（含弦位/音高/音名），并返回物理最低音高。
 * 供根音推导、转位判定与分析面板统一使用，避免各处重复遍历。
 */
export const collectChordNotes = (
  strings: GuitarStringEntity[],
  fretOffset: number = 0,
  // 缺省按实际弦数解析（不足预设则延伸、超出则截取），
  // 避免调用方省略该参数时第 7 根起的空弦音高被 `?? 0` 静默塌成 0
  baseStrings: readonly number[] = getBaseStringsFor(Tuning.STANDARD, strings.length)
): { notes: NoteInput[]; bassPitch: number } => {
  const notes: NoteInput[] = [];
  // 低音取实际最低音高，而非「最先按下的弦」：重入定弦（尤克里里 GCEA）下弦序最外的弦并不最低，
  // 与 chordEngine.collectNoteContext 的 bassByPitch 同口径，否则同一和弦两条路转位/斜杠低音判定相反
  let bassPitch = -1;
  for (let sIdx = 0; sIdx < strings.length; sIdx++) {
    const str = strings[sIdx];
    if (!str || str.fret < 0) continue;
    const pitch = calcPitchIndex(sIdx, str.fret, fretOffset, baseStrings);
    const { label: naturalLabel, isAccidental } = computeStringLabelAccidental(
      sIdx,
      str.fret,
      fretOffset,
      str.preferFlat,
      baseStrings
    );
    notes.push({
      stringIndex: sIdx,
      pitchIndex: pitch,
      label: composeNoteLabel(naturalLabel, isAccidental, str.preferFlat),
    });
    if (bassPitch === -1 || pitch < bassPitch) bassPitch = pitch;
  }
  return { notes, bassPitch };
};

const collectNotes = collectChordNotes;

/**
 * 解析和弦根音音高（三级兜底）：
 * 1. rootStringIndex 手动标记的弦音高
 * 2. 名字解析（含斜杠低音时取斜杠前的根音，如 Bm7/A -> B）
 * 3. analyzeChordGraph 基于指板音集自动推导（Rootless 转位仍能给出根音）
 * 返回 99 表示三层都失败。
 */
export const resolveChordRootPitch = (
  strings: GuitarStringEntity[],
  fretOffset: number = 0,
  tuning: Tuning | string = Tuning.STANDARD,
  chordOrName?: string | ChordOrName,
  rootStringIndex: number | null = null
): number => {
  const baseStrings = getBaseStringsFor(tuning, strings.length);
  // 1. 手动标记优先
  if (rootStringIndex !== null && rootStringIndex >= 0 && rootStringIndex < strings.length) {
    const markedStr = strings[rootStringIndex];
    if (markedStr && markedStr.fret >= 0)
      return calcPitchIndex(rootStringIndex, markedStr.fret, fretOffset, baseStrings);
  }
  // 2. 名字/分片解析
  if (chordOrName) {
    const chordName = typeof chordOrName === 'string' ? chordOrName : getChordName(chordOrName);
    const namePitch = getChordRootPitch(chordName);
    if (namePitch !== 99) return namePitch;
  }
  // 3. 自动推导（基于指板音集）：只问最佳根音，命中相对签名时不合成候选/音名
  const { notes } = collectNotes(strings, fretOffset, baseStrings);
  if (notes.length === 0) return 99;
  // 重入调弦（尤克里里）必须按真实音高取低音，否则锚点落在物理上并非最低的弦上
  return analyzeBestRootPitch(notes, null, isReentrantTuning(tuning));
};

/** 判断指法是否为转位：物理最低音不等于（已解析的）根音即为转位；无法解析时视为非转位。 */
export const computeIsInverted = (
  strings: GuitarStringEntity[],
  fretOffset: number = 0,
  tuning: string = Tuning.STANDARD,
  chordOrName?: string | ChordOrName,
  rootStringIndex: number | null = null
): boolean => {
  const baseStrings = getBaseStringsFor(tuning, strings.length);
  const { bassPitch } = collectNotes(strings, fretOffset, baseStrings);
  const rootPitch = resolveChordRootPitch(strings, fretOffset, tuning, chordOrName, rootStringIndex);
  return bassPitch !== -1 && rootPitch !== 99 && bassPitch !== rootPitch;
};

/**
 * 由指法调 + 变调夹推导实际演唱调：key = playKey 升 capo 半音。
 * 歌曲持久化只存 playKey 与 capo，key 一律实时派生（单一事实源）。
 */
export const computeSongKey = (playKey: string, capo: number): string => transposeChordName(playKey || 'C', capo || 0);
