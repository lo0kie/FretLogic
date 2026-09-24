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
import { calcNoteMidi, calcPitchIndex, composeNoteLabel, computeStringLabelAccidental } from './pitch';
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

/** 单和弦等价别名集合，分两档（见 collectChordAliases）。
 *  只与和弦内容有关、与查询词无关，按对象引用缓存 ——
 *  和弦库的编辑总是产生新对象（草稿为 cloneDeep 副本），故按引用缓存不会读到过期别名 */
interface ChordAliases {
  /** 大小写不敏感档（全小写）：容忍用户随手大小写，`cmaj7` 也能搜到 `Cmaj7` */
  loose: string[];
  /** 大小写敏感档：简写里的 `M`（大）与 `m`（小）承载语义，只能按原大小写比对 */
  strict: string[];
}

const chordAliasCache = new WeakMap<object, ChordAliases>();

/** 简写是否必须保留大小写：含大写 `M` 即视为承载「大」的语义（`M7` / `mM7` / `°M7` / `M`）。
 *  这类简写若一并折进小写档，`CM7` 与 `Cm7` 会同键 —— 搜小七会把全库大七一起命中。
 *  不含 `M` 的简写（`+` / `°` / `ø7` / `sus`）照常折叠，否则 `c+`、`cø7` 这类随手小写会搜不到。 */
const isCaseSignificantShorthand = (name: string): boolean => name.includes('M');

/** 收集和弦的全部等价别名（标准全称 / 简写 / Unicode 与 ASCII 变体 / Δ·δ 符号别名）。
 *  大小写承载语义的简写单独收进 strict 档，其余一律折进 loose 档 —— 见 isCaseSignificantShorthand。 */
const collectChordAliases = (chord: { nameSegments?: ChordNameSegments | null; chordName?: string }): ChordAliases => {
  if (typeof chord === 'object') {
    const cached = chordAliasCache.get(chord);
    if (cached) return cached;
  }

  const loose = new Set<string>();
  const strict = new Set<string>();
  if (chord.chordName) loose.add(chord.chordName.toLowerCase());

  // 标准全称 (ASCII & Unicode)
  const fullNameAscii = getChordName(chord, { shorthand: false, useUnicode: false }).toLowerCase();
  const fullNameUnicode = getChordName(chord, { shorthand: false, useUnicode: true }).toLowerCase();
  if (fullNameAscii) loose.add(fullNameAscii);
  if (fullNameUnicode) loose.add(fullNameUnicode);

  // 简写名称 (ASCII & Unicode, 如 CM7, C°, Cø7, C+)
  for (const shortName of [
    getChordName(chord, { shorthand: true, useUnicode: false }),
    getChordName(chord, { shorthand: true, useUnicode: true }),
  ]) {
    if (!shortName) continue;
    if (isCaseSignificantShorthand(shortName)) strict.add(shortName);
    else loose.add(shortName.toLowerCase());
  }

  // 扩展特殊符号别名 (如 Δ7 对应 M7 / maj7)
  // 只登记 Δ/δ 两个「大」记号。此前这里还额外登记了 `maj` → `m` 的别名，于是每个大七和弦都多出
  // 一条 `cm7`，搜 Cm7（小七）会把全库的大七一并命中 —— 与上面简写的折叠是同一处大小写混同事故。
  if (fullNameAscii.includes('maj')) {
    loose.add(fullNameAscii.replace(/maj/g, 'δ'));
    loose.add(fullNameAscii.replace(/maj/g, 'Δ'));
  }

  const aliases: ChordAliases = { loose: Array.from(loose), strict: Array.from(strict) };
  if (typeof chord === 'object') chordAliasCache.set(chord, aliases);

  return aliases;
};

/** 查询词首字母（根音）统一大写、其余原样：让 `cM7` 这类「小写根音 + 大写 M」也能命中简写档，
 *  而根音之后的 `M` / `m` 不做折叠 —— 那正是简写档要比对的大小写语义所在。 */
const capitalizeRoot = (q: string): string => q.charAt(0).toUpperCase() + q.slice(1);

/**
 * 智能模糊匹配和弦名称（支持全称、简写缩写、Unicode/ASCII 变音记号互通）
 * 例如：搜索 CM7 / CΔ7 / Cmaj7 均能匹配到 Cmaj7；
 *       搜索 C+ / Caug 均能匹配到 Caug；
 *       搜索 Cø / Cø7 / Cm7b5 均能匹配到 Cm7(b5)；
 *       搜索 C° / Cdim 均能匹配到 Cdim；
 *       搜索 F# / F♯ / Bb / B♭ 自动互通。
 *
 * 匹配分两轮，与 alias 的两档对应：
 *  1. loose 档用**全小写**查询比对（大小写不敏感）；
 *  2. strict 档（含 `M` 的简写）用**保留大小写**的查询比对 ——
 *     否则 `Cm7` 会命中 `Cmaj7`（小七搜出全库大七）。
 */
export const matchChordSearch = (
  chord: { nameSegments?: ChordNameSegments | null; chordName?: string } | null | undefined,
  query: string
): boolean => {
  if (!chord) return false;
  const rawQ = query.trim();
  if (!rawQ) return true;

  const { loose, strict } = collectChordAliases(chord);

  // 变体只与查询词有关，按档提到各自循环外算一次；strict 档保持「loose 未命中才算」的短路顺序
  const looseVariants = buildSearchVariants(rawQ.toLowerCase());
  for (const name of loose) for (const q of looseVariants) if (name.includes(q)) return true;

  const strictVariants = buildSearchVariants(capitalizeRoot(rawQ));
  for (const name of strict) for (const q of strictVariants) if (name.includes(q)) return true;

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
  // 低音取实际最低音高（完整 MIDI），而非「最先按下的弦」：重入定弦（尤克里里 GCEA）下弦序最外的弦并不最低。
  // 这与 chordEngine.collectNoteContext 的 bassByPitch=true 分支同口径；该分支只在**非重入**调弦下
  // 退化成「按弦序取最低」（标准/降 D 等调弦空弦音高随弦序单调递增，弦序最外的弦必然最低，两种取法同解）。
  // 本函数没有「非重入」这一前提，故一律按音高取，两类调弦都成立 —— 否则同一和弦两条路的转位/斜杠低音判定相反。
  //
  // 比较必须用**完整 MIDI**，不能在音级（0~11）上取 min：音级丢掉了八度，最小值不等于最低音的音级。
  // 开放和弦是重灾区——G（320003）各弦音级为 G7 B11 D2 G7 B11 G7，音级 min 得 D2，
  // 而物理最低音是低 E 弦 3 品的 G2（MIDI 43，全场最小）。于是「最低音是 D」这个错误结论
  // 传下去：computeIsInverted 判 G 为转位、validateBassConsistency 给 G 报低音不一致警告，
  // 指纹里的 isInverted 位也随之失真。
  // 故这里先按 MIDI 取最小、最后再归一成音级返回（对外契约不变：仍是 0~11 的音级，无音为 -1）。
  let bassMidi = Number.POSITIVE_INFINITY;
  for (let sIdx = 0; sIdx < strings.length; sIdx++) {
    const str = strings[sIdx];
    if (!str || str.fret < 0) continue;
    const midi = calcNoteMidi(sIdx, str.fret, fretOffset, baseStrings);
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
      // 带上完整 MIDI：下游 chordEngine 判定最低音时要用（音级 min 不是最低音，见上方说明）
      midi,
    });
    if (midi < bassMidi) bassMidi = midi;
  }
  const bassPitch = Number.isFinite(bassMidi) ? ((bassMidi % 12) + 12) % 12 : -1;
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
