import { CHORD_QUALITIES, GroupSortRule } from '@/domains/chord/types';
import { createLruCache } from '@/platform/utils/lruCache';

import { analyzeChordGraph } from './chordEngine.ts';

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
import type { SegmentOption } from '@/platform/ui/segmented/BaseSegmentedControl.vue';

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

const ACCIDENTAL_PITCH = Object.freeze([false, true, false, true, false, false, true, false, true, false, true, false]);
/** 判断相对根音的音程是否属于和弦特征音（根音/小三/大三/纯五度）。 */
const isChordToneRelative = (rel: number) => rel === 0 || rel === 3 || rel === 4 || rel === 7;

/** 判断弦是否为静音态（品位 -1）。 */
export const isMuted = (s: GuitarStringEntity) => s[0] === -1;
/** 判断弦是否为空弦态（品位 0）。 */
export const isOpen = (s: GuitarStringEntity) => s[0] === 0;
/** 创建默认琴弦元组：[-1（静音）, false（升号偏好）] */
export const createString = (): GuitarStringEntity => [-1, false];

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

const nameSegmentsCache = createLruCache<ChordNameSegments | null>(512);

/** 将任意和弦名文本解析为结构化分片 ChordNameSegments */
export const nameToSegments = (chordName: string): ChordNameSegments | null => {
  if (!chordName || typeof chordName !== 'string') return null;
  const trimmed = chordName.trim();
  const normalized = trimmed.replace(/（/g, '(').replace(/）/g, ')');
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

  // 提取 extensions / tensions，例如 (#9), #9, b5, #11, b13, b9 等
  const extensions: ExtensionSegment[] = [];
  const tensionRegex = /\(?([#b♯♭])([0-9]+)\)?/g;
  let tMatch: RegExpExecArray | null;
  const matchedTensionRanges: [number, number][] = [];

  while ((tMatch = tensionRegex.exec(rest)) !== null) {
    const accChar = tMatch[1];
    const deg = parseInt(tMatch[2]!, 10);
    const acc: AccidentalType = accChar === '#' || accChar === '♯' ? 1 : accChar === 'b' || accChar === '♭' ? -1 : 0;
    extensions.push([deg, acc]);
    matchedTensionRanges.push([tMatch.index, tMatch.index + tMatch[0].length]);
  }

  let quality = rest;
  if (extensions.length > 0) {
    for (let i = matchedTensionRanges.length - 1; i >= 0; i--) {
      const [start, end] = matchedTensionRanges[i]!;
      quality = quality.slice(0, start) + quality.slice(end);
    }
    quality = quality.trim();
  }

  const result: ChordNameSegments = {
    root,
    ...(quality
      ? // 已知性质收窄为 ChordQuality；未知残余降级落 unknownQuality（仅展示兜底）
        KNOWN_QUALITIES_SET.has(quality.toLowerCase())
        ? { quality: quality as ChordNameSegments['quality'] }
        : { unknownQuality: quality }
      : {}),
    extensions: extensions.length > 0 ? extensions : undefined,
    bass: bass ?? undefined,
  };
  nameSegmentsCache.set(normalized, result);
  return result;
};

/** 已知的标准乐理和弦性质集合（值域真相源在 types/chord.ts 的 CHORD_QUALITIES，此处附空串并保持 string 形态供小写比对） */
export const KNOWN_QUALITIES: string[] = ['', ...CHORD_QUALITIES];

const KNOWN_QUALITIES_SET = new Set(KNOWN_QUALITIES.map(q => q.toLowerCase()));

/**
 * 校验和弦名称是否在乐理与语法上合法：
 * 1. 必须能解析出有效的根音（A~G，可选升降号）
 * 2. 和弦性质必须符合通用乐理词汇体系
 * 3. 变化/扩展音度数必须在合理范围（2~13）
 * 4. 斜杠低音必须有效
 */
export const isValidChordName = (chordName: string): boolean => {
  if (!chordName || typeof chordName !== 'string') return false;
  const trimmed = chordName.trim();
  if (!trimmed) return false;

  const segments = nameToSegments(trimmed);
  if (!segments || !segments.root) return false;

  // quality 已由解析器收窄为已知集合；出现 unknownQuality 说明性质不在已知值域内
  if (segments.unknownQuality) {
    return false;
  }

  if (segments.extensions && segments.extensions.length > 0) {
    const validDegrees = new Set([2, 4, 5, 6, 7, 9, 11, 13]);
    const allExtsValid = segments.extensions.every(([deg]) => validDegrees.has(Number(deg)));
    if (!allExtsValid) return false;
  }

  return true;
};

/** 和弦性质简写/符号映射（如 maj7 -> M7, dim -> °, aug -> +, dimMaj7 -> °M7） */
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

  if (shorthand) {
    const b5Idx = extensions.findIndex(([deg, acc]) => (deg === 5 || deg === '5') && acc === -1);
    if ((quality === 'm7' || quality === 'm') && b5Idx >= 0) {
      quality = 'ø7';
      extensions = extensions.filter((_, idx) => idx !== b5Idx);
    } else {
      quality = formatChordQuality(quality, true);
    }
  }

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

  const qLower = rawQ.toLowerCase();

  // 1. 收集和弦的所有等价别名字符串
  const candidateNames = new Set<string>();

  if (chord.chordName) {
    candidateNames.add(chord.chordName.toLowerCase());
  }

  // 标准全称 (ASCII & Unicode)
  const fullNameAscii = getChordName(chord, { shorthand: false, useUnicode: false }).toLowerCase();
  const fullNameUnicode = getChordName(chord, { shorthand: false, useUnicode: true }).toLowerCase();
  if (fullNameAscii) candidateNames.add(fullNameAscii);
  if (fullNameUnicode) candidateNames.add(fullNameUnicode);

  // 简写名称 (ASCII & Unicode, 如 CM7, C°, Cø7, C+)
  const shortNameAscii = getChordName(chord, { shorthand: true, useUnicode: false }).toLowerCase();
  const shortNameUnicode = getChordName(chord, { shorthand: true, useUnicode: true }).toLowerCase();
  if (shortNameAscii) candidateNames.add(shortNameAscii);
  if (shortNameUnicode) candidateNames.add(shortNameUnicode);

  // 扩展特殊符号别名 (如 Δ7 对应 M7 / maj7)
  if (fullNameAscii.includes('maj')) {
    candidateNames.add(fullNameAscii.replace(/maj/g, 'δ').toLowerCase());
    candidateNames.add(fullNameAscii.replace(/maj/g, 'Δ').toLowerCase());
    candidateNames.add(fullNameAscii.replace(/maj/g, 'm').toLowerCase());
  }
  if (shortNameAscii.includes('m7')) {
    candidateNames.add(shortNameAscii.replace(/m7/g, 'δ7').toLowerCase());
    candidateNames.add(shortNameAscii.replace(/m7/g, 'Δ7').toLowerCase());
  }

  // 2. 生成查询词的变体 (ASCII 变音符 & Unicode 变音符 & 符号替换)
  const queryVariants = [
    qLower,
    qLower.replace(/♯/g, '#').replace(/♭/g, 'b'),
    qLower.replace(/#/g, '♯').replace(/b/g, '♭'),
    qLower.replace(/δ|Δ/g, 'maj').replace(/♯/g, '#').replace(/♭/g, 'b'),
    qLower.replace(/δ|Δ/g, 'm').replace(/♯/g, '#').replace(/♭/g, 'b'),
    qLower.replace(/ø|ø7/g, 'm7b5').replace(/♯/g, '#').replace(/♭/g, 'b'),
    qLower.replace(/°/g, 'dim').replace(/♯/g, '#').replace(/♭/g, 'b'),
  ];

  // 3. 检查任意候选名称是否包含任意查询词变体
  for (const name of candidateNames) {
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
const parsedChordNameCache = createLruCache<ParsedChordName>(512);

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
  const trimmed = chordName.trim();
  if (!trimmed) return empty;

  const cached = parsedChordNameCache.get(trimmed);
  if (cached !== undefined) return cached;

  const segs = nameToSegments(trimmed);
  if (!segs || !segs.root) {
    parsedChordNameCache.set(trimmed, empty);
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
  };

  parsedChordNameCache.set(trimmed, result);
  return result;
};

const rootPitchCache = createLruCache<number>(512);

/** 取和弦名的根音音高（含斜杠低音时仍取斜杠前的根音），带 LRU 缓存 */
export const getChordRootPitch = (chordName: string): number => {
  if (!chordName) return 99;
  const cached = rootPitchCache.get(chordName);
  if (cached !== undefined) return cached;
  const pitch = parseChordName(chordName).rootPitch;
  rootPitchCache.set(chordName, pitch);
  return pitch;
};

/**
 * 收集指板音集为 NoteInput[]（含弦位/音高/音名），并返回物理最低音高。
 * 供根音推导、转位判定与分析面板统一使用，避免各处重复遍历。
 */
export const collectChordNotes = (
  strings: GuitarStringEntity[],
  fretOffset: number = 0,
  baseStrings: readonly number[] = DEFAULT_TUNING_MAPPING
): { notes: NoteInput[]; bassPitch: number } => {
  const notes: NoteInput[] = [];
  let bassPitch = -1;
  for (let sIdx = 0; sIdx < strings.length; sIdx++) {
    const str = strings[sIdx];
    if (!str || str[0] < 0) continue;
    const pitch = calcPitchIndex(sIdx, str[0], fretOffset, baseStrings);
    const { label: naturalLabel, isAccidental } = computeStringLabelAccidental(
      sIdx,
      str[0],
      fretOffset,
      str[1],
      baseStrings
    );
    notes.push({ stringIndex: sIdx, pitchIndex: pitch, label: composeNoteLabel(naturalLabel, isAccidental, str[1]) });
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
  const baseStrings = TUNING_PRESETS[tuning as Tuning]?.mapping || DEFAULT_TUNING_MAPPING;
  // 1. 手动标记优先
  if (rootStringIndex !== null && rootStringIndex >= 0 && rootStringIndex < strings.length) {
    const markedStr = strings[rootStringIndex];
    if (markedStr && markedStr[0] >= 0) {
      return calcPitchIndex(rootStringIndex, markedStr[0], fretOffset, baseStrings);
    }
  }
  // 2. 名字/分片解析
  if (chordOrName) {
    const chordName = typeof chordOrName === 'string' ? chordOrName : getChordName(chordOrName);
    const namePitch = getChordRootPitch(chordName);
    if (namePitch !== 99) return namePitch;
  }
  // 3. 自动推导（基于指板音集）
  const { notes } = collectNotes(strings, fretOffset, baseStrings);
  if (notes.length === 0) return 99;
  const analysis = analyzeChordGraph(notes, null);
  if (analysis && analysis.bestRootPitch !== undefined && analysis.bestRootPitch !== -1) {
    return analysis.bestRootPitch;
  }
  return 99;
};

/** 判断指法是否为转位：物理最低音不等于（已解析的）根音即为转位；无法解析时视为非转位。 */
export const computeIsInverted = (
  strings: GuitarStringEntity[],
  fretOffset: number = 0,
  tuning: string = Tuning.STANDARD,
  chordOrName?: string | ChordOrName,
  rootStringIndex: number | null = null
): boolean => {
  const baseStrings = TUNING_PRESETS[tuning as Tuning]?.mapping || DEFAULT_TUNING_MAPPING;
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
  const baseStrings = TUNING_PRESETS[tuning as Tuning]?.mapping || DEFAULT_TUNING_MAPPING;
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
  const baseStrings = TUNING_PRESETS[chord.tuning as Tuning]?.mapping || DEFAULT_TUNING_MAPPING;
  let pitchMask = 0;
  const strings = chord.strings;
  for (let sIdx = 0; sIdx < strings.length; sIdx++) {
    const str = strings[sIdx];
    if (str && str[0] >= 0) {
      const p = calcPitchIndex(sIdx, str[0], chord.fretOffset, baseStrings);
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
 * 和弦性质归类：小调类（小三/小七/半减七/减和弦等）归为 0，其余（大三/属七/大七/挂留/加九等）归为 1。
 * 用途：同根音下先按性质聚类，使 Em 与其扩展 Em7 因同属小调类而相邻，属七 E7 排在其后；同类内部再按复杂度排列。
 */
const isMinorFlavored = (suffix: string): boolean => {
  if (!suffix) return false;
  // 大和弦体系：maj, Maj, M7, M9, M11, M13, Δ 等绝非小调
  if (/^(maj|M|Δ)/.test(suffix)) return false;
  // 小调体系：m, min, - 开头（且非 M/maj），减和弦 dim, °, 半减七 ø, ø7, m7b5 等
  if (/^(m|min|-)/.test(suffix)) return true;
  if (/^(dim|°|ø|m7b5)/.test(suffix)) return true;
  return false;
};

const DIATONIC_INTERVALS_MASK = (1 << 0) | (1 << 2) | (1 << 4) | (1 << 5) | (1 << 7) | (1 << 9) | (1 << 11);
const DIATONIC_DEGREE_MAP = Object.freeze([1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6, 7]);

interface SortMeta {
  chord: Chord;
  rootPitch: number;
  isInverted: boolean;
  colorNoteCount: number;
  complexityRank: number; // 和弦复杂度：三和弦 0 / 七和弦 1 / 九和弦+ 2
  qualityRank: number; // 同根音下性质聚类：小调类 0 / 其他 1，使 Em 与扩展 Em7 相邻
  qualityKind: 'maj' | 'min' | 'dim'; // 三和弦性质（大/小/减），用于「调内级数」校验性质是否匹配调的该级
}

/** 预计算单个和弦的排序元数据（根音/转位/复杂度/性质聚类等），供排序比较器复用。 */
const buildSortMeta = (chord: Chord): SortMeta => {
  const name = getChordName(chord);
  const parsed = parseChordName(name);
  const rootPitch =
    parsed.rootPitch !== 99
      ? parsed.rootPitch
      : resolveChordRootPitch(chord.strings, chord.fretOffset, chord.tuning, chord, chord.rootStringIndex);
  const { colorNoteCount } = getColorNoteCountAndPitches(chord, rootPitch);
  const suffix = parsed.suffix || '';
  return {
    chord,
    rootPitch,
    isInverted: computeIsInverted(chord.strings, chord.fretOffset, chord.tuning, chord, chord.rootStringIndex),
    colorNoteCount,
    complexityRank: getComplexityRank(parsed.suffix),
    qualityRank: isMinorFlavored(parsed.suffix) ? 0 : 1,
    qualityKind: /^(dim|°|ø|m7b5)/i.test(suffix) ? 'dim' : isMinorFlavored(suffix) ? 'min' : 'maj',
  };
};

/** 分组排序规则选项（供 BaseSegmentedControl 等 UI 使用） */
export const SORT_RULE_CONFIG = <SegmentOption<GroupSortRule>[]>[
  { label: '调内级数', value: GroupSortRule.KEY_DEGREE },
  { label: 'C-B', value: GroupSortRule.ROOT_PITCH },
  { label: 'A-Z', value: GroupSortRule.NAME_ASC },
];

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
    return chords
      .map((chord): [Chord, string] => [chord, getChordName(chord)])
      .sort((a, b) => a[1].localeCompare(b[1]))
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
      return getChordName(a.chord).localeCompare(getChordName(b.chord));
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
      return getChordName(a.chord).localeCompare(getChordName(b.chord));
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
  capo?: number;
  fretCount: number;
  tuning: Tuning | string;
  strings: GuitarStringsModel;
  rootStringIndex: number | null;
}): string => {
  if (chord && typeof chord === 'object') {
    const cached = chordFingerprintCache.get(chord);
    if (cached !== undefined) return cached;
  }
  const offset = chord.fretOffset ?? chord.capo ?? 0;
  const name = getChordName(chord);
  const isInverted = computeIsInverted(chord.strings, offset, chord.tuning, chord, chord.rootStringIndex);
  const strSig = chord.strings.map(s => `${s[0]}_${s[1] ? 1 : 0}`).join('|');
  const fp = `${name.trim()}:${offset}:${chord.fretCount}:${chord.tuning}:${isInverted ? 1 : 0}:${String(chord.rootStringIndex)}:${strSig}`;
  if (chord && typeof chord === 'object') {
    chordFingerprintCache.set(chord, fp);
  }
  return fp;
};

/** 取指定调弦预设的空弦基准音高数组；未知调弦回退标准调弦。 */
export const getActiveBaseStrings = (tuning: Tuning) => {
  return TUNING_PRESETS[tuning]?.mapping || DEFAULT_TUNING_MAPPING;
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
    ...(segments.extensions ? { extensions: segments.extensions.map(e => ({ ...e })) } : {}),
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

  let newStrings = chord.strings.map(s => [...s] as GuitarStringEntity);
  let newBarres = chord.barres ? chord.barres.map(b => ({ ...b })) : undefined;

  if (mode === 'shift_frets' && semitones !== 0) {
    newStrings = newStrings.map(([fret, flat]) => {
      if (fret <= 0) return [fret, flat];
      const shifted = fret + semitones;
      return [shifted > 0 ? shifted : -1, flat];
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

  const suffix = parsed.suffix || '';
  const isMinorChord = isMinorFlavored(suffix);
  const isHalfDim = /^(ø|m7b5)/.test(suffix);
  const isDim = /^(dim|°)/.test(suffix) || isHalfDim;
  const isAug = /^(aug|\+)/.test(suffix);

  const prefixMatch = def.base.match(/^([b#])?(.*)$/);
  const prefix = prefixMatch?.[1] ?? '';
  let romanBody = prefixMatch?.[2] ?? def.base;

  // 小调与减和弦用小写罗马数字
  if (isMinorChord || isDim) {
    romanBody = romanBody.toLowerCase();
  }

  let romanSuffix = '';
  if (isHalfDim) {
    romanSuffix = 'ø7';
  } else if (isDim) {
    romanSuffix = '°';
    if (/7/.test(suffix)) romanSuffix += '7';
  } else if (isAug) {
    romanSuffix = '+';
  } else if (/^(maj7|Maj7|M7|Δ7)\b/.test(suffix)) {
    romanSuffix = 'maj7';
  } else if (/^(m7|min7|-7)\b/i.test(suffix)) {
    romanSuffix = '7';
  } else if (/^7sus4\b/i.test(suffix)) {
    romanSuffix = '7sus4';
  } else if (/^sus4\b/i.test(suffix)) {
    romanSuffix = 'sus4';
  } else if (/^sus2\b/i.test(suffix)) {
    romanSuffix = 'sus2';
  } else if (/^7\b/.test(suffix)) {
    romanSuffix = '7';
  } else if (/^9\b/.test(suffix)) {
    romanSuffix = '9';
  } else if (/^add9\b/i.test(suffix)) {
    romanSuffix = 'add9';
  }

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
