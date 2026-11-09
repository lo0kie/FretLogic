/**
 * 搜索匹配、指板音集收集、根音解析、转位判定、演唱调派生。
 *
 * 从 theory.ts 抽出（原 674~701、705~738、748~766、847~877、886~926、932 行）。
 * validateBassConsistency / getActiveBaseStrings 属 bassConsistency 模块；
 * computeChordFingerprint / nameKeyOf 属 chordIdentity 模块。
 */

import { createLruCache } from '@/platform/utils/cache';
import { estimateValueBytes, isObject, isString } from '@/platform/utils/common';

import { analyzeBestRootPitch } from './chordEngine';
import { getChordName, getChordRootPitch } from './chordName';
import { calcNoteMidi, calcPitchIndex, composeNoteLabel, computeStringLabelAccidental } from './pitch';
import { transposeChordName } from './transpose';
import { getBaseStringsFor, isReentrantTuning, Tuning } from './tuning';

import type { ChordOrName } from './chordName';
import type { KeyName } from './pitch';
import type { ChordNameSegments, NoteInput } from '@/domains/chord/types';
import type { GuitarStringEntity } from '@/platform/types/instrument';

/**
 * 搜索用的**规范化**：把任意写法折成同一个 ASCII 小写形态。
 *
 * 【为什么是「两侧同一个规范化器」而不是「给查询词生成一串变体」】此前是后者：把查询词按
 * 6 条链式 `replaceAll` 展开成一批变体（`♯`↔`#`、`Δ`→`maj`、`ø`→`m7b5`…），再拿每个变体去
 * 子串匹配别名。那条路有两个固有毛病：
 * ① **顺序敏感** —— `ø7|ø` 写成 `ø|ø7` 就会让 `cø7` 变成 `cm7b57`（`ø` 先命中、`7` 变残留）。
 *    这类坑只能靠注释与「记得把长的写前面」维持，改一次就得重新推一遍每条链的先后。
 * ② **大小写要另开一档** —— `M7` 与 `m7` 语义相反，于是别名与查询各分 loose / strict 两档、
 *    再加一个 `isCaseSignificantShorthand = name.includes('M')` 的特判。
 * 规范化之后两者都消失：`M` 被折成 `maj`（大写只在「大」这一处承载语义，折掉即无歧义），
 * `ø7` / `ø` 都折成 `m7b5`（一次带可选 `7` 的匹配，不存在先后），`M7` → `maj7` 与 `m7` 天然不同键。
 *
 * 【为什么可以无脑把 `♭` 折成 `b`、不去分辨「音名 B」】旧实现必须小心（只把紧跟音名后的 `b`
 * 当降号），因为它生成的是**一批各自都得成立**的变体；这里两侧过同一个映射，只要映射一致，
 * `B♭maj7` 与 `Bbmaj7` 折成同一个 `bbmaj7` 就够了，不需要知道哪个 `b` 是降号。
 *
 * 展开式里没有 `maj` → `m` 这类「反向」映射：那会让大七和弦多出一条 `cm7` 别名，搜小七命中全库大七。
 */
const SEARCH_SYMBOL_CANON: Record<string, string> = {
  'min': 'm',
  'ø7': 'm7b5',
  'ø': 'm7b5',
  '♯': '#',
  '♭': 'b',
  'Δ': 'maj',
  'δ': 'maj',
  'M': 'maj',
  '°': 'dim',
  '+': 'aug',
  '-': 'm',
};

/**
 * 单趟替换 + 折叠大小写。**必须一趟**：`ø7?` 与 `min` 都是多字符项，靠**同一次匹配里的交替顺序**
 * （长的在前）解决，而不是像旧实现那样拆成多趟链式替换 —— 跨趟的先后要靠人记住，改一次就得重推一遍。
 *
 * 查表先精确、再小写兜底：`M`（大写）要折成 `maj`，而 `m`（小写）必须原样保留 ——
 * 这正是「大小写承载语义」在规范化里的落点，故不能先统一小写再查表。
 */
