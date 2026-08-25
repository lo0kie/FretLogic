import type { SegmentOption } from '@/components/BaseSegmentedControl.vue';
import type {
  AccidentalType,
  Chord,
  ChordNameSegments,
  ExtensionSegment,
  GuitarStringEntity,
  GuitarStringsModel,
  NaturalPitchLetter,
  NoteInput,
  RootSegment,
} from '@/types';
import { GroupSortRule } from '@/types';
import { analyzeChordGraph } from './chordEngine';

const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
/** 调性键名选项（升号调/降号调按常见记谱习惯混合） */
export const KEY_OPTIONS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

const TUNING_MAPPING_STANDARD = Object.freeze([40, 45, 50, 55, 59, 64] as const);
const TUNING_MAPPING_DROP_D = Object.freeze([38, 45, 50, 55, 59, 64] as const);
const TUNING_MAPPING_DADGAD = Object.freeze([38, 45, 50, 55, 57, 62] as const);
const TUNING_MAPPING_OPEN_G = Object.freeze([38, 43, 50, 55, 59, 62] as const);
const TUNING_MAPPING_HALF_STEP = Object.freeze([39, 44, 49, 54, 58, 63] as const);
// 新增：Open D (D A D F# A D)
const TUNING_MAPPING_OPEN_D = Object.freeze([38, 45, 50, 54, 57, 62] as const);
// 新增：Open C (C G C G C E)
const TUNING_MAPPING_OPEN_C = Object.freeze([36, 43, 48, 55, 60, 64] as const);
// 新增：Drop C (C G C F A D) — 即 Drop D 整体降全音
const TUNING_MAPPING_DROP_C = Object.freeze([36, 43, 48, 53, 57, 62] as const);
export const DEFAULT_TUNING_MAPPING = TUNING_MAPPING_STANDARD;

export enum Tuning {
  STANDARD = 'STANDARD',
  DROP_D = 'DROP_D',
  DADGAD = 'DADGAD',
  OPEN_G = 'OPEN_G',
  HALF_STEP = 'HALF_STEP',
  OPEN_D = 'OPEN_D',
  OPEN_C = 'OPEN_C',
  DROP_C = 'DROP_C',
}

export const TUNING_PRESETS: Record<
  Tuning,
  {
    name: string;
    mapping: readonly [number, number, number, number, number, number];
  }
> = {
  [Tuning.STANDARD]: {
    name: 'Standard (EADGBE)',
    mapping: TUNING_MAPPING_STANDARD,
  },
  [Tuning.DROP_D]: {
    name: 'Drop D (DADGBE)',
    mapping: TUNING_MAPPING_DROP_D,
  },
  [Tuning.DADGAD]: { name: 'DADGAD', mapping: TUNING_MAPPING_DADGAD },
  [Tuning.OPEN_G]: {
    name: 'Open G (DGDGBD)',
    mapping: TUNING_MAPPING_OPEN_G,
  },
  [Tuning.HALF_STEP]: {
    name: 'Half Step Down',
    mapping: TUNING_MAPPING_HALF_STEP,
  },
  [Tuning.OPEN_D]: {
    name: 'Open D (DADF#AD)',
    mapping: TUNING_MAPPING_OPEN_D,
  },
  [Tuning.OPEN_C]: {
    name: 'Open C (CGCGCE)',
    mapping: TUNING_MAPPING_OPEN_C,
  },
  [Tuning.DROP_C]: {
    name: 'Drop C (CGCFAD)',
    mapping: TUNING_MAPPING_DROP_C,
  },
};

const ACCIDENTAL_PITCH = Object.freeze([false, true, false, true, false, false, true, false, true, false, true, false]);
const isChordToneRelative = (rel: number) => rel === 0 || rel === 3 || rel === 4 || rel === 7;

export const isMuted = (s: GuitarStringEntity) => s[0] === -1;
export const isOpen = (s: GuitarStringEntity) => s[0] === 0;
/** 创建默认琴弦元组：[-1（静音）, false（升号偏好）] */
export const createString = (): GuitarStringEntity => [-1, false];

// 自然字母（不含升降号），按 preferFlat 选择拼写对应的基础字母
const NATURAL_LETTER_SHARP = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
const NATURAL_LETTER_FLAT = ['C', 'D', 'D', 'E', 'E', 'F', 'G', 'G', 'A', 'A', 'B', 'B'];

/** 计算某弦的音名（自然字母，不含升降号）与是否为变化音级（黑键）。由 pitch + preferFlat 派生。 */
export const computeStringLabelAccidental = (
  sIdx: number,
  fretVal: number,
  capoVal: number,
  preferFlat: boolean,
  baseStrings: readonly number[] = DEFAULT_TUNING_MAPPING
): { label: string; isAccidental: boolean } => {
  if (fretVal < 0) return { label: '', isAccidental: false };
  const pitchIndex = calcPitchIndex(sIdx, fretVal, capoVal, baseStrings);
  const isAccidental = isAccidentalNote(pitchIndex);
  const label = (preferFlat ? NATURAL_LETTER_FLAT : NATURAL_LETTER_SHARP)[pitchIndex] ?? '';
  return { label, isAccidental };
};

