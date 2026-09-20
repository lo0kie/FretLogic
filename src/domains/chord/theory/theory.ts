import { GroupSortRule } from '@/domains/chord/types';
import { estimateValueBytes } from '@/platform/utils/common';
import { createLruCache } from '@/platform/utils/lruCache';

import { analyzeBestRootPitch } from './chordEngine.ts';
import { isHalfDiminished, QUALITY_TOKENS, qualityKindOfAst } from './chordQualityAst';
import { findTokenByAst, parseQualityText, renderQualityAst } from './chordQualityAstParse';
import { isSelfConsistentQualityAst } from './chordQualityAstSemantics';

import type { ChordQualityAst } from './chordQualityAst';
import type {
  AccidentalType,
  Chord,
  ChordId,
  ChordNameSegments,
  ExtensionSegment,
  GroupId,
  NaturalPitchLetter,
  NoteInput,
  RootSegment,
} from '@/domains/chord/types';
import type { BarreEntity, GuitarStringEntity, GuitarStringsModel } from '@/domains/fretboard/types';
import type { SegmentOption } from '@/platform/ui/segmented/segmentOption';

/** 接受"和弦实体或名称字符串"的通用入参形态，统一多处多态签名 */
export type ChordOrName = { nameSegments?: ChordNameSegments | null; chordName?: string };

const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
/** 调性键名选项（升号调/降号调按常见记谱习惯混合） */
export const KEY_OPTIONS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

// 4 弦预设：尤克里里 (G4 C4 E4 A4)、电贝斯 (E1 A1 D2 G2)、贝斯 Drop D (D1 A1 D2 G2)
const TUNING_MAPPING_UKULELE = Object.freeze([67, 60, 64, 69] as const);
const TUNING_MAPPING_BASS_STANDARD = Object.freeze([28, 33, 38, 43] as const);
const TUNING_MAPPING_BASS_DROP_D = Object.freeze([26, 33, 38, 43] as const);

// 6 弦常规吉他预设
const TUNING_MAPPING_STANDARD = Object.freeze([40, 45, 50, 55, 59, 64] as const);
const TUNING_MAPPING_DROP_D = Object.freeze([38, 45, 50, 55, 59, 64] as const);
const TUNING_MAPPING_DADGAD = Object.freeze([38, 45, 50, 55, 57, 62] as const);
const TUNING_MAPPING_OPEN_G = Object.freeze([38, 43, 50, 55, 59, 62] as const);
const TUNING_MAPPING_HALF_STEP = Object.freeze([39, 44, 49, 54, 58, 63] as const);
const TUNING_MAPPING_OPEN_D = Object.freeze([38, 45, 50, 54, 57, 62] as const);
const TUNING_MAPPING_OPEN_C = Object.freeze([36, 43, 48, 55, 60, 64] as const);
const TUNING_MAPPING_DROP_C = Object.freeze([36, 43, 48, 53, 57, 62] as const);

// 7 弦与 8 弦重型/扩展音域预设
const TUNING_MAPPING_SEVEN_STANDARD = Object.freeze([35, 40, 45, 50, 55, 59, 64] as const);
const TUNING_MAPPING_SEVEN_DROP_A = Object.freeze([33, 40, 45, 50, 55, 59, 64] as const);
const TUNING_MAPPING_EIGHT_STANDARD = Object.freeze([30, 35, 40, 45, 50, 55, 59, 64] as const);
const TUNING_MAPPING_EIGHT_DROP_E = Object.freeze([28, 35, 40, 45, 50, 55, 59, 64] as const);

export const DEFAULT_TUNING_MAPPING = TUNING_MAPPING_STANDARD;

export enum Tuning {
  // 4 弦
  UKULELE_STANDARD = 'UKULELE_STANDARD',
  BASS_STANDARD = 'BASS_STANDARD',
  BASS_DROP_D = 'BASS_DROP_D',
  // 6 弦
  STANDARD = 'STANDARD',
  DROP_D = 'DROP_D',
  DADGAD = 'DADGAD',
  OPEN_G = 'OPEN_G',
  HALF_STEP = 'HALF_STEP',
  OPEN_D = 'OPEN_D',
  OPEN_C = 'OPEN_C',
  DROP_C = 'DROP_C',
  // 7 弦
  SEVEN_STANDARD = 'SEVEN_STANDARD',
  SEVEN_DROP_A = 'SEVEN_DROP_A',
  // 8 弦
  EIGHT_STANDARD = 'EIGHT_STANDARD',
  EIGHT_DROP_E = 'EIGHT_DROP_E',
}

export interface TuningPreset {
  name: string;
  stringCount: number;
  mapping: readonly number[];
}

export const TUNING_PRESETS: Record<Tuning, TuningPreset> = {
  // 4 弦
  [Tuning.UKULELE_STANDARD]: {
    name: 'Ukulele Standard (GCEA)',
    stringCount: 4,
    mapping: TUNING_MAPPING_UKULELE,
  },
  [Tuning.BASS_STANDARD]: {
    name: 'Bass Standard (EADG)',
    stringCount: 4,
    mapping: TUNING_MAPPING_BASS_STANDARD,
  },
  [Tuning.BASS_DROP_D]: {
    name: 'Bass Drop D (DADG)',
    stringCount: 4,
    mapping: TUNING_MAPPING_BASS_DROP_D,
  },
  // 6 弦
  [Tuning.STANDARD]: {
    name: 'Standard (EADGBE)',
    stringCount: 6,
    mapping: TUNING_MAPPING_STANDARD,
  },
  [Tuning.DROP_D]: {
    name: 'Drop D (DADGBE)',
    stringCount: 6,
    mapping: TUNING_MAPPING_DROP_D,
  },
  [Tuning.DADGAD]: {
    name: 'DADGAD',
    stringCount: 6,
    mapping: TUNING_MAPPING_DADGAD,
  },
  [Tuning.OPEN_G]: {
    name: 'Open G (DGDGBD)',
    stringCount: 6,
    mapping: TUNING_MAPPING_OPEN_G,
  },
  [Tuning.HALF_STEP]: {
    name: 'Half Step Down',
    stringCount: 6,
    mapping: TUNING_MAPPING_HALF_STEP,
  },
  [Tuning.OPEN_D]: {
    name: 'Open D (DADF#AD)',
    stringCount: 6,
    mapping: TUNING_MAPPING_OPEN_D,
  },
  [Tuning.OPEN_C]: {
    name: 'Open C (CGCGCE)',
    stringCount: 6,
    mapping: TUNING_MAPPING_OPEN_C,
  },
  [Tuning.DROP_C]: {
    name: 'Drop C (CGCFAD)',
    stringCount: 6,
    mapping: TUNING_MAPPING_DROP_C,
  },
  // 7 弦
  [Tuning.SEVEN_STANDARD]: {
    name: '7-String Standard (BEADGBE)',
    stringCount: 7,
    mapping: TUNING_MAPPING_SEVEN_STANDARD,
  },
  [Tuning.SEVEN_DROP_A]: {
    name: '7-String Drop A (AEADGBE)',
    stringCount: 7,
    mapping: TUNING_MAPPING_SEVEN_DROP_A,
  },
  // 8 弦
  [Tuning.EIGHT_STANDARD]: {
    name: '8-String Standard (F#BEADGBE)',
    stringCount: 8,
    mapping: TUNING_MAPPING_EIGHT_STANDARD,
  },
  [Tuning.EIGHT_DROP_E]: {
    name: '8-String Drop E (EBEADGBE)',
    stringCount: 8,
    mapping: TUNING_MAPPING_EIGHT_DROP_E,
  },
};

/** 各弦数对应的默认标准调弦方案 */
export const DEFAULT_TUNING_BY_STRING_COUNT: Record<number, Tuning> = {
  4: Tuning.UKULELE_STANDARD,
  6: Tuning.STANDARD,
  7: Tuning.SEVEN_STANDARD,
  8: Tuning.EIGHT_STANDARD,
};

/** 根据弦数获取对应的默认调弦方案（超出特定预设时兜底为 6 弦标准） */
export const getDefaultTuningForStringCount = (stringCount: number): Tuning =>
  DEFAULT_TUNING_BY_STRING_COUNT[stringCount] ?? Tuning.STANDARD;

/** 根据弦数筛选匹配的调弦枚举列表 */
export const getTuningsByStringCount = (stringCount: number): Tuning[] =>
  (Object.keys(TUNING_PRESETS) as Tuning[]).filter(t => TUNING_PRESETS[t]?.stringCount === stringCount);

/** 弦数超过预设时的向下延伸音程：吉他族标准调弦的相邻低弦为纯四度（5 半音） */
const LOWER_STRING_INTERVAL = 5;

/**
 * 取指定调弦下覆盖 stringCount 根弦的空弦音高数组（低→高）。
 *
 * 调弦预设只覆盖 4/6/7/8 弦，其余弦数（编辑器允许 3~10）原先一律回落到 6 弦标准映射，
 * 多出来的弦靠 `calcPitchIndex` 里的 `baseStrings[sIdx] ?? 0` 兜底 —— 第 7 根起音高静默塌成 0，
 * 使 9/10 弦和弦的识别、分析面板与转位判定全部失真。
 * 这里按吉他族惯例向下补纯四度（EADGBE → BEADGBE → F#BEADGBE，与 9 弦标准调弦一致）；
 * 弦数少于预设时截取低音侧（EADGBE 取 3 根 → EAD）。
 */
export const getBaseStringsFor = (tuning: Tuning | string, stringCount: number): readonly number[] => {
  const base = TUNING_PRESETS[tuning as Tuning]?.mapping ?? DEFAULT_TUNING_MAPPING;
  if (stringCount === base.length) return base;
  if (stringCount < base.length) return base.slice(0, stringCount);

  const extended: number[] = [];
  let lowest = base[0] ?? 0;
  for (let i = base.length; i < stringCount; i++) {
    lowest -= LOWER_STRING_INTERVAL;
    extended.unshift(lowest);
  }
  return [...extended, ...base];
};