const canonicalizeForSearch = (text: string): string =>
  text
    .replaceAll(
      /min|ø7?|[♯♭ΔδM°+-]/gi,
      symbol => SEARCH_SYMBOL_CANON[symbol] ?? SEARCH_SYMBOL_CANON[symbol.toLowerCase()] ?? symbol
    )
    .toLowerCase();

/** 规范化结果缓存：一次搜索里整个和弦列表共用同一个查询词，逐和弦重算纯属重复。
 *  值是单个短字符串，上限与同组文本级缓存统一取 4096。 */
const canonicalQueryCache = createLruCache<string>(4096, {
  name: '搜索规范化',
  weigh: (_, value) => estimateValueBytes(value),
});

const canonicalQuery = (raw: string): string => {
  const cached = canonicalQueryCache.get(raw);
  if (cached !== undefined) return cached;
  const value = canonicalizeForSearch(raw);
  canonicalQueryCache.set(raw, value);
  return value;
};

/** 别名按**对象引用**缓存：只与和弦内容有关、与查询词无关。
 *  和弦库的编辑总是产生新对象（草稿为 cloneDeep 副本），故按引用缓存不会读到过期别名 */
const chordAliasCache = new WeakMap<object, string[]>();

/** 单和弦的等价别名集合：标准全称 / 简写 / 原始写法，**全部过同一个规范化器**后去重。
 *  规范化把 `♯`/`♭`、`Δ`/`M`、`ø7`/`ø`、`°`、`+`、`-` 各自收敛，故不再需要按 `useUnicode`
 *  各取一份（两者折后同形），也不再需要分大小写两档。 */
const collectChordAliases = (chord: { nameSegments?: ChordNameSegments | null; chordName?: string }): string[] => {
  if (isObject(chord)) {
    const cached = chordAliasCache.get(chord);
    if (cached) return cached;
  }

  const out = new Set<string>();
  if (chord.chordName) out.add(canonicalizeForSearch(chord.chordName));
  for (const shorthand of [false, true]) {
    const name = getChordName(chord, { shorthand, useUnicode: false });
    if (name) out.add(canonicalizeForSearch(name));
  }

  const aliases = Array.from(out);
  if (isObject(chord)) chordAliasCache.set(chord, aliases);
  return aliases;
};

/**
 * 智能模糊匹配和弦名称（支持全称、简写缩写、Unicode/ASCII 变音记号互通）
 * 例如：搜索 CM7 / CΔ7 / Cmaj7 均能匹配到 Cmaj7；
 *       搜索 C+ / Caug 均能匹配到 Caug；
 *       搜索 Cø / Cø7 / Cm7b5 均能匹配到 Cm7(b5)；
 *       搜索 C° / Cdim 均能匹配到 Cdim；
 *       搜索 F# / F♯ / Bb / B♭ 自动互通。
 *
 * 实现只有一步：**查询词与别名都过 `canonicalizeForSearch`，再做子串包含**。
 * 子串（而不是相等）是刻意的 —— 它支持「边打边搜」，`cmaj` 这种半截输入也要能命中 `Cmaj7`。
 * 正因为如此，这里**不能**改成「把查询词解析成 AST 再按等价比较」：半截输入解析不出 AST。
 * 大小写语义（`M7` 大七 vs `m7` 小七）由规范化里的 `M` → `maj` 保证，不再需要分档比对。
 */
export const matchChordSearch = (
  chord: { nameSegments?: ChordNameSegments | null; chordName?: string } | null | undefined,
  query: string
): boolean => {
  if (!chord) return false;
  const q = canonicalQuery(query.trim());
  if (!q) return true;

  for (const alias of collectChordAliases(chord)) if (alias.includes(q)) return true;
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
    const chordName = isString(chordOrName) ? chordOrName : getChordName(chordOrName);
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
export const computeSongKey = (playKey: KeyName, capo: number): string => transposeChordName(playKey || 'C', capo || 0);
