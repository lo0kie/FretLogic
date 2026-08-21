import type { SegmentOption } from '@/components/BaseSegmentedControl.vue';
import type { Chord, GuitarStringEntity, NoteInput } from '@/types';
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
  const label = (preferFlat ? NATURAL_LETTER_FLAT : NATURAL_LETTER_SHARP)[pitchIndex];
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

export const calcPitchIndex = (
  sIdx: number,
  fretVal: number,
  capoVal: number,
  baseStrings: readonly number[] = DEFAULT_TUNING_MAPPING
): number => {
  const base = baseStrings[sIdx];
  const actualOffset = fretVal > 0 && capoVal > 0 ? capoVal : 0;
  return (base + fretVal + actualOffset) % 12;
};

export const isAccidentalNote = (pitchIndex: number): boolean => ACCIDENTAL_PITCH[((pitchIndex % 12) + 12) % 12];

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
  return preferFlat ? NOTES_FLAT[noteIndex] : NOTES_SHARP[noteIndex];
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

const parsePitchLabel = (label: string): number => ROOT_PITCH_MAP[label] ?? 99;

/**
 * 解析和弦名：拆出根音、斜杠低音与和弦后缀。
 * "Bm7/A" -> { rootLabel:'B', rootPitch:11, bassLabel:'A', bassPitch:9, hasBass:true, suffix:'m7' }
 * 相比旧 getChordRootPitch（只取开头），斜杠低音被完整解析，供转位判定与一致性校验使用。
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
  // 根音（可含 #/b）+ 后缀 + 可选 /低音
  const match = chordName.match(/^([A-G][#b]?)([^/]*?)(?:\/([A-G][#b]?))?$/);
  if (!match) return empty;
  const rootLabel = match[1];
  const suffix = match[2] ?? '';
  const bassLabel = match[3];
  return {
    rootLabel,
    rootPitch: parsePitchLabel(rootLabel),
    bassLabel: bassLabel ?? '',
    bassPitch: bassLabel ? parsePitchLabel(bassLabel) : 99,
    hasBass: !!bassLabel,
    suffix,
  };
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
 * 供根音推导与转位判定统一使用，避免各处重复遍历。
 */
const collectNotes = (
  strings: GuitarStringEntity[],
  capoVal: number,
  baseStrings: readonly number[]
): { notes: NoteInput[]; bassPitch: number } => {
  const notes: NoteInput[] = [];
  let bassPitch = -1;
  for (let sIdx = 0; sIdx < strings.length; sIdx++) {
    const str = strings[sIdx];
    if (str[0] < 0) continue;
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
  chordName: string,
  rootStringIndex: number | null = null
): number => {
  const baseStrings = TUNING_PRESETS[tuning as Tuning]?.mapping || DEFAULT_TUNING_MAPPING;
  // 1. 手动标记优先
  if (rootStringIndex !== null && rootStringIndex >= 0 && rootStringIndex < strings.length) {
    const markedStr = strings[rootStringIndex];
    if (markedStr[0] >= 0) {
      return calcPitchIndex(rootStringIndex, markedStr[0], capoVal, baseStrings);
    }
  }
  // 2. 名字解析
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
  chordName: string,
  rootStringIndex: number | null = null
): boolean => {
  const baseStrings = TUNING_PRESETS[tuning as Tuning]?.mapping || DEFAULT_TUNING_MAPPING;
  const { bassPitch } = collectNotes(strings, capoVal, baseStrings);
  const rootPitch = resolveChordRootPitch(strings, capoVal, tuning, chordName, rootStringIndex);
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
  chordName: string
): string | null => {
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
    if (str[0] >= 0) {
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

const DIATONIC_INTERVALS_MASK = (1 << 0) | (1 << 2) | (1 << 4) | (1 << 5) | (1 << 7) | (1 << 9) | (1 << 11);
const DIATONIC_DEGREE_MAP = Object.freeze([1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6, 7]);

interface SortMeta {
  chord: Chord;
  rootPitch: number;
  isInverted: boolean;
  colorNoteCount: number;
}

const buildSortMeta = (chord: Chord): SortMeta => {
  const rootPitch = resolveChordRootPitch(
    chord.strings,
    chord.capo,
    chord.tuning,
    chord.chordName,
    chord.rootStringIndex
  );
  const { colorNoteCount } = getColorNoteCountAndPitches(chord, rootPitch);
  return {
    chord,
    rootPitch,
    isInverted: computeIsInverted(chord.strings, chord.capo, chord.tuning, chord.chordName, chord.rootStringIndex),
    colorNoteCount,
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
    return chords.slice().sort((a, b) => a.chordName.localeCompare(b.chordName));
  }
  const n = chords.length;
  const mappedList: SortMeta[] = new Array(n);
  for (let i = 0; i < n; i++) {
    mappedList[i] = buildSortMeta(chords[i]);
  }
  if (effectiveRule === GroupSortRule.ROOT_PITCH) {
    mappedList.sort((a, b) => {
      if (a.rootPitch !== b.rootPitch) return a.rootPitch - b.rootPitch;
      if (a.isInverted !== b.isInverted) return a.isInverted ? 1 : -1;
      if (a.colorNoteCount !== b.colorNoteCount) return a.colorNoteCount - b.colorNoteCount;
      return a.chord.chordName.localeCompare(b.chord.chordName);
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
        aDegree = DIATONIC_DEGREE_MAP[ia];
        aDiatonic = (DIATONIC_INTERVALS_MASK & (1 << ia)) !== 0;
      }
      if (b.rootPitch !== 99) {
        const ib = (b.rootPitch - keyPitch + 12) % 12;
        bDegree = DIATONIC_DEGREE_MAP[ib];
        bDiatonic = (DIATONIC_INTERVALS_MASK & (1 << ib)) !== 0;
      }
      if (aDiatonic !== bDiatonic) return aDiatonic ? -1 : 1;
      if (aDegree !== bDegree) return aDegree - bDegree;
      if (a.isInverted !== b.isInverted) return a.isInverted ? 1 : -1;
      if (a.colorNoteCount !== b.colorNoteCount) return a.colorNoteCount - b.colorNoteCount;
      return a.chord.chordName.localeCompare(b.chord.chordName);
    });
  } else {
    return chords.slice();
  }
  const out = new Array<Chord>(n);
  for (let i = 0; i < n; i++) out[i] = mappedList[i].chord;
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

export const computeChordFingerprint = (
  chord: Pick<Chord, 'chordName' | 'capo' | 'fretCount' | 'tuning' | 'strings' | 'rootStringIndex'>
): string => {
  const isInverted = computeIsInverted(chord.strings, chord.capo, chord.tuning, chord.chordName, chord.rootStringIndex);
  const strSig = chord.strings.map(s => `${s[0]}_${s[1] ? 1 : 0}`).join('|');
  return `${chord.chordName.trim()}:${chord.capo}:${chord.fretCount}:${chord.tuning}:${isInverted ? 1 : 0}:${String(chord.rootStringIndex)}:${strSig}`;
};

export const getActiveBaseStrings = (tuning: Tuning) => {
  return TUNING_PRESETS[tuning]?.mapping || DEFAULT_TUNING_MAPPING;
};