/** 格式化某弦的完整音名（如 "C#" / "Bb"）。fret < 0 时返回 ✕。由 pitch 实时派生，不依赖存储字段 */
export const formatStringLabel = (
  sIdx: number,
  fretVal: number,
  preferFlat: boolean,
  capoVal: number,
  baseStrings: readonly number[] = DEFAULT_TUNING_MAPPING
): string => {
  if (fretVal < 0) return '✕';
  const { label, isAccidental } = computeStringLabelAccidental(sIdx, fretVal, capoVal, preferFlat, baseStrings);
  return composeNoteLabel(label, isAccidental, preferFlat);
};

/** 组装显示用音名：label + isAccidental + preferFlat 拼装（与 calcNoteLabel 一致，使用 #/b） */
export const composeNoteLabel = (label: string, isAccidental: boolean, preferFlat: boolean): string =>
  isAccidental ? label + (preferFlat ? 'b' : '#') : label;

export const calcNoteMidi = (
  sIdx: number,
  fretVal: number,
  capoVal: number,
  baseStrings: readonly number[] = DEFAULT_TUNING_MAPPING
): number => {
  const base = baseStrings[sIdx] ?? 0;
  const actualOffset = fretVal > 0 && capoVal > 0 ? capoVal : 0;
  return base + fretVal + actualOffset;
};

export const calcPitchIndex = (
  sIdx: number,
  fretVal: number,
  capoVal: number,
  baseStrings: readonly number[] = DEFAULT_TUNING_MAPPING
): number => {
  return calcNoteMidi(sIdx, fretVal, capoVal, baseStrings) % 12;
};

export const isAccidentalNote = (pitchIndex: number): boolean =>
  ACCIDENTAL_PITCH[((pitchIndex % 12) + 12) % 12] ?? false;

export const canTogglePitchAccidental = (
  sIdx: number,
  fretVal: number,
  capoVal: number,
  baseStrings: readonly number[] = DEFAULT_TUNING_MAPPING
): boolean => {
  if (fretVal < 0) return false;
  const pitchIndex = calcPitchIndex(sIdx, fretVal, capoVal, baseStrings);
  return isAccidentalNote(pitchIndex);
};

export const calcNoteLabel = (
  sIdx: number,
  fretVal: number,
  capoVal: number,
  preferFlat: boolean = false,
  baseStrings: readonly number[] = DEFAULT_TUNING_MAPPING
): string => {
  if (fretVal === -1) return '✕';
  const noteIndex = calcPitchIndex(sIdx, fretVal, capoVal, baseStrings);
  return preferFlat ? (NOTES_FLAT[noteIndex] ?? '') : (NOTES_SHARP[noteIndex] ?? '');
};

