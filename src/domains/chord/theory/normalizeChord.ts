import { nameToSegments, segmentsToString, Tuning } from '@/domains/chord/theory/theory';
import { DEFAULT_FRET_COUNT } from '@/domains/fretboard/constants';
import {
  isCapoValue,
  isFretOffsetValue,
  normalizeAndMergeBarres,
  normalizeBarres,
  toFretOffset,
} from '@/domains/fretboard/model/coordinates';

import type { ChordDraft, ChordNameSegments, ExtensionSegment } from '@/domains/chord/types';
import type { BarreEntity, FretOffset, GuitarStringsModel, StringIndex } from '@/domains/fretboard/types';

/**
 * 两个和弦名分片是否等价（根音 / 性质 / 扩展音 / 低音逐项比对）。
 *
 * 用于存量迁移时判断「重解析后的分片是否与原来不同」，从而决定要不要写盘。
 * 只比对话义有影响的部分：元组的元素个数差异（`[5]` 与 `[5, 0]`）视为等价，
 * 因为 `segmentsToString` 对两者的输出完全相同，为它们触发一次写盘没有意义。
 */
const areSegmentsEqual = (a: ChordNameSegments, b: ChordNameSegments): boolean => {
  const pitch = (seg: readonly (string | number | undefined)[] | undefined): string =>
    seg ? `${seg[0]}:${seg[1] ?? 0}` : '';
  const exts = (list: ExtensionSegment[] | undefined): string =>
    (list ?? []).map(([deg, acc]) => `${deg}:${acc ?? 0}`).join(',');
  return (
    pitch(a.root) === pitch(b.root) &&
    (a.quality ?? '') === (b.quality ?? '') &&
    (a.unknownQuality ?? '') === (b.unknownQuality ?? '') &&
    pitch(a.bass) === pitch(b.bass) &&
    exts(a.extensions) === exts(b.extensions)
  );
};

/**
 * 把 extensions 统一重建为元组 [degree, accidental?]。
 *
 * 历史缺陷：transposeChordSegments 曾用 `{ ...e }` 复制元组，落盘后成为 `{0, 1}` 普通对象，
 * 而下游（segmentsToString / vChordName / areChordsEnharmonicallyEquivalent）一律按元组做
 * `([deg, acc])` 数组解构，遇到普通对象会抛 "is not iterable"。此处按索引逐位重建。
 * 对已是合法元组的输入返回原引用，调用方据 `===` 判断是否真的发生了修复。
 */
const repairExtensions = (extensions: unknown): ExtensionSegment[] | undefined => {
  if (!Array.isArray(extensions)) return undefined;
  let dirty = false;
  const next = (extensions as unknown[]).map(entry => {
    if (Array.isArray(entry)) return entry as ExtensionSegment;
    dirty = true;
    const indexed = entry as Record<number, unknown>;
    return [indexed[0], indexed[1]] as ExtensionSegment;
  });
  return dirty ? next : (extensions as ExtensionSegment[]);
};

/**
 * 横按比较用的规范串：把**空数组**与 `undefined` 折算成同一种形态。
 *
 * 原先两侧直接 `JSON.stringify` 比较，而 `normalizeBarres([], n)` 返回的是 `undefined`，
 * 于是 `JSON.stringify([])`（`'[]'`）与 `JSON.stringify(undefined)`（`undefined`）**恒不相等** ——
 * 任何 `barres: []` 的和弦每次归一化都被判为「已变更」，反复触发写盘。
 * 空数组与 undefined 在语义上都是「没有横按」，比较前必须统一。
 */
const barresForCompare = (barres: BarreEntity[] | undefined): string =>
  JSON.stringify(barres && barres.length > 0 ? barres : undefined);

/**
 * 和弦实体归一化：迁移旧数据结构并修复非法字段。
 * 覆盖：strings 对象数组 → 二维数组、弦级 isRoot → 单点 rootStringIndex（含有效性校验）、
 * 旧字段（isInverted/fingerprint/chordName）清理、横按合法性过滤、chordName → nameSegments 迁移、
 * extensions 元组塌陷修复（历史坏数据自愈）、旧「性质 + 散装张力音」分片迁移为性质整词形态。
 *
 * 入参用 `ChordDraft`（时间戳可缺）而非 `Chord`：本函数处理的正是「历史脏记录」，
 * 时间戳由下游 `fillMissingTimestamps` 补齐，不在此处承诺。泛型保住输入形态——
 * 传合规 `Chord`（编辑器保存路径）拿回 `Chord`，传 `ChordDraft`（载入清洗路径）拿回 `ChordDraft`。
 * @returns 规范化结果与是否发生变更（未变更时原样返回引用，避免无谓的深拷贝/写盘）
 */