/**
 * 调弦是否「重入」（reentrant）：弦序最小的弦并非物理最低音。
 * 典型是尤克里里 GCEA —— 弦 0 的 G4(67) 高于弦 1 的 C4(60)，
 * 此时「按弦序取第一根非静音弦当低音」得到的不是真正的低音。
 * 用于决定识别器取低音的口径（见 chordEngine 的 bassByPitch）。
 */
export const isReentrantTuning = (tuning: Tuning | string): boolean => {
  const preset = TUNING_PRESETS[tuning as Tuning];
  const mapping = getBaseStringsFor(tuning, preset?.stringCount ?? DEFAULT_TUNING_MAPPING.length);
  return mapping.length > 1 && mapping[0] !== Math.min(...mapping);
};

const ACCIDENTAL_PITCH = Object.freeze([false, true, false, true, false, false, true, false, true, false, true, false]);
/** 判断相对根音的音程是否属于和弦特征音（根音/小三/大三/纯五度）。 */
const isChordToneRelative = (rel: number) => rel === 0 || rel === 3 || rel === 4 || rel === 7;

/** 判断弦是否为静音态（品位 -1）。 */
export const isMuted = (s: GuitarStringEntity) => s.fret === -1;
/** 判断弦是否为空弦态（品位 0）。 */
export const isOpen = (s: GuitarStringEntity) => s.fret === 0;
/** 创建默认琴弦实体：{ fret: -1（静音）, preferFlat: false（升号偏好） } */
export const createString = (): GuitarStringEntity => ({ fret: -1, preferFlat: false });

// 自然字母（不含升降号），按 preferFlat 选择拼写对应的基础字母
const NATURAL_LETTER_SHARP = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
const NATURAL_LETTER_FLAT = ['C', 'D', 'D', 'E', 'E', 'F', 'G', 'G', 'A', 'A', 'B', 'B'];

/** 标准调性乐理与五度圈中各半音音级的默认降号偏好（3: Eb, 10: Bb 默认降号；1: C#, 6: F#, 8: G# 默认升号） */
export const DEFAULT_PITCH_PREFER_FLAT = Object.freeze([
  false, // 0: C
  false, // 1: C#
  false, // 2: D
  true, // 3: Eb
  false, // 4: E
  false, // 5: F
  false, // 6: F#
  false, // 7: G
  false, // 8: G#
  false, // 9: A
  true, // 10: Bb
  false, // 11: B
] as const);

/** 根据音级索引（0~11）获取默认升降号偏好（true 为降号，false 为升号） */
export const getDefaultPreferFlatForPitch = (pitchIndex: number): boolean =>
  DEFAULT_PITCH_PREFER_FLAT[((pitchIndex % 12) + 12) % 12] ?? false;

/** 计算某弦的音名（自然字母，不含升降号）与是否为变化音级（黑键）。由 pitch + preferFlat 派生。 */
export const computeStringLabelAccidental = (
  sIdx: number,
  fretVal: number,
  fretOffset: number = 0,
  preferFlat: boolean = false,
  baseStrings: readonly number[] = DEFAULT_TUNING_MAPPING
): { label: string; isAccidental: boolean } => {
  if (fretVal < 0) return { label: '', isAccidental: false };
  const pitchIndex = calcPitchIndex(sIdx, fretVal, fretOffset, baseStrings);
  const isAccidental = isAccidentalNote(pitchIndex);
  const label = (preferFlat ? NATURAL_LETTER_FLAT : NATURAL_LETTER_SHARP)[pitchIndex] ?? '';
  return { label, isAccidental };
};

/** 格式化某弦的完整音名（如 "C#" / "Bb"）。fret < 0 时返回 ✕。由 pitch 实时派生，不依赖存储字段 */
export const formatStringLabel = (
  sIdx: number,
  fretVal: number,
  preferFlat: boolean = false,
  fretOffset: number = 0,
  baseStrings: readonly number[] = DEFAULT_TUNING_MAPPING
): string => {
  if (fretVal < 0) return '✕';
  const { label, isAccidental } = computeStringLabelAccidental(sIdx, fretVal, fretOffset, preferFlat, baseStrings);
  return composeNoteLabel(label, isAccidental, preferFlat);
};

/** 组装显示用音名：label + isAccidental + preferFlat 拼装（与 calcNoteLabel 一致，使用 #/b） */
export const composeNoteLabel = (label: string, isAccidental: boolean, preferFlat: boolean): string =>
  isAccidental ? label + (preferFlat ? 'b' : '#') : label;

/** 计算某弦某品的 MIDI 音高（空弦基准音 + 品位 + 把位偏移）。 */
export const calcNoteMidi = (
  sIdx: number,
  fretVal: number,
  fretOffset: number = 0,
  baseStrings: readonly number[] = DEFAULT_TUNING_MAPPING
): number => {
  const base = baseStrings[sIdx] ?? 0;
  const actualOffset = fretVal > 0 && fretOffset > 0 ? fretOffset : 0;
  return base + fretVal + actualOffset;
};

/** 由 MIDI 音高取模得到 0~11 的音级索引（八度无关）。 */
export const calcPitchIndex = (
  sIdx: number,
  fretVal: number,
  fretOffset: number = 0,
  baseStrings: readonly number[] = DEFAULT_TUNING_MAPPING
): number => {
  return calcNoteMidi(sIdx, fretVal, fretOffset, baseStrings) % 12;
};

/** 判断音级是否为变化音（黑键，存在升降号拼写）。 */
export const isAccidentalNote = (pitchIndex: number): boolean =>
  ACCIDENTAL_PITCH[((pitchIndex % 12) + 12) % 12] ?? false;

/** 判断某弦某品是否可切换升降号拼写（仅变化音级可切换，静音弦除外）。 */
export const canTogglePitchAccidental = (
  sIdx: number,
  fretVal: number,
  fretOffset: number = 0,
  baseStrings: readonly number[] = DEFAULT_TUNING_MAPPING
): boolean => {
  if (fretVal < 0) return false;
  const pitchIndex = calcPitchIndex(sIdx, fretVal, fretOffset, baseStrings);
  return isAccidentalNote(pitchIndex);
};

/** 计算某弦某品的音名标签（按 preferFlat 选择升号/降号记法），静音弦返回 ✕。 */
export const calcNoteLabel = (
  sIdx: number,
  fretVal: number,
  fretOffset: number = 0,
  preferFlat: boolean = false,
  baseStrings: readonly number[] = DEFAULT_TUNING_MAPPING
): string => {
  if (fretVal === -1) return '✕';
  const noteIndex = calcPitchIndex(sIdx, fretVal, fretOffset, baseStrings);
  return preferFlat ? (NOTES_FLAT[noteIndex] ?? '') : (NOTES_SHARP[noteIndex] ?? '');
};

// 补齐等音异名（E#/Fb/B#/Cb），让根音解析对少见但合法的记谱更健壮
export const ROOT_PITCH_MAP: Record<string, number> = {
  'C': 0,
  'C#': 1,
  'Db': 1,
  'D': 2,
  'D#': 3,
  'Eb': 3,
  'E': 4,
  'E#': 5,
  'Fb': 4,
  'F': 5,
  'F#': 6,
  'Gb': 6,
  'G': 7,
  'G#': 8,
  'Ab': 8,
  'A': 9,
  'A#': 10,
  'Bb': 10,
  'B': 11,
  'B#': 0,
  'Cb': 11,
};

/** 解析结果：根音音高（可能为 99 = 无法解析），斜杠低音音高（可能为 99 = 无斜杠） */
export interface ParsedChordName {
  rootLabel: string;
  rootPitch: number;
  /** 斜杠低音（如 C/E 的 E），无斜杠时为 99 */
  bassLabel: string;
  bassPitch: number;
  /** 是否存在斜杠低音 */
  hasBass: boolean;
  /** 斜杠后的后缀（和弦性质，如 m7/6/sus4） */
  suffix: string;
  /**
   * 已识别的标准性质（来自 nameToSegments 的 token 表写法）；无性质/未知性质时为 undefined。
   *
   * 类型是 `string` 而非旧枚举联合 —— 值域真相源已从手抄的 `CHORD_QUALITIES`
   * 迁到 `QUALITY_TOKENS`，后者刻意收录了枚举里没有的同义写法（`min7b5` / `7#5` /
   * `Maj7(b5)` …），把它们排除在外正是「能输入却判非法」的来源。
   */
  quality?: string;
}

/**
 * 格式化升降号：统一支持数字（1/-1）、字符（# / b / ♯ / ♭）输入
 */
export const formatAccidental = (acc: AccidentalType | string | number | undefined, useUnicode = true): string => {
  if (acc === 1 || acc === '1' || acc === '#' || acc === '♯') return useUnicode ? '♯' : '#';
  if (acc === -1 || acc === '-1' || acc === 'b' || acc === '♭') return useUnicode ? '♭' : 'b';
  return '';
};

/**
 * 拆解音名标签为基础字母与升降号（如 "C#" -> { letter: "C", accidental: "♯" }）
 */
export const parseNoteLabel = (label: string, useUnicode = true): { letter: string; accidental: string } => {
  if (!label) return { letter: '', accidental: '' };
  const letter = label[0] || '';
  const accChar = label.slice(1);
  const accidental = formatAccidental(accChar, useUnicode);
  return { letter, accidental };
};