// 补齐等音异名（E#/Fb/B#/Cb），让根音解析对少见但合法的记谱更健壮
const ROOT_PITCH_MAP: Record<string, number> = {
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

const nameSegmentsCache = new Map<string, ChordNameSegments | null>();

/** 将任意和弦名文本解析为结构化分片 ChordNameSegments */
export const nameToSegments = (chordName: string): ChordNameSegments | null => {
  if (!chordName || typeof chordName !== 'string') return null;
  const trimmed = chordName.trim();
  if (!trimmed) return null;

  const cached = nameSegmentsCache.get(trimmed);
  if (cached !== undefined) return cached;

  // 1. 根音：从开头提取 [A-G][#b♯♭]?
  const rootMatch = trimmed.match(/^([A-G][#b♯♭]?)/i);
  if (!rootMatch) {
    if (nameSegmentsCache.size >= 512) {
      const oldestKey = nameSegmentsCache.keys().next().value;
      if (oldestKey !== undefined) nameSegmentsCache.delete(oldestKey);
    }
    nameSegmentsCache.set(trimmed, null);
    return null;
  }
  const root = parsePitchSegment(rootMatch[1]!);
  if (!root) {
    if (nameSegmentsCache.size >= 512) {
      const oldestKey = nameSegmentsCache.keys().next().value;
      if (oldestKey !== undefined) nameSegmentsCache.delete(oldestKey);
    }
    nameSegmentsCache.set(trimmed, null);
    return null;
  }

  let remaining = trimmed.slice(rootMatch[0].length);

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
    quality: quality || undefined,
    extensions: extensions.length > 0 ? extensions : undefined,
    bass: bass ?? undefined,
  };
  if (nameSegmentsCache.size >= 512) {
    const oldestKey = nameSegmentsCache.keys().next().value;
    if (oldestKey !== undefined) nameSegmentsCache.delete(oldestKey);
  }
  nameSegmentsCache.set(trimmed, result);
  return result;
};

/** 已知的标准乐理和弦性质集合 */
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
  '9sus4',
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
  'madd9',
  'madd11',
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

  if (segments.quality) {
    const q = segments.quality.trim().toLowerCase();
    if (!KNOWN_QUALITIES_SET.has(q)) {
      return false;
    }
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
  let quality = segments.quality ?? '';
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
  chord: { nameSegments?: ChordNameSegments | null; chordName?: string } | null | undefined,
  options?: { shorthand?: boolean; useUnicode?: boolean }
): string => {
  if (!chord || !chord.nameSegments) return chord?.chordName || '';
  return segmentsToString(chord.nameSegments, options);
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
const parsedChordNameCache = new Map<string, ParsedChordName>();

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
    if (parsedChordNameCache.size >= 512) {
      const oldestKey = parsedChordNameCache.keys().next().value;
      if (oldestKey !== undefined) parsedChordNameCache.delete(oldestKey);
    }
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
  const suffix = `${segs.quality ?? ''}${extsStr}`;

  const result: ParsedChordName = {
    rootLabel,
    rootPitch,
    bassLabel,
    bassPitch,
    hasBass,
    suffix,
  };

  if (parsedChordNameCache.size >= 512) {
    const oldestKey = parsedChordNameCache.keys().next().value;
    if (oldestKey !== undefined) parsedChordNameCache.delete(oldestKey);
  }
  parsedChordNameCache.set(trimmed, result);
  return result;
};

const rootPitchCache = new Map<string, number>();

/** 兼容旧 API：只取和弦名的根音音高（含斜杠低音时仍取斜杠前的根音） */
export const getChordRootPitch = (chordName: string): number => {
  if (!chordName || typeof chordName !== 'string') return 99;
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
  capoVal: number,
  baseStrings: readonly number[] = DEFAULT_TUNING_MAPPING
): { notes: NoteInput[]; bassPitch: number } => {
  const notes: NoteInput[] = [];
  let bassPitch = -1;
  for (let sIdx = 0; sIdx < strings.length; sIdx++) {
    const str = strings[sIdx];
    if (!str || str[0] < 0) continue;
    const pitch = calcPitchIndex(sIdx, str[0], capoVal, baseStrings);
    const { label: naturalLabel, isAccidental } = computeStringLabelAccidental(
      sIdx,
      str[0],
      capoVal,
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
  capoVal: number,
  tuning: Tuning | string,
  chordOrName: string | { nameSegments?: ChordNameSegments | null; chordName?: string },
  rootStringIndex: number | null = null
): number => {
  const baseStrings = TUNING_PRESETS[tuning as Tuning]?.mapping || DEFAULT_TUNING_MAPPING;
  // 1. 手动标记优先
  if (rootStringIndex !== null && rootStringIndex >= 0 && rootStringIndex < strings.length) {
    const markedStr = strings[rootStringIndex];
    if (markedStr && markedStr[0] >= 0) {
      return calcPitchIndex(rootStringIndex, markedStr[0], capoVal, baseStrings);
    }
  }
  // 2. 名字/分片解析
  const chordName = typeof chordOrName === 'string' ? chordOrName : getChordName(chordOrName);
  const namePitch = getChordRootPitch(chordName);
  if (namePitch !== 99) return namePitch;
  // 3. 自动推导（基于指板音集）
  const { notes } = collectNotes(strings, capoVal, baseStrings);
  if (notes.length === 0) return 99;
  const analysis = analyzeChordGraph(notes, null);
  if (analysis && analysis.bestRootPitch !== undefined && analysis.bestRootPitch !== -1) {
    return analysis.bestRootPitch;
  }
  return 99;
};

export const computeIsInverted = (
  strings: GuitarStringEntity[],
  capoVal: number,
  tuning: string,
  chordOrName: string | { nameSegments?: ChordNameSegments | null; chordName?: string },
  rootStringIndex: number | null = null
): boolean => {
  const baseStrings = TUNING_PRESETS[tuning as Tuning]?.mapping || DEFAULT_TUNING_MAPPING;
  const { bassPitch } = collectNotes(strings, capoVal, baseStrings);
  const rootPitch = resolveChordRootPitch(strings, capoVal, tuning, chordOrName, rootStringIndex);
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
  capoVal: number,
  tuning: Tuning | string,
  chordOrName: string | { nameSegments?: ChordNameSegments | null; chordName?: string }
): string | null => {
  const chordName = typeof chordOrName === 'string' ? chordOrName : getChordName(chordOrName);
  const parsed = parseChordName(chordName);
  if (!parsed.hasBass || parsed.bassPitch === 99) return null;
  const baseStrings = TUNING_PRESETS[tuning as Tuning]?.mapping || DEFAULT_TUNING_MAPPING;
  const { bassPitch } = collectNotes(strings, capoVal, baseStrings);
  if (bassPitch === -1) return null;
  // 音高模 12 比较（忽略八度）
  if (bassPitch % 12 !== parsed.bassPitch) {
    return `和弦名标注的低音 ${parsed.bassLabel} 与指板最低音不一致，可能导致转位判定/排序失真`;
  }
  return null;
};

const getColorNoteCountAndPitches = (chord: Chord, rootPitch: number) => {
  if (rootPitch === 99) return { colorNoteCount: 0, pitchMask: 0 };
  const baseStrings = TUNING_PRESETS[chord.tuning as Tuning]?.mapping || DEFAULT_TUNING_MAPPING;
  let pitchMask = 0;
  const strings = chord.strings;
  for (let sIdx = 0; sIdx < strings.length; sIdx++) {
    const str = strings[sIdx];
    if (str && str[0] >= 0) {
      const p = calcPitchIndex(sIdx, str[0], chord.capo, baseStrings);
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
}

const buildSortMeta = (chord: Chord): SortMeta => {
  const name = getChordName(chord);
  const parsed = parseChordName(name);
  const rootPitch =
    parsed.rootPitch !== 99
      ? parsed.rootPitch
      : resolveChordRootPitch(chord.strings, chord.capo, chord.tuning, chord, chord.rootStringIndex);
  const { colorNoteCount } = getColorNoteCountAndPitches(chord, rootPitch);
  return {
    chord,
    rootPitch,
    isInverted: computeIsInverted(chord.strings, chord.capo, chord.tuning, chord, chord.rootStringIndex),
    colorNoteCount,
    complexityRank: getComplexityRank(parsed.suffix),
    qualityRank: isMinorFlavored(parsed.suffix) ? 0 : 1,
  };
};

/** 分组排序规则选项（供 BaseSegmentedControl 等 UI 使用） */
export const SORT_RULE_CONFIG = <SegmentOption<GroupSortRule>[]>[
  { label: '调内级数', value: GroupSortRule.KEY_DEGREE },
  { label: 'C-B', value: GroupSortRule.ROOT_PITCH },
  { label: 'A-Z', value: GroupSortRule.NAME_ASC },
];

export const sortChordsByRule = (chords: Chord[], rule?: GroupSortRule, sortKey = 'C'): Chord[] => {
  if (chords.length <= 1) return chords.slice();
  const effectiveRule: GroupSortRule = rule ?? GroupSortRule.ROOT_PITCH;
  if (effectiveRule === GroupSortRule.NAME_ASC) {
    return chords.slice().sort((a, b) => getChordName(a).localeCompare(getChordName(b)));
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
    const keyPitch = ROOT_PITCH_MAP[sortKey] ?? 0;
    mappedList.sort((a, b) => {
      let aDiatonic = false;
      let bDiatonic = false;
      let aDegree = 99;
      let bDegree = 99;
      if (a.rootPitch !== 99) {
        const ia = (a.rootPitch - keyPitch + 12) % 12;
        aDegree = DIATONIC_DEGREE_MAP[ia] ?? 99;
        aDiatonic = (DIATONIC_INTERVALS_MASK & (1 << ia)) !== 0;
      }
      if (b.rootPitch !== 99) {
        const ib = (b.rootPitch - keyPitch + 12) % 12;
        bDegree = DIATONIC_DEGREE_MAP[ib] ?? 99;
        bDiatonic = (DIATONIC_INTERVALS_MASK & (1 << ib)) !== 0;
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

export const computeChordFingerprint = (chord: {
  chordName?: string;
  nameSegments?: ChordNameSegments | null;
  capo: number;
  fretCount: number;
  tuning: Tuning | string;
  strings: GuitarStringsModel;
  rootStringIndex: number | null;
}): string => {
  if (chord && typeof chord === 'object') {
    const cached = chordFingerprintCache.get(chord);
    if (cached !== undefined) return cached;
  }
  const name = getChordName(chord);
  const isInverted = computeIsInverted(chord.strings, chord.capo, chord.tuning, chord, chord.rootStringIndex);
  const strSig = chord.strings.map(s => `${s[0]}_${s[1] ? 1 : 0}`).join('|');
  const fp = `${name.trim()}:${chord.capo}:${chord.fretCount}:${chord.tuning}:${isInverted ? 1 : 0}:${String(chord.rootStringIndex)}:${strSig}`;
  if (chord && typeof chord === 'object') {
    chordFingerprintCache.set(chord, fp);
  }
  return fp;
};

export const getActiveBaseStrings = (tuning: Tuning) => {
  return TUNING_PRESETS[tuning]?.mapping || DEFAULT_TUNING_MAPPING;
};