export const normalizeChord = <T extends ChordDraft>(chord: T): { chord: T; changed: boolean } => {
  const rawChord = chord as unknown as Record<string, unknown>;
  const fretOffset = isFretOffsetValue(rawChord['fretOffset'])
    ? (rawChord['fretOffset'] as FretOffset)
    : isCapoValue(rawChord['capo'])
      ? toFretOffset(rawChord['capo'] as number)
      : 0;
  const tuning = chord.tuning || Tuning.STANDARD;
  const fretCount = chord.fretCount ?? DEFAULT_FRET_COUNT;

  // 迁移：strings 由旧二维元组 `[[fret, preferFlat]]` 升级为对象数组 `[{ fret, preferFlat }]`。
  // 对象形态是 `GuitarStringEntity` 的**声明形态**（见 fretboard/types.ts），也是当前落盘形态；
  // 元组只是历史遗留，读到即转换并置位 `stringsMigrated`。
  //
  // 注意：fret 合法值是 -1/0/正整数，不能用 `|| -1` 兜底（0 是空弦，会被误判为 -1 静音）
  // 品位清洗：fret 为可视窗口内的相对值，合法值域 -1/0/1..fretCount，越界一律置 -1 静音
  let stringsMigrated = false;
  let stringsBounded = false;
  const boundFret = (v: number): number => {
    if (Number.isFinite(v) && v >= -1 && v <= fretCount) return v;
    stringsBounded = true;
    return -1;
  };
  const strings = (chord.strings as unknown[]).map(s => {
    if (Array.isArray(s)) {
      // 旧形态：二维元组 → 转对象，并置位「已迁移」
      stringsMigrated = true;
      return {
        fret: typeof s[0] === 'number' && Number.isFinite(s[0]) ? boundFret(s[0]) : -1,
        preferFlat: Boolean(s[1]),
      };
    }
    // 当前形态：对象。**不得置位 `stringsMigrated`** —— 那会让每个已规范化的和弦
    // 每次载入都被判为「已变更」而反复写盘（与横按 `[] !== undefined` 是同一类误判）。
    const cur = s as { fret?: number; preferFlat?: boolean; isRoot?: boolean };
    return { fret: typeof cur?.fret === 'number' ? boundFret(cur.fret) : -1, preferFlat: Boolean(cur?.preferFlat) };
  }) as GuitarStringsModel;

  // 迁移：旧数据每根弦各自维护 isRoot，统一为单点 rootStringIndex
  let rootStringIndex = (chord.rootStringIndex ?? null) as StringIndex | null;
  const legacyRoots = (chord.strings as unknown[])
    .map((s, idx) => ((s as { isRoot?: boolean }).isRoot ? idx : -1))
    .filter(idx => idx >= 0);
  if (rootStringIndex === null && legacyRoots.length > 0)
    // legacyRoots 是弦索引数组（0~5），取首个后收窄
    rootStringIndex = (legacyRoots[0] ?? null) as StringIndex | null;

  // 校验：rootStringIndex 必须落在有效且已按音的弦上，否则清空
  if (
    rootStringIndex !== null &&
    (rootStringIndex < 0 ||
      rootStringIndex >= strings.length ||
      strings[rootStringIndex]?.fret === undefined ||
      strings[rootStringIndex]!.fret < 0)
  )
    rootStringIndex = null;

  // 清理旧字段：和弦级 isInverted / fingerprint / chordName（现已由 nameSegments 替代）及旧的 capo
  const legacyChord = chord as unknown as {
    isInverted?: boolean;
    fingerprint?: string;
    chordName?: string;
    capo?: unknown;
  };
  let fieldsCleaned = false;
  if (
    'isInverted' in legacyChord ||
    'fingerprint' in legacyChord ||
    'chordName' in legacyChord ||
    'capo' in legacyChord
  ) {
    fieldsCleaned = true;
    delete legacyChord.isInverted;
    delete legacyChord.fingerprint;
    delete legacyChord.capo;
  }

  // 横按规范化：过滤非法条目与物理非法项，合并重叠与包含关系
  const rawBarres = normalizeBarres(chord.barres, strings.length);
  const finalBarres = normalizeAndMergeBarres(rawBarres, strings);

  const barresChanged = barresForCompare(chord.barres) !== barresForCompare(finalBarres);

  let { nameSegments } = chord;
  let nameMigrated = false;
  let nameRepaired = false;
  if (nameSegments === undefined) {
    nameMigrated = true;
    const rawName = legacyChord.chordName?.trim() || '';
    nameSegments = rawName ? (nameToSegments(rawName) ?? null) : null;
  } else if (nameSegments) {
    // 存量修复：extensions 可能因历史缺陷被落盘成 {0,1} 普通对象，载入即重建为元组，
    // 否则任何一次取名/指纹/渲染都会抛 not iterable（读取路径不会自愈，只归一化 undefined 分支）。
    const fixedExtensions = repairExtensions(nameSegments.extensions);
    if (fixedExtensions !== nameSegments.extensions) {
      nameRepaired = true;
      const repaired: typeof nameSegments = { ...nameSegments };
      if (fixedExtensions) repaired.extensions = fixedExtensions;
      else delete repaired.extensions;
      nameSegments = repaired;
    }

    // 存量迁移：把「性质 + 散装张力音」的旧分片重解析为**性质整词**的新分片。
    //
    // 旧解析路径先用张力正则剥走 `#b数字`，于是 `Cm7b5` 落盘成
    // `{ quality: 'm7', extensions: [[5,-1]] }` —— 半减七被拆成「小七 + 降五」两半。
    // 新解析器把 `m7b5` 当**一个 token**整体识别，落盘成 `{ quality: 'm7b5' }`。
    // 两种形态渲染全称时结果相同（都是 `Cm7b5`），但简写不同：
    // 旧形态下 `m7` 走小七简写、`b5` 单挂尾部，简写模式会显示 `Cm7b5` 而非 `Cø7`。
    //
    // 这正是当初在 `segmentsToString` / `vChordName` 各补一处正则特判要救的问题。
    // 那两处特判已删除，改为在这里**一次性迁移**：把旧分片渲染回名字串、再交新解析器，
    // 即得规范形态。迁移是幂等的 —— 新分片重渲染再解析必然与自身一致，
    // 故第二次载入 `changed` 即为 false，不会反复写盘。
    //
    // 仅在「有性质且有扩展音」时才走这条路径：这是旧形态**唯一**可能与新形态不同的组合
    // （三和弦/纯七和弦等没有扩展音，新旧分片完全一致），避免给全库每次载入都加一遍重解析。
    if (nameSegments.quality && nameSegments.extensions && nameSegments.extensions.length > 0) {
      const rendered = segmentsToString(nameSegments);
      const reparsed = rendered ? nameToSegments(rendered) : null;
      if (reparsed && !areSegmentsEqual(reparsed, nameSegments)) {
        nameRepaired = true;
        nameSegments = reparsed;
      }
    }
  }
  delete legacyChord.chordName;

  /** 回写判据分两类：清洗步骤就地置位的脏标记，与字段级归一结果同入参的差异。任一命中即数据形态已变 */
  const dirtyFromCleaning =
    stringsMigrated || stringsBounded || nameMigrated || nameRepaired || fieldsCleaned || barresChanged;
  const differsFromInput =
    chord.fretOffset !== fretOffset ||
    chord.tuning !== tuning ||
    chord.fretCount !== fretCount ||
    chord.rootStringIndex !== rootStringIndex;
  const changed = dirtyFromCleaning || differsFromInput;
  if (!changed) return { chord, changed: false };
  return {
    // 展开 T 后只覆盖 T 本就存在的字段（值已归一），结构上仍是 T，故此处窄化安全
    chord: {
      ...chord,
      nameSegments,
      fretOffset,
      tuning,
      fretCount,
      rootStringIndex,
      strings,
      ...(finalBarres !== undefined ? { barres: finalBarres } : {}),
    } as T,
    changed: true,
  };
};