/** 将音名字符串（如 "C#", "Db", "F♯", "G"）解析为 RootSegment 元组 [natural, accidental] */
export const parsePitchSegment = (pitchStr: string): RootSegment | null => {
  if (!pitchStr) return null;
  const match = pitchStr.match(/^([A-G])([#b♯♭])?$/i);
  if (!match) return null;
  const natural = match[1]!.toUpperCase() as NaturalPitchLetter;
  const accChar = match[2];
  const accidental: AccidentalType =
    accChar === '#' || accChar === '♯' ? 1 : accChar === 'b' || accChar === '♭' ? -1 : 0;
  return [natural, accidental];
};

/** 序列化 PitchSegment 为字符串 */
export const pitchSegmentToString = (seg: RootSegment, useUnicode = false): string => {
  const [natural, acc] = seg;
  return `${natural}${formatAccidental(acc, useUnicode)}`;
};

/** 和弦名归一键：去首尾空白 + 全角括号转半角。
 *  分片 / 解析 / 根音三层缓存共用同一键空间——否则同一串名字（如「C（m7）」与「C(m7)」）
 *  会在各层分别占位，层级之间还可能互相击穿，白占条数。
 *  刻意不做大小写折叠：解析结果的 rootLabel 保留原文大小写（'cm7' 与 'Cm7' 的显示本就不同），
 *  折叠会让先写入者的形态改写另一方的显示。 */
const toChordNameKey = (chordName: string): string => chordName.trim().replace(/（/g, '(').replace(/）/g, ')');

// 以下是纯文本级小数据缓存（键为和弦名、值为几十~几百字节的结构/字符串）：
// 条数上限按「一个乐库里不同和弦名的量级」放宽到 4096，避免整库渲染时反复击穿导致解析重算
const nameSegmentsCache = createLruCache<ChordNameSegments | null>(4096, {
  name: '和弦名分词',
  weigh: (_, value) => estimateValueBytes(value),
});

/** 将任意和弦名文本解析为结构化分片 ChordNameSegments */
export const nameToSegments = (chordName: string): ChordNameSegments | null => {
  if (!chordName || typeof chordName !== 'string') return null;
  const normalized = toChordNameKey(chordName);
  const cached = nameSegmentsCache.get(normalized);
  if (cached !== undefined) return cached;

  // 1. 根音：从开头提取 [A-G][#b♯♭]?
  const rootMatch = normalized.match(/^([A-G][#b♯♭]?)/i);
  if (!rootMatch) {
    nameSegmentsCache.set(normalized, null);
    return null;
  }
  const root = parsePitchSegment(rootMatch[1]!);
  if (!root) {
    nameSegmentsCache.set(normalized, null);
    return null;
  }

  let remaining = normalized.slice(rootMatch[0].length);

  // 2. 斜杠低音：从末尾提取 /[A-G][#b♯♭]?（注意避免将 6/9 中的 /9 误判为斜杠低音）
  let bass: RootSegment | undefined = undefined;
  const bassMatch = remaining.match(/\/([A-G][#b♯♭]?)$/i);
  if (bassMatch && bassMatch.index !== undefined) {
    const parsedBass = parsePitchSegment(bassMatch[1]!);
    if (parsedBass) {
      bass = parsedBass;
      remaining = remaining.slice(0, bassMatch.index);
    }
  }

  const rest = remaining.trim();

  // 性质与张力音的切分（D10-A：以 AST token 表为 SSOT，不再用正则剥离张力音）。
  //
  // 半减七（m7b5 / m7(b5) / m7♭5 / ø7 …）是**一个完整的整质量**，整体保留为 'm7b5'——
  // 它的 b5 与真实张力音语法同形，若走「剥离张力」逻辑会被剥成 'm7' + b5 扩展音，
  // 使 CHORD_QUALITIES 里的 'm7b5' 成为自动解析永远产不出的死枚举。故先判 AST 是否为半减七。
  //
  // 其余写法一律取 AST 结果：整词命中（7b5 / 7#9 / 7(b9) / mb5 / no3 …）→ quality 即该 token 的
  // 标准写法（括号收敛、同义词取首选），不产生 extensions；组合写作（maj7#9 / sus4add9#11 …）→
  // 基础写法作 quality，张力音落 extensions。旧持久化形态（quality:'7' + extensions:[[9,1]]）
  // 由 normalizeChord 一次性迁移。
  const nameAst = parseQualityText(rest);
  // 下面三个分支（半减七 / 已识别 / 未识别）互斥且穷尽，quality 必被赋值——
  // 故不写初始值（写了也是死赋值，触发 eslint no-useless-assignment）
  let quality: string;
  const extensions: ExtensionSegment[] = [];

  if (isHalfDiminished(nameAst.ast)) {
    // 半减七：整体输出 'm7b5'，尾随扩展音（如 m7b5(b9)）照常单列
    quality = 'm7b5';
    for (const ext of nameAst.trailing) {
      extensions.push([Number(ext.degree), ext.accidental]);
    }
  } else if (nameAst.recognized) {
    // 取 AST 整词 quality（与半减七分支同源），不再手写正则剥离张力音（D10-A）：
    // - 整词命中（7#9 / 7b5 / 7b9 / 7#11 / no3 …）→ 经 renderQualityAst 归一到标准写法
    //   （括号收敛为无括号、同义写法取首选拼写），trailing 为空、不产生 extensions；
    // - 组合写作（maj7#9 / sus4add9#11 …）→ spelling 即基础写法，张力音在 trailing 单独列出。
    // 空性质串（裸三和弦 C）保持 quality=''。
    quality =
      nameAst.spelling === ''
        ? ''
        : nameAst.tokenId !== undefined
          ? renderQualityAst(nameAst.ast, { tokenId: nameAst.tokenId, spelling: nameAst.spelling })
          : nameAst.spelling;
    for (const ext of nameAst.trailing) {
      extensions.push([Number(ext.degree), ext.accidental]);
    }
  } else {
    // 性质无法识别：保留原始文本，落 unknownQuality 兜底（与旧行为一致，isValidChordName 据此判非法）
    quality = rest;
  }

  const result: ChordNameSegments = {
    root,
    // 已知性质收窄为 ChordQuality；未知残余降级落 unknownQuality（仅展示兜底）。
    // 张力整词（7#9 / 7b5 / no3 …）不在 KNOWN_QUALITIES 白名单里，但已被 AST 识别（recognized），
    // 属合法性质，一并收作 quality —— 否则会落入 unknownQuality，isValidChordName 据此误判为非法（D10-A）。
    ...(quality
      ? KNOWN_QUALITIES_SET.has(quality.toLowerCase()) || nameAst.recognized
        ? { quality: quality as ChordNameSegments['quality'] }
        : { unknownQuality: quality }
      : {}),
    extensions: extensions.length > 0 ? extensions : undefined,
    bass: bass ?? undefined,
  };
  nameSegmentsCache.set(normalized, result);
  return result;
};

/**
 * 已知的标准乐理和弦性质写法集合（供 UI / 文档列举用）。
 *
 * 注意：**校验路径已不再使用它**。合法性的判据是「解析器能否识别」
 * （见 `nameToSegments` 与 `isValidChordName`），因为合法写法是**可组合**的——
 * `sus4add9` 由 `sus4` 拼上 `add9` 生成，不可能被任何有限清单枚举完整。
 * 本常量保留用于「有哪些标准写法」这类列举场景，值域真相源是 `QUALITY_TOKENS`。
 */
export const KNOWN_QUALITIES: string[] = [
  '',
  'm',
  'min',
  '-',
  'maj',
  'Maj',
  'M',
  'Δ',
  '7',
  'maj7',
  'Maj7',
  'M7',
  'Δ7',
  'm7',
  'min7',
  '-7',
  'dim',
  'dim7',
  '°',
  '°7',
  'aug',
  'aug7',
  '+',
  '+7',
  'sus',
  'sus4',
  'sus2',
  '7sus4',
  '7sus2',
  '7sus',
  '9sus4',
  '9sus2',
  '9sus',
  '11sus4',
  '11sus2',
  '11sus',
  '13sus4',
  '13sus2',
  '13sus',
  '5',
  '6',
  'm6',
  'min6',
  '-6',
  '6/9',
  '69',
  'm6/9',
  'm69',
  'min6/9',
  'add9',
  'add2',
  'add4',
  'add11',
  'add13',
  'madd9',
  'madd11',
  'madd13',
  'madd4',
  'madd2',
  '9',
  'm9',
  'min9',
  '-9',
  'maj9',
  'Maj9',
  'M9',
  'Δ9',
  '11',
  'm11',
  'min11',
  '-11',
  'maj11',
  'Maj11',
  'M11',
  'Δ11',
  '13',
  'm13',
  'min13',
  '-13',
  'maj13',
  'Maj13',
  'M13',
  'Δ13',
  'm7b5',
  'm7(b5)',
  'ø',
  'ø7',
  'mMaj7',
  'mmaj7',
  'mM7',
  'mΔ7',
  '-M7',
  '-Δ7',
  'mMaj9',
  'mmaj9',
  'mM9',
  'mΔ9',
  '-M9',
  '-Δ9',
  'mMaj11',
  'mmaj11',
  'mM11',
  'mΔ11',
  '-M11',
  '-Δ11',
  'mMaj13',
  'mmaj13',
  'mM13',
  'mΔ13',
  '-M13',
  '-Δ13',
  'dimMaj7',
  'dimmaj7',
  '°M7',
  '°Δ7',
  'augMaj7',
  'augmaj7',
  '+M7',
  '+Δ7',
  'alt',
  '7alt',
  'no3',
  '(no3)',
  'no5',
  '(no5)',
];

const KNOWN_QUALITIES_SET = new Set(KNOWN_QUALITIES.map(q => q.toLowerCase()));

/**
 * 校验和弦名称是否在乐理与语法上合法。
 *
 * **判据已定为「解析器能否识别」，而非「写法是否在清单内」**（此为本轮明确裁决的语义）：
 * 1. 必须能解析出有效的根音（A~G，可选升降号）
 * 2. 性质必须被性质解析器识别；识别失败落 `unknownQuality`，即判非法
 * 3. 变化/扩展音度数必须在合理范围（2~13）
 * 4. 斜杠低音必须有效（解析器已校验，解析不出即不会写入 bass）
 * 5. **字段组合必须在乐理上自洽**（见 `chordQualityAstSemantics`）：
 *    新增于「字段化 AST」之后——旧的字符串枚举表达不了这类约束，
 *    于是 `third/fifth 同时 omit`、`dim7 配非减五` 这类**能解析成功但自相矛盾**的名字
 *    此前一律被判合法（重构文档里那条未拍板的待拍板事项）。现在补上这一层。
 *
 * 为什么不再用写法白名单：合法写法是**可组合**的（`sus4` + `add9` = `sus4add9`、
 * `7` + `b13` = `7b13`），有限清单无法覆盖可生成的语言。白名单方案的实测后果是
 * `Esus4add9` / `Cmin7b5` / `C7#5` 这类**解析器明明能完整解析**的名字被判成非法 ——
 * 「能输入、却存不下」。放宽后这类名字可正常保存；代价是保存门槛略降，
 * 即接受所有解析器认识的性质写法。
 */
export const isValidChordName = (chordName: string): boolean => {
  if (!chordName || typeof chordName !== 'string') return false;
  const trimmed = chordName.trim();
  if (!trimmed) return false;

  const segments = nameToSegments(trimmed);
  if (!segments || !segments.root) return false;

  // 出现 unknownQuality 即性质未被解析器识别（合法性质一律落 quality 字段）
  if (segments.unknownQuality) {
    return false;
  }

  if (segments.extensions && segments.extensions.length > 0) {
    const validDegrees = new Set([2, 4, 5, 6, 7, 9, 11, 13]);
    const allExtsValid = segments.extensions.every(([deg]) => validDegrees.has(Number(deg)));
    if (!allExtsValid) return false;
  }

  // 语义层：解析成功不等于讲得通。空性质串（裸三和弦 `C` / `C/E`）时该函数返回 null，
  // 跳过本层——大三和弦配方恒自洽，无需判定
  const qualityAst = chordQualityAstOfName(segments.quality ?? '');
  if (qualityAst && !isSelfConsistentQualityAst(qualityAst)) {
    return false;
  }

  return true;
};

/**
 * 和弦性质简写/符号映射（如 maj7 -> M7, dim -> °, aug -> +, dimMaj7 -> °M7）。
 *
 * ⚠️ 这是**遗留的按字符串**映射表。展示层的简写渲染已统一到 `toShorthandQuality`
 * （按 token 表的配方收敛，`min`/`-`/`Δ7` 等未被本表列出的写法也能正确简写）。
 * 本表保留有两个用途：① `toShorthandQuality` 对**未识别**性质的回退；
 * ② 既有单测（`tests/domain/chordSegments.test.ts`）锁定了它的输出。
 * 注意本表 `maj` → `M` 与 AST 路径的 `major` → `''`（大三和弦简写即裸音名）并不一致，
 * 但差异只在**已识别**性质上、而该分支已由 AST 路径接管，故不影响实际显示。
 */
export const SHORTHAND_QUALITY_MAP: Record<string, string> = {
  'maj7': 'M7',
  'maj9': 'M9',
  'maj11': 'M11',
  'maj13': 'M13',
  'maj': 'M',
  'dim': '°',
  'dim7': '°7',
  'dimMaj7': '°M7',
  'dimmaj7': '°M7',
  'dim(maj7)': '°M7',
  'dim(M7)': '°M7',
  'mMaj7': 'mM7',
  'mmaj7': 'mM7',
  'm(maj7)': 'mM7',
  'm(M7)': 'mM7',
  'mMaj9': 'mM9',
  'mmaj9': 'mM9',
  'm(maj9)': 'mM9',
  'm(M9)': 'mM9',
  'mMaj11': 'mM11',
  'mmaj11': 'mM11',
  'mMaj13': 'mM13',
  'mmaj13': 'mM13',
  'augMaj7': '+M7',
  'augmaj7': '+M7',
  'aug(maj7)': '+M7',
  'm7b5': 'ø7',
  'm7(b5)': 'ø7',
  'aug': '+',
  'aug7': '+7',
  'sus4': 'sus',
  '7sus4': '7sus',
  '9sus4': '9sus',
  '11sus4': '11sus',
  '13sus4': '13sus',
};

/** 格式化和弦性质（根据是否开启简写） */
export const formatChordQuality = (quality?: string, shorthand = false): string => {
  if (!quality) return '';
  if (!shorthand) return quality;
  return SHORTHAND_QUALITY_MAP[quality] ?? SHORTHAND_QUALITY_MAP[quality.toLowerCase()] ?? quality;
};

/**
 * 性质串 → 简写写法。**简写渲染的唯一实现**。
 *
 * `segmentsToString` 与 `vChordName` 都调它，避免出现「两套独立事实源」——
 * 那正是本次重构要消灭的问题：旧实现在两处各自维护一份简写逻辑，
 * 一处查 `SHORTHAND_QUALITY_MAP`，另一处还要额外特判 `m7` + `b5` → `ø7`。
 *
 * 主路径走 AST 渲染（与解析共用同一张 token 表）：
 * `min` / `min7` / `-7` 命中的都是同一个 token，自然收敛到同一简写；
 * 未识别的性质才回落旧映射表，保证未知输入原样透传。
 */
export const toShorthandQuality = (quality: string): string => {
  if (!quality) return '';
  const ast = parseQualityText(quality);
  if (!ast.recognized) return formatChordQuality(quality, true);
  return renderQualityAst(ast.ast, {
    shorthand: true,
    ...(ast.tokenId ? { tokenId: ast.tokenId } : {}),
    ...(ast.spelling !== undefined ? { spelling: ast.spelling } : {}),
  });
};

/** 将分片结构还原为标准和弦字符串 */
export const segmentsToString = (
  segments: ChordNameSegments,
  options: { useUnicode?: boolean; shorthand?: boolean } | boolean = false
): string => {
  const useUnicode = typeof options === 'boolean' ? options : (options.useUnicode ?? false);
  const shorthand = typeof options === 'boolean' ? false : (options.shorthand ?? false);

  const rootStr = pitchSegmentToString(segments.root, useUnicode);
  let quality = segments.quality ?? segments.unknownQuality ?? '';
  let extensions = segments.extensions ?? [];

  // 简写渲染：走写法映射表 `SHORTHAND_QUALITY_MAP`（与 `formatChordQuality` 同源），
  // 覆盖 maj→M、m7b5→ø7 等显式简写约定。
  if (shorthand) {
    // 半减七特判：quality 为 'm' / 'm7' 且带 b5 扩展音时（如结构化的 F#m7b5/A），
    // 应整体渲染为 'ø7' 并消费掉该 b5 扩展音，否则会拼成 'm7b5'（F♯m7b5/A）。
    const b5Idx = extensions.findIndex(([deg, acc]) => (deg === 5 || deg === '5') && acc === -1);
    if ((quality === 'm7' || quality === 'm') && b5Idx >= 0) {
      quality = 'ø7';
      extensions = extensions.filter((_, idx) => idx !== b5Idx);
    } else {
      quality = formatChordQuality(quality, true);
    }
  }

  // 整词 quality 自带变音（7#9 / 7b5 / m7b5 …）：偏好 unicode 时与扩展音同口径渲染为 ♯/♭，
  // 否则张力整词会在 unicode 显示下漏出 ASCII #/b（D10-A 整词化后的必要对齐）。
  if (useUnicode) quality = quality.replace(/#/g, '♯').replace(/b/g, '♭');

  const extsStr = extensions
    .map(([deg, acc]) => {
      const accStr = acc === 1 ? (useUnicode ? '♯' : '#') : acc === -1 ? (useUnicode ? '♭' : 'b') : '';
      return `${accStr}${deg}`;
    })
    .join('');
  const bassStr = segments.bass ? `/${pitchSegmentToString(segments.bass, useUnicode)}` : '';
  return `${rootStr}${quality}${extsStr}${bassStr}`;
};

/**
 * 获取和弦的标准名称字符串（以 AST nameSegments 为唯一真实源，支持 options）
 */
export const getChordName = (
  chord: (ChordOrName & { name?: string; customName?: string }) | null | undefined,
  options?: { shorthand?: boolean; useUnicode?: boolean }
): string => {
  if (!chord) return '';
  if (chord.nameSegments) return segmentsToString(chord.nameSegments, options);
  const rawName = chord.chordName || chord.name || chord.customName || '';
  if (rawName) {
    const segs = nameToSegments(rawName);
    if (segs) return segmentsToString(segs, options);
    return rawName;
  }
  return '';
};

// ===== 搜索匹配 =====
// 匹配本身是「查询词变体 × 和弦别名」的双重遍历，二者都与对方无关：
// 查询词变体只随输入变化、别名只随和弦变化，各自缓存后每键入一个字符只重算一次查询词侧。

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

  for (const name of aliases) {
    for (const q of queryVariants) {
      if (name.includes(q)) return true;
    }
  }

  return false;
};

/**
 * 解析和弦名：基于 AST 分片拆出根音、斜杠低音与和弦后缀。
 * "Bm7/A" -> { rootLabel:'B', rootPitch:11, bassLabel:'A', bassPitch:9, hasBass:true, suffix:'m7' }
 */
const parsedChordNameCache = createLruCache<ParsedChordName>(4096, {
  name: '和弦名解析',
  weigh: (_, value) => estimateValueBytes(value),
});

/**
 * 解析和弦名为结构化元数据（根音/低音音高、后缀），解析失败时返回空结果（pitch=99）。
 * @returns rootPitch 为 99 表示根音无法解析
 */
export const parseChordName = (chordName: string): ParsedChordName => {
  const empty: ParsedChordName = {
    rootLabel: '',
    rootPitch: 99,
    bassLabel: '',
    bassPitch: 99,
    hasBass: false,
    suffix: '',
  };
  if (!chordName || typeof chordName !== 'string') return empty;
  const key = toChordNameKey(chordName);
  if (!key) return empty;

  const cached = parsedChordNameCache.get(key);
  if (cached !== undefined) return cached;

  const segs = nameToSegments(key);
  if (!segs || !segs.root) {
    parsedChordNameCache.set(key, empty);
    return empty;
  }

  const rootLabel = pitchSegmentToString(segs.root, false);
  const rootPitch = ROOT_PITCH_MAP[rootLabel] ?? 99;

  let bassLabel = '';
  let bassPitch = 99;
  let hasBass = false;
  if (segs.bass) {
    hasBass = true;
    bassLabel = pitchSegmentToString(segs.bass, false);
    bassPitch = ROOT_PITCH_MAP[bassLabel] ?? 99;
  }

  const extsStr = segs.extensions
    ? segs.extensions.map(([deg, acc]) => `${acc === 1 ? '#' : acc === -1 ? 'b' : ''}${deg}`).join('')
    : '';
  const suffix = `${segs.quality ?? segs.unknownQuality ?? ''}${extsStr}`;

  const result: ParsedChordName = {
    rootLabel,
    rootPitch,
    bassLabel,
    bassPitch,
    hasBass,
    suffix,
    quality: segs.quality,
  };

  parsedChordNameCache.set(key, result);
  return result;
};

/** 取和弦名的根音音高（含斜杠低音时仍取斜杠前的根音）。
 *  直接复用 parseChordName 的解析缓存：rootPitch 本就是 ParsedChordName 的一个字段，
 *  原先另开一层 4096 条的「根音音高」缓存，等于把同一份数据按另一套键（且未做归一）再存一遍，
 *  既多一个键空间也多一次查找；合并后命中路径等价（同一名字第二次起仍是缓存直取）。 */
export const getChordRootPitch = (chordName: string): number => {
  if (!chordName) return 99;
  return parseChordName(chordName).rootPitch;
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
    if (bassPitch === -1) bassPitch = pitch;
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
    if (markedStr && markedStr.fret >= 0) {
      return calcPitchIndex(rootStringIndex, markedStr.fret, fretOffset, baseStrings);
    }
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

/**
 * 斜杠低音一致性校验：和弦名为 C/E 时，名字里的低音（E）应与指板物理最低音一致。
 * 返回 null 表示无需校验（无斜杠/无法解析）；否则返回描述不一致的文案。
 */
export const validateBassConsistency = (
  strings: GuitarStringEntity[],
  fretOffset: number = 0,
  tuning: Tuning | string = Tuning.STANDARD,
  chordOrName?: string | { nameSegments?: ChordNameSegments | null; chordName?: string }
): string | null => {
  if (!chordOrName) return null;
  const chordName = typeof chordOrName === 'string' ? chordOrName : getChordName(chordOrName);
  const parsed = parseChordName(chordName);
  if (!parsed.hasBass || parsed.bassPitch === 99) return null;
  const baseStrings = getBaseStringsFor(tuning, strings.length);
  const { bassPitch } = collectNotes(strings, fretOffset, baseStrings);
  if (bassPitch === -1) return null;
  // 音高模 12 比较（忽略八度）
  if (bassPitch % 12 !== parsed.bassPitch) {
    return `和弦名标注的低音 ${parsed.bassLabel} 与指板最低音不一致，可能导致转位判定/排序失真`;
  }
  return null;
};

/** 统计指法中相对根音的"和弦外音"（非特征音）数量，并用 12 位位掩码记录出现的音级。 */
const getColorNoteCountAndPitches = (chord: Chord, rootPitch: number) => {
  if (rootPitch === 99) return { colorNoteCount: 0, pitchMask: 0 };
  const baseStrings = getBaseStringsFor(chord.tuning, chord.strings.length);
  let pitchMask = 0;
  const strings = chord.strings;
  for (let sIdx = 0; sIdx < strings.length; sIdx++) {
    const str = strings[sIdx];
    if (str && str.fret >= 0) {
      const p = calcPitchIndex(sIdx, str.fret, chord.fretOffset, baseStrings);
      pitchMask |= 1 << p;
    }
  }
  let count = 0;
  for (let p = 0; p < 12; p++) {
    if ((pitchMask & (1 << p)) === 0) continue;
    const rel = (p - rootPitch + 12) % 12;
    if (!isChordToneRelative(rel)) count++;
  }
  return { colorNoteCount: count, pitchMask };
};

/**
 * 和弦复杂度等级（按名称后缀推断，避免指板八度重复干扰）：
 * 0 = 三和弦/基础（无 7/9/11/13），1 = 七和弦族，2 = 九和弦及以上。
 * 排序时由简到繁，保证 Em 早于 Em7/E7。
 */
const getComplexityRank = (suffix: string): number => {
  if (/(9|11|13)/.test(suffix)) return 2;
  if (/7/.test(suffix)) return 1;
  return 0;
};

/**
 * 和弦名的性质 AST 查询（带缓存）。
 *
 * 这是本文件里「性质判定」的唯一入口。此前 `isMinorFlavoredQuality` /
 * `isDimFlavoredQuality` / `qualityKindOf` 三个函数各自对**拼接出来的 suffix 字符串**
 * 跑正则（`/^(maj|M|Δ)/`、`/^(dim|°|ø|m7b5)/` …），与解析器是两套独立的事实源——
 * 解析器改一处、这三处不会跟着动，漂移只是时间问题：
 * `qualityKindOf` 里的 `m7b5` 分支就因为自动解析产不出该枚举而**从未被执行过**，
 * 半减七一直被误判成普通小调。
 *
 * 改为读 AST 后，判据只剩「字段是什么」：
 * - 减系 = `fifth === 'dim5' || seventh === 'dim7'`（读字段，不读拼写）
 * - 小调系 = `third === 'min3'`
 * - 大小调归属 = `third`，与写法完全解耦
 *
 * 于是 `C-7` / `Cmin7` / `Cm7` 三种写法必然归为同一类（它们的 AST 相同），
 * 而 `CM7` 与 `Cm7` 必然分开（AST 的 `third` 与 `seventh` 都不同）。
 */
const astByNameCache = createLruCache<ChordQualityAst | null>(4096, {
  name: '和弦性质AST',
  weigh: (_, value) => estimateValueBytes(value),
});

/**
 * 由**性质串**取出性质 AST；解析不出时返回 null。
 *
 * 入参是性质文本（`m7b5` / `7alt` / `min`），不是完整和弦名 —— 调用点传的都是
 * `segments.quality`，本就没有根音。故用 `parseQualityText` 而非 `parseChordNameAst`
 * （后者要求开头是音名，喂性质串会一律判成「无根音」而返回 null）。
 */
export const chordQualityAstOfName = (quality: string): ChordQualityAst | null => {
  if (!quality) return null;
  const key = toChordNameKey(quality);
  const cached = astByNameCache.get(key);
  if (cached !== undefined) return cached;
  const parsed = parseQualityText(key);
  const ast = parsed.recognized ? parsed.ast : null;
  astByNameCache.set(key, ast);
  return ast;
};

/**
 * 小调系判定（小三 / 小七 / 半减 / 减和弦等）。
 *
 * 用途：同根音下先按性质聚类，使 Em 与其扩展 Em7 因同属小调类而相邻，属七 E7 排在其后。
 * 减系也归入此类（旧实现的注释与行为一致：`dim/°/ø` 均返回 true）。
 */
const isMinorFlavoredQuality = (quality?: string): boolean => {
  if (!quality) return false;
  const ast = chordQualityAstOfName(quality);
  if (!ast) return false;
  return ast.third === 'min3' || ast.fifth === 'dim5' || ast.seventh === 'dim7';
};

/**
 * 减/半减性质判定。
 *
 * 直接读 AST 字段，取代旧实现遍布各处的 `/^(dim|°|ø|m7b5)/` 正则族。
 * 这条正则不仅要同时列出四种拼写，还漏掉了 `min7b5` / `-7b5` / `ø7` 等变体；
 * 读字段则天然覆盖全部写法。
 */
const isDimFlavoredQuality = (quality?: string): boolean => {
  if (!quality) return false;
  const ast = chordQualityAstOfName(quality);
  if (!ast) return false;
  return ast.fifth === 'dim5' || ast.seventh === 'dim7';
};

/** 调内性质归类：减/半减 → dim，小调类 → min，其余 → maj。与识别层共用同一份 AST 判据。 */
const qualityKindOf = (quality?: string): 'maj' | 'min' | 'dim' => {
  if (!quality) return 'maj';
  const ast = chordQualityAstOfName(quality);
  if (!ast) return 'maj';
  return qualityKindOfAst(ast);
};

const DIATONIC_INTERVALS_MASK = (1 << 0) | (1 << 2) | (1 << 4) | (1 << 5) | (1 << 7) | (1 << 9) | (1 << 11);
const DIATONIC_DEGREE_MAP = Object.freeze([1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6, 7]);

interface SortMeta {
  chord: Chord;
  name: string; // 标准全称，供并列兜底比较器复用（比较器内若现场调 getChordName 会变成 O(n log n) 次拼名）
  rootPitch: number;
  isInverted: boolean;
  colorNoteCount: number;
  complexityRank: number; // 和弦复杂度：三和弦 0 / 七和弦 1 / 九和弦+ 2
  qualityRank: number; // 同根音下性质聚类：小调类 0 / 其他 1，使 Em 与扩展 Em7 相邻
  qualityKind: 'maj' | 'min' | 'dim'; // 三和弦性质（大/小/减），用于「调内级数」校验性质是否匹配调的该级
}

/** 排序元数据缓存：元数据只由和弦自身内容决定，按对象引用缓存即可
 *  （和弦库的保存路径总是 new 出新对象、草稿是 cloneDeep 副本，故不会读到被原地改动的旧数据）。
 *  排序每次调用都要为全库每个和弦构建元数据，而列表可能因一次键入、一次切换排序规则重排多次 */
const sortMetaCache = new WeakMap<object, SortMeta>();

/** 预计算单个和弦的排序元数据（根音/转位/复杂度/性质聚类等），供排序比较器复用。 */
const buildSortMeta = (chord: Chord): SortMeta => {
  const cached = sortMetaCache.get(chord);
  if (cached) return cached;

  const name = getChordName(chord);
  const parsed = parseChordName(name);
  const rootPitch =
    parsed.rootPitch !== 99
      ? parsed.rootPitch
      : resolveChordRootPitch(chord.strings, chord.fretOffset, chord.tuning, chord, chord.rootStringIndex);
  const { colorNoteCount } = getColorNoteCountAndPitches(chord, rootPitch);
  const meta: SortMeta = {
    chord,
    name,
    rootPitch,
    isInverted: computeIsInverted(chord.strings, chord.fretOffset, chord.tuning, chord, chord.rootStringIndex),
    colorNoteCount,
    complexityRank: getComplexityRank(parsed.suffix),
    qualityRank: isMinorFlavoredQuality(parsed.quality) ? 0 : 1,
    qualityKind: qualityKindOf(parsed.quality),
  };
  sortMetaCache.set(chord, meta);
  return meta;
};

/**
 * 取和弦是否转位（走 sortMetaCache 的引用级缓存）。
 *
 * 裸调 computeIsInverted 要跑 collectNotes（逐音位算音高）+ 根音推导（名字解析或音集分析），
 * 而排序比较器在一次排序里被调用 n·log n 次、同一个和弦被反复求值 —— 同名变体排序
 * （chordGrouping 的 sortVariants）改用它之后，每个和弦只算一次；转位信息本就在排序元数据里，
 * 复用同一份缓存也避免了「两处各自记忆化、各自一套失效前提」。
 */
export const getChordIsInverted = (chord: Chord): boolean => buildSortMeta(chord).isInverted;

/** 分组排序规则选项（供 BaseSegmentedControl 等 UI 使用） */
export const SORT_RULE_CONFIG = <SegmentOption<GroupSortRule>[]>[
  { label: '调内级数', value: GroupSortRule.KEY_DEGREE },
  { label: 'C-B', value: GroupSortRule.ROOT_PITCH },
  { label: 'A-Z', value: GroupSortRule.NAME_ASC },
];

/**
 * 和弦名排序比较器（模块级单例）。
 *
 * 不用 `String.prototype.localeCompare`：后者每次调用都要重新解析默认 locale 与选项，
 * 而比较器在一次排序里会被调用 n·log n 次。`new Intl.Collator()` 不传参数即与
 * `localeCompare(b)` 语义完全一致（同为默认 locale、默认选项），只是把解析结果复用。
 */
const NAME_COLLATOR = new Intl.Collator();

/**
 * 按分组排序规则排列和弦：
 * NAME_ASC 按名称字典序；ROOT_PITCH 按根音 C-B 依次比较转位/复杂度/性质；
 * KEY_DEGREE 优先级内调内音级靠前，同度数按五度圈顺序（降 7 级在 6 级之前）。
 * 无法识别的规则返回原序副本。
 */
export const sortChordsByRule = (chords: Chord[], rule?: GroupSortRule, sortKey = 'C'): Chord[] => {
  if (chords.length <= 1) return chords.slice();
  const effectiveRule: GroupSortRule = rule ?? GroupSortRule.ROOT_PITCH;
  if (effectiveRule === GroupSortRule.NAME_ASC) {
    // 预映射 [chord, name] 后再排序：避免比较器内 O(n log n) 次重复 getChordName 拼名，
    // 与下方 ROOT_PITCH/KEY_DEGREE 分支先 buildSortMeta 再比较的预构建模式保持一致
    // （两个分支的并列兜底都取已缓存的 meta.name，比较器内不再有任何 getChordName 调用）
    return chords
      .map((chord): [Chord, string] => [chord, getChordName(chord)])
      .sort((a, b) => NAME_COLLATOR.compare(a[1], b[1]))
      .map(pair => pair[0]);
  }
  const n = chords.length;
  const mappedList: SortMeta[] = new Array(n);
  for (let i = 0; i < n; i++) {
    mappedList[i] = buildSortMeta(chords[i]!);
  }
  if (effectiveRule === GroupSortRule.ROOT_PITCH) {
    mappedList.sort((a, b) => {
      if (a.rootPitch !== b.rootPitch) return a.rootPitch - b.rootPitch;
      if (a.isInverted !== b.isInverted) return a.isInverted ? 1 : -1;
      if (a.complexityRank !== b.complexityRank) return a.complexityRank - b.complexityRank;
      if (a.qualityRank !== b.qualityRank) return a.qualityRank - b.qualityRank;
      if (a.colorNoteCount !== b.colorNoteCount) return a.colorNoteCount - b.colorNoteCount;
      return NAME_COLLATOR.compare(a.name, b.name);
    });
  } else if (effectiveRule === GroupSortRule.KEY_DEGREE) {
    // 支持大小调调名（'A' 或 'Am'）；关键音高取根音字母，小调用自然小调的三音程性质表
    const isMinorKey = /m(in)?$/i.test(sortKey.trim());
    const keyLetter = sortKey.trim().replace(/m(in)?$/i, '');
    const keyPitch = ROOT_PITCH_MAP[keyLetter] ?? 0;
    // 各级三和弦期望性质（index = degree 1~7）：大调 I/ii/iii/IV/V/vi/vii°；自然小调 i/ii°/III/iv/v/VI/VII
    const DEGREE_QUALITY = isMinorKey
      ? ['', 'min', 'dim', 'maj', 'min', 'min', 'maj', 'maj']
      : ['', 'maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'];
    mappedList.sort((a, b) => {
      let aDiatonic = false;
      let bDiatonic = false;
      let aDegree = 99;
      let bDegree = 99;
      if (a.rootPitch !== 99) {
        const ia = (a.rootPitch - keyPitch + 12) % 12;
        aDegree = DIATONIC_DEGREE_MAP[ia] ?? 99;
        // 真正的调内和弦需「根音在调内」且「三和弦性质匹配该级」：D 是大调 IV（调内），Dm 是借用 iv，不得与 D 同级
        const rootInScale = (DIATONIC_INTERVALS_MASK & (1 << ia)) !== 0;
        aDiatonic = rootInScale && a.qualityKind === DEGREE_QUALITY[aDegree];
      }
      if (b.rootPitch !== 99) {
        const ib = (b.rootPitch - keyPitch + 12) % 12;
        bDegree = DIATONIC_DEGREE_MAP[ib] ?? 99;
        const rootInScale = (DIATONIC_INTERVALS_MASK & (1 << ib)) !== 0;
        bDiatonic = rootInScale && b.qualityKind === DEGREE_QUALITY[bDegree];
      }
      if (aDiatonic !== bDiatonic) return aDiatonic ? -1 : 1;
      if (aDegree !== bDegree) return aDegree - bDegree;
      if (a.isInverted !== b.isInverted) return a.isInverted ? 1 : -1;
      if (a.complexityRank !== b.complexityRank) return a.complexityRank - b.complexityRank;
      if (a.qualityRank !== b.qualityRank) return a.qualityRank - b.qualityRank;
      if (a.colorNoteCount !== b.colorNoteCount) return a.colorNoteCount - b.colorNoteCount;
      return NAME_COLLATOR.compare(a.name, b.name);
    });
  } else {
    return chords.slice();
  }
  const out = new Array<Chord>(n);
  for (let i = 0; i < n; i++) out[i] = mappedList[i]!.chord;
  return out;
};

/** 将和弦名整体移调：根音与斜杠低音按半音数移位，后缀保持不变；无法解析时原样返回。 */
export const transposeChordName = (chordName: string, semitones: number): string => {
  const parsed = parseChordName(chordName);
  if (parsed.rootPitch === 99) return chordName;
  const shiftedRoot = NOTES_SHARP[(parsed.rootPitch + semitones + 120) % 12];
  if (parsed.hasBass && parsed.bassPitch !== 99) {
    const shiftedBass = NOTES_SHARP[(parsed.bassPitch + semitones + 120) % 12];
    return `${shiftedRoot}${parsed.suffix}/${shiftedBass}`;
  }
  return `${shiftedRoot}${parsed.suffix}`;
};

/** 计算两个调名之间的半音差，结果收敛到 [-5, 6] 区间（取最短移调路径）；无法解析时返回 0。 */
export const getKeySemitones = (key1: string, key2: string): number => {
  const p1 = getChordRootPitch(key1);
  const p2 = getChordRootPitch(key2);
  if (p1 === 99 || p2 === 99) return 0;
  let diff = p2 - p1;
  if (diff > 6) diff -= 12;
  if (diff < -5) diff += 12;
  return diff;
};

const chordFingerprintCache = new WeakMap<object, string>();

/**
 * 计算和弦指纹（名称:品位偏移:品位数:调弦:是否转位:根音标记:逐弦品位+升降偏好），
 * 用于重复和弦判定；结果按对象引用 WeakMap 缓存。
 */
export const computeChordFingerprint = (chord: {
  chordName?: string;
  nameSegments?: ChordNameSegments | null;
  fretOffset?: number;
  fretCount: number;
  tuning: Tuning | string;
  strings: GuitarStringsModel;
  rootStringIndex: number | null;
}): string => {
  if (chord && typeof chord === 'object') {
    const cached = chordFingerprintCache.get(chord);
    if (cached !== undefined) return cached;
  }
  const offset = chord.fretOffset ?? 0;
  const name = getChordName(chord);
  const isInverted = computeIsInverted(chord.strings, offset, chord.tuning, chord, chord.rootStringIndex);
  const strSig = chord.strings.map(s => `${s.fret}_${s.preferFlat ? 1 : 0}`).join('|');
  const fp = `${name.trim()}:${offset}:${chord.fretCount}:${chord.tuning}:${isInverted ? 1 : 0}:${String(chord.rootStringIndex)}:${strSig}`;
  if (chord && typeof chord === 'object') {
    chordFingerprintCache.set(chord, fp);
  }
  return fp;
};

/** 取指定调弦预设的空弦基准音高数组；未知调弦回退标准调弦。
 *  stringCount 缺省取预设自身弦数（保持既有调用语义）；传入实际弦数时按弦数延伸/截取。 */
export const getActiveBaseStrings = (tuning: Tuning, stringCount?: number) => {
  const presetCount = TUNING_PRESETS[tuning]?.stringCount;
  return getBaseStringsFor(tuning, stringCount ?? presetCount ?? DEFAULT_TUNING_MAPPING.length);
};

/** 音高半音移调运算：保证结果收敛在 [0, 11] */
export const transposePitch = (pitch: number, semitones: number): number => {
  return (((pitch + semitones) % 12) + 12) % 12;
};

/**
 * 结构化根音分片（[NaturalPitchLetter, AccidentalType]）按半音数移调
 * @param root 原始根音分片
 * @param semitones 移调半音数（正数为升，负数为降）
 * @param preferFlat 是否偏好降号（缺省时根据原始变音记号与目标音名智能判定）
 */
export const transposeRootSegment = (root: RootSegment, semitones: number, preferFlat?: boolean): RootSegment => {
  const [letter, acc] = root;
  const basePitch = ROOT_PITCH_MAP[letter] ?? 0;
  const currentPitch = (basePitch + acc + 12) % 12;
  const newPitch = transposePitch(currentPitch, semitones);

  const useFlat = preferFlat ?? (acc < 0 || (acc === 0 && (newPitch === 10 || newPitch === 3 || newPitch === 8)));
  const noteName = useFlat ? NOTES_FLAT[newPitch] : NOTES_SHARP[newPitch];
  const parsed = parsePitchSegment(noteName ?? 'C');
  return parsed ?? ['C', 0];
};

/**
 * 将和弦名分片结构整体移调（根音与斜杠低音同步移位，其余性质/扩展分片深度复制保留）
 */
export const transposeChordSegments = (
  segments: ChordNameSegments,
  semitones: number,
  preferFlat?: boolean
): ChordNameSegments => {
  const newRoot = transposeRootSegment(segments.root, semitones, preferFlat);
  const newBass = segments.bass ? transposeRootSegment(segments.bass, semitones, preferFlat) : undefined;
  return {
    root: newRoot,
    ...(segments.quality ? { quality: segments.quality } : {}),
    ...(segments.unknownQuality ? { unknownQuality: segments.unknownQuality } : {}),
    // ExtensionSegment 是元组 [degree, accidental?]，必须逐位按元组复制。
    // 曾误用 { ...e } 做「深拷贝」—— 数组摊成 {0, 1} 普通对象后不再是元组，
    // 下游所有 ([deg, acc]) => 解构（segmentsToString / vChordName / areChordsEnharmonicallyEquivalent）
    // 一律抛 "is not iterable"，且实体已入库，后续取名/指纹/渲染会连续崩。
    ...(segments.extensions ? { extensions: segments.extensions.map(e => [e[0], e[1]] as ExtensionSegment) } : {}),
    ...(newBass ? { bass: newBass } : {}),
  };
};

/**
 * 和弦实体移调
 * 模式 'update_name'（默认）：指法品位不变，更新和弦名与根音音高（适合吉他夹变调夹或保持把位分析）
 * 模式 'shift_frets'：非空弦品位整体平移 N 品（横按同步平移），适合封闭和弦把位推移
 */
export const transposeChordEntity = (
  chord: Chord,
  semitones: number,
  options?: {
    mode?: 'shift_frets' | 'update_name';
    preferFlat?: boolean;
    newId?: ChordId;
    newGroupId?: GroupId;
  }
): Chord => {
  const mode = options?.mode ?? 'update_name';
  const newSegments = chord.nameSegments
    ? transposeChordSegments(chord.nameSegments, semitones, options?.preferFlat)
    : null;

  let newStrings = chord.strings.map(s => ({ ...s }));
  let newBarres = chord.barres ? chord.barres.map(b => ({ ...b })) : undefined;

  if (mode === 'shift_frets' && semitones !== 0) {
    newStrings = newStrings.map(s => {
      if (s.fret <= 0) return s;
      const shifted = s.fret + semitones;
      // 上界钳制到 fretCount（越界不静音丢弦，保持可听）；下界仍按惯例静音
      return { fret: shifted > 0 ? Math.min(shifted, chord.fretCount) : -1, preferFlat: s.preferFlat };
    });
    if (newBarres) {
      newBarres = newBarres
        .map(b => ({ ...b, fret: (b.fret + semitones) as BarreEntity['fret'] }))
        .filter(b => b.fret > 0);
    }
  }

  const now = Date.now();
  return {
    ...chord,
    id: options?.newId ?? chord.id,
    groupId: options?.newGroupId ?? chord.groupId,
    nameSegments: newSegments,
    strings: newStrings,
    barres: newBarres,
    createdAt: now,
    updatedAt: now,
  };
};

export interface ChordDegreeResult {
  /** 罗马数字级数标注，如 'I', 'ii', 'V7', 'bVII', 'viiø7', 'I/3' */
  roman: string;
  /** 音阶音级编号 1~7，离调/无法识别为 0 */
  degree: number;
  /** 是否为调内自然和弦 */
  isDiatonic: boolean;
}

/**
 * 计算和弦在指定调性（大调或小调）下的罗马数字级数
 * @param chordOrName 和弦实体或和弦名字符串
 * @param key 调式基准名（如 'C', 'G', 'F', 'Am', 'Em', 'Bb'）
 */
/**
 * 标准性质枚举 → 罗马数字级数后缀。覆盖 CHORD_QUALITIES 全部有后缀的条目，
 * 三和弦/plain（m/min/-/maj/M/Δ/5/sus/no3/no5 等）不在此表内、默认空串（由小写为小写罗马体体现小调）。
 * 用枚举映射取代原 if-else 链，补齐 9~13 / add 家族（除 add9）/ 6 / aug7 等此前静默丢失的分支，且新增性质时编译器会强制补表。
 */
const ROMAN_SUFFIX_BY_QUALITY: Partial<Record<string, string>> = {
  '7': '7',
  'maj7': 'maj7',
  'Maj7': 'maj7',
  'M7': 'maj7',
  'Δ7': 'maj7',
  'm7': '7',
  'min7': '7',
  '-7': '7',
  'dim': '°',
  '°': '°',
  'dim7': '°7',
  '°7': '°7',
  'aug': '+',
  '+': '+',
  'aug7': '+7',
  '+7': '+7',
  '7sus4': '7sus4',
  '7sus2': '7sus2',
  '7sus': '7sus',
  'sus4': 'sus4',
  'sus2': 'sus2',
  '6': '6',
  'm6': 'm6',
  'min6': 'm6',
  '-6': 'm6',
  '6/9': '6/9',
  '69': '6/9',
  'm6/9': 'm6/9',
  'm69': 'm6/9',
  'min6/9': 'm6/9',
  'add9': 'add9',
  'madd9': 'madd9',
  'add2': 'add2',
  'madd2': 'madd2',
  'add4': 'add4',
  'madd4': 'madd4',
  'add11': 'add11',
  'madd11': 'add11',
  'add13': 'add13',
  'madd13': 'add13',
  '9': '9',
  'm9': '9',
  'min9': '9',
  '-9': '9',
  'maj9': 'maj9',
  'Maj9': 'maj9',
  'M9': 'maj9',
  'Δ9': 'maj9',
  '11': '11',
  'm11': '11',
  'min11': '11',
  '-11': '11',
  'maj11': 'maj11',
  'Maj11': 'maj11',
  'M11': 'maj11',
  'Δ11': 'maj11',
  '13': '13',
  'm13': '13',
  'min13': '13',
  '-13': '13',
  'maj13': 'maj13',
  'Maj13': 'maj13',
  'M13': 'maj13',
  'Δ13': 'maj13',
  '9sus4': '9sus4',
  '9sus2': '9sus2',
  '9sus': '9sus',
  '11sus4': '11sus4',
  '11sus2': '11sus2',
  '11sus': '11sus',
  '13sus4': '13sus4',
  '13sus2': '13sus2',
  '13sus': '13sus',
  'm7b5': 'ø7',
  'm7(b5)': 'ø7',
  'ø': 'ø',
  'ø7': 'ø7',
  'mMaj7': 'mMaj7',
  'mmaj7': 'mMaj7',
  'mM7': 'mMaj7',
  'mΔ7': 'mMaj7',
  '-M7': 'mMaj7',
  '-Δ7': 'mMaj7',
  'mMaj9': 'mMaj9',
  'mmaj9': 'mMaj9',
  'mM9': 'mMaj9',
  'mΔ9': 'mMaj9',
  '-M9': 'mMaj9',
  '-Δ9': 'mMaj9',
  'mMaj11': 'mMaj11',
  'mmaj11': 'mMaj11',
  'mM11': 'mMaj11',
  'mΔ11': 'mMaj11',
  '-M11': 'mMaj11',
  '-Δ11': 'mMaj11',
  'mMaj13': 'mMaj13',
  'mmaj13': 'mMaj13',
  'mM13': 'mMaj13',
  'mΔ13': 'mMaj13',
  '-M13': 'mMaj13',
  '-Δ13': 'mMaj13',
  'dimMaj7': '°Maj7',
  'dimmaj7': '°Maj7',
  '°M7': '°Maj7',
  '°Δ7': '°Maj7',
  'augMaj7': '+Maj7',
  'augmaj7': '+Maj7',
  '+M7': '+Maj7',
  '+Δ7': '+Maj7',
  'alt': 'alt',
  '7alt': 'alt',
};

/**
 * 取性质串对应的罗马数字级数后缀（含同义写法）。
 *
 * 表是**按写法**建的，但同一个配方的写法远不止表里列的那几条
 * （`halfDim7` 一个 token 就有 `m7b5` / `m7(b5)` / `ø7` / `ø` / `min7b5` / `-7b5` 六种拼写）。
 * 逐条把别名抄进表里，等于把「同义收敛」这件事在每个消费点重做一遍 —— 而它已在
 * 解析层（token 表）做过一次了。因此这里改成：**先查写法，查不到就经 token 归一到首选写法再查**。
 *
 * 于是 `min7b5` / `-7b5` 自动继承 `m7b5` 的 `ø7`，新增别名时无需改这张表。
 */
const romanSuffixOf = (quality?: string): string => {
  if (!quality) return '';
  const direct = ROMAN_SUFFIX_BY_QUALITY[quality];
  if (direct !== undefined) return direct;

  const parsed = parseQualityText(quality);
  if (!parsed.recognized) return '';
  // 经 token 归一到首选写法：`min7b5` → halfDim7 → `m7b5` → 表里命中 `ø7`
  const token = parsed.tokenId ? QUALITY_TOKENS.find(t => t.id === parsed.tokenId) : findTokenByAst(parsed.ast);
  const canonical = token?.spellings[0];
  return canonical ? (ROMAN_SUFFIX_BY_QUALITY[canonical] ?? '') : '';
};

export const getChordDegree = (chordOrName: ChordOrName | string, key: string = 'C'): ChordDegreeResult => {
  const empty: ChordDegreeResult = { roman: '', degree: 0, isDiatonic: false };
  if (!chordOrName || !key) return empty;

  const rawChordName = typeof chordOrName === 'string' ? chordOrName : getChordName(chordOrName);
  if (!rawChordName) return empty;

  const parsed = parseChordName(rawChordName);
  if (parsed.rootPitch === 99) return empty;

  const trimmedKey = key.trim();
  const isMinorKey = /m(in)?$/i.test(trimmedKey);
  const keyRootLabel = trimmedKey.replace(/m(in)?$/i, '');
  const keyRootPitch = ROOT_PITCH_MAP[keyRootLabel] ?? 0;

  // 相对调根音的半音差 [0, 11]
  const interval = (parsed.rootPitch - keyRootPitch + 12) % 12;

  interface DegreeDef {
    degree: number;
    base: string;
    isDiatonic: boolean;
  }

  // 大调音级：0: I, 2: II (ii), 4: III (iii), 5: IV, 7: V, 9: VI (vi), 11: VII (vii°)
  const MAJOR_INTERVAL_MAP: Record<number, DegreeDef> = {
    0: { degree: 1, base: 'I', isDiatonic: true },
    1: { degree: 2, base: 'bII', isDiatonic: false },
    2: { degree: 2, base: 'II', isDiatonic: true },
    3: { degree: 3, base: 'bIII', isDiatonic: false },
    4: { degree: 3, base: 'III', isDiatonic: true },
    5: { degree: 4, base: 'IV', isDiatonic: true },
    6: { degree: 5, base: 'bV', isDiatonic: false },
    7: { degree: 5, base: 'V', isDiatonic: true },
    8: { degree: 6, base: 'bVI', isDiatonic: false },
    9: { degree: 6, base: 'VI', isDiatonic: true },
    10: { degree: 7, base: 'bVII', isDiatonic: false },
    11: { degree: 7, base: 'VII', isDiatonic: true },
  };

  // 小调音级：0: I (i), 2: II (ii°), 3: III, 5: IV (iv), 7: V (v/V), 8: VI, 10: VII
  const MINOR_INTERVAL_MAP: Record<number, DegreeDef> = {
    0: { degree: 1, base: 'I', isDiatonic: true },
    1: { degree: 2, base: 'bII', isDiatonic: false },
    2: { degree: 2, base: 'II', isDiatonic: true },
    3: { degree: 3, base: 'III', isDiatonic: true },
    4: { degree: 3, base: '#III', isDiatonic: false },
    5: { degree: 4, base: 'IV', isDiatonic: true },
    6: { degree: 5, base: 'bV', isDiatonic: false },
    7: { degree: 5, base: 'V', isDiatonic: true },
    8: { degree: 6, base: 'VI', isDiatonic: true },
    9: { degree: 6, base: '#VI', isDiatonic: false },
    10: { degree: 7, base: 'VII', isDiatonic: true },
    11: { degree: 7, base: 'VII', isDiatonic: true },
  };

  const def = (isMinorKey ? MINOR_INTERVAL_MAP[interval] : MAJOR_INTERVAL_MAP[interval]) ?? {
    degree: 1,
    base: 'I',
    isDiatonic: false,
  };

  const isMinorChord = isMinorFlavoredQuality(parsed.quality);
  // 「是不是减」只读性质 AST 一处：与 qualityKindOf / 识别层共用同一个 isDimFlavoredQuality，
  // 不再对拼接 suffix 跑 `/^(dim|°|ø|m7b5)/` —— 那条正则必然漏写法
  // （`min7b5` / `-7b5` / `ø7` 都不在它的候选里），而读 AST 字段天然覆盖全部拼写。
  const isDim = isDimFlavoredQuality(parsed.quality);

  const prefixMatch = def.base.match(/^([b#])?(.*)$/);
  const prefix = prefixMatch?.[1] ?? '';
  let romanBody = prefixMatch?.[2] ?? def.base;

  // 小调与减和弦用小写罗马数字
  if (isMinorChord || isDim) {
    romanBody = romanBody.toLowerCase();
  }

  // 级数后缀直接由标准性质枚举映射，覆盖 CHORD_QUALITIES 全部条目；
  // 原 if-else 链仅命中 11 类，9~13 / add 家族（除 add9）/ 6 / aug7 等此前静默丢失，现已补齐且不会漂移。
  // 后缀同样只读枚举映射：'m7b5' / 'ø7' 在该表里都指向 'ø7'，裸 'ø' 指向 'ø'，无需再分支特判
  const romanSuffix = romanSuffixOf(parsed.quality);

  let finalRoman = `${prefix}${romanBody}${romanSuffix}`;

  // 斜杠转位低音：若存在，计算低音相对调根音的音级，格式化为 /3, /5, /7 等
  if (parsed.hasBass && parsed.bassPitch !== 99) {
    const bassInterval = (parsed.bassPitch - keyRootPitch + 12) % 12;
    const bassDegree = DIATONIC_DEGREE_MAP[bassInterval] ?? 1;
    finalRoman = `${finalRoman}/${bassDegree}`;
  }

  return {
    roman: finalRoman,
    degree: def.degree,
    isDiatonic: def.isDiatonic,
  };
};

/**
 * 判定两个和弦名称或分片在乐理上是否等价（支持等音异名根音/低音兼容，如 Bbadd9/F# ≡ A#add9/F#，C#m7 ≡ Dbm7）
 */
export const areChordsEnharmonicallyEquivalent = (
  chordA: string | ChordNameSegments | null | undefined,
  chordB: string | ChordNameSegments | null | undefined
): boolean => {
  if (!chordA || !chordB) return false;

  // 1. 快速文本全等命中（纯文本比对）
  if (typeof chordA === 'string' && typeof chordB === 'string') {
    if (chordA.trim() === chordB.trim()) return true;
  }

  // 2. 解析两者的结构化分片
  const segsA = typeof chordA === 'string' ? nameToSegments(chordA) : chordA;
  const segsB = typeof chordB === 'string' ? nameToSegments(chordB) : chordB;

  if (!segsA || !segsB) {
    // 若有非结构化字符串，退化为 trim 后比对
    const strA = typeof chordA === 'string' ? chordA.trim() : segmentsToString(chordA).trim();
    const strB = typeof chordB === 'string' ? chordB.trim() : segmentsToString(chordB).trim();
    return strA === strB;
  }

  // 3. 比较根音音高（Pitch mod 12）
  const letterPitchA = ROOT_PITCH_MAP[segsA.root[0]] ?? 0;
  const pitchA = (letterPitchA + segsA.root[1] + 12) % 12;

  const letterPitchB = ROOT_PITCH_MAP[segsB.root[0]] ?? 0;
  const pitchB = (letterPitchB + segsB.root[1] + 12) % 12;

  if (pitchA !== pitchB) return false;

  // 4. 比较和弦性质（quality 与 unknownQuality 统合）
  const qualityA = (segsA.quality ?? segsA.unknownQuality ?? '').trim().toLowerCase();
  const qualityB = (segsB.quality ?? segsB.unknownQuality ?? '').trim().toLowerCase();
  if (qualityA !== qualityB) return false;

  // 5. 比较斜杠低音（若存在，比较音高 mod 12）
  const hasBassA = Boolean(segsA.bass);
  const hasBassB = Boolean(segsB.bass);
  if (hasBassA !== hasBassB) return false;

  if (segsA.bass && segsB.bass) {
    const bassLetterA = ROOT_PITCH_MAP[segsA.bass[0]] ?? 0;
    const bassPitchA = (bassLetterA + segsA.bass[1] + 12) % 12;

    const bassLetterB = ROOT_PITCH_MAP[segsB.bass[0]] ?? 0;
    const bassPitchB = (bassLetterB + segsB.bass[1] + 12) % 12;

    if (bassPitchA !== bassPitchB) return false;
  }

  // 6. 比较扩展音（extensions）
  const extA = segsA.extensions ?? [];
  const extB = segsB.extensions ?? [];
  if (extA.length !== extB.length) return false;

  const extSigA = extA
    .map(([d, a]) => `${d}:${a}`)
    .sort()
    .join(',');
  const extSigB = extB
    .map(([d, a]) => `${d}:${a}`)
    .sort()
    .join(',');
  return extSigA === extSigB;
};
