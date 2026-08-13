import type { Chord, GroupSortRule, GuitarStringEntity } from '@/types';
import { cloneDeep } from './cloneDeep';

export const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export const TUNING_MAPPING_STANDARD = Object.freeze([40, 45, 50, 55, 59, 64] as const);
export const TUNING_MAPPING_DROP_D = Object.freeze([38, 45, 50, 55, 59, 64] as const);
export const TUNING_MAPPING_DADGAD = Object.freeze([38, 45, 50, 55, 57, 62] as const);
export const TUNING_MAPPING_OPEN_G = Object.freeze([38, 43, 50, 55, 59, 62] as const);
export const TUNING_MAPPING_HALF_STEP = Object.freeze([39, 44, 49, 54, 58, 63] as const);
// 新增：Open D (D A D F# A D)
export const TUNING_MAPPING_OPEN_D = Object.freeze([38, 45, 50, 54, 57, 62] as const);
// 新增：Open C (C G C G C E)
export const TUNING_MAPPING_OPEN_C = Object.freeze([36, 43, 48, 55, 60, 64] as const);
// 新增：Drop C (C G C F A D) — 即 Drop D 整体降全音
export const TUNING_MAPPING_DROP_C = Object.freeze([36, 43, 48, 53, 57, 62] as const);
export const DEFAULT_TUNING_MAPPING = TUNING_MAPPING_STANDARD;

export enum TuningEnum {
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
  TuningEnum,
  { name: string; mapping: readonly [number, number, number, number, number, number] }
> = {
  [TuningEnum.STANDARD]: { name: 'Standard (EADGBE)', mapping: TUNING_MAPPING_STANDARD },
  [TuningEnum.DROP_D]: { name: 'Drop D (DADGBE)', mapping: TUNING_MAPPING_DROP_D },
  [TuningEnum.DADGAD]: { name: 'DADGAD', mapping: TUNING_MAPPING_DADGAD },
  [TuningEnum.OPEN_G]: { name: 'Open G (DGDGBD)', mapping: TUNING_MAPPING_OPEN_G },
  [TuningEnum.HALF_STEP]: { name: 'Half Step Down', mapping: TUNING_MAPPING_HALF_STEP },
  [TuningEnum.OPEN_D]: { name: 'Open D (DADF#AD)', mapping: TUNING_MAPPING_OPEN_D },
  [TuningEnum.OPEN_C]: { name: 'Open C (CGCGCE)', mapping: TUNING_MAPPING_OPEN_C },
  [TuningEnum.DROP_C]: { name: 'Drop C (CGCFAD)', mapping: TUNING_MAPPING_DROP_C },
};

const ACCIDENTAL_PITCH = Object.freeze([false, true, false, true, false, false, true, false, true, false, true, false]);
const isChordToneRelative = (rel: number) => rel === 0 || rel === 3 || rel === 4 || rel === 7;

export const isMuted = (s: GuitarStringEntity) => s.fret === -1;
export const isOpen = (s: GuitarStringEntity) => s.fret === 0;
export const createString = (): GuitarStringEntity => ({
  fret: -1,
  isRoot: false,
  preferFlat: false,
});

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

const rootPitchCache = new Map<string, number>();

export const getChordRootPitch = (chordName: string): number => {
  if (!chordName || typeof chordName !== 'string') return 99;
  const cached = rootPitchCache.get(chordName);
  if (cached !== undefined) return cached;
  const match = chordName.match(/^([A-G][#b]?)/);
  const pitch = match ? (ROOT_PITCH_MAP[match[1]] ?? 99) : 99;
  rootPitchCache.set(chordName, pitch);
  return pitch;
};

export const computeIsInverted = (
  strings: GuitarStringEntity[],
  capoVal: number,
  tuning: string,
  chordName: string
): boolean => {
  const baseStrings = TUNING_PRESETS[tuning as TuningEnum]?.mapping || DEFAULT_TUNING_MAPPING;
  let rootPitch = 99;
  let hasMarkedRoot = false;
  let bassPitch = -1;
  for (let sIdx = 0; sIdx < strings.length; sIdx++) {
    const str = strings[sIdx];
    if (str.fret < 0) continue;
    const p = calcPitchIndex(sIdx, str.fret, capoVal, baseStrings);
    if (bassPitch === -1) bassPitch = p;
    if (str.isRoot && !hasMarkedRoot) {
      hasMarkedRoot = true;
      rootPitch = p;
    }
  }
  if (!hasMarkedRoot) {
    rootPitch = getChordRootPitch(chordName);
  }
  return bassPitch !== -1 && rootPitch !== 99 && bassPitch !== rootPitch;
};

const getColorNoteCountAndPitches = (chord: Chord, rootPitch: number) => {
  if (rootPitch === 99) return { colorNoteCount: 0, pitchMask: 0 };
  const baseStrings = TUNING_PRESETS[chord.tuning as TuningEnum]?.mapping || DEFAULT_TUNING_MAPPING;
  let pitchMask = 0;
  const strings = chord.strings;
  for (let sIdx = 0; sIdx < strings.length; sIdx++) {
    const str = strings[sIdx];
    if (str.fret >= 0) {
      const p = calcPitchIndex(sIdx, str.fret, chord.capo, baseStrings);
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
  hasMarkedRoot: boolean;
  rootPitch: number;
  isInverted: boolean;
  colorNoteCount: number;
}

const buildSortMeta = (chord: Chord): SortMeta => {
  const baseStrings = TUNING_PRESETS[chord.tuning as TuningEnum]?.mapping || DEFAULT_TUNING_MAPPING;
  let hasMarkedRoot = false;
  let rootPitch = 99;
  const strings = chord.strings;
  for (let sIdx = 0; sIdx < strings.length; sIdx++) {
    const str = strings[sIdx];
    if (str.isRoot && str.fret >= 0) {
      hasMarkedRoot = true;
      rootPitch = calcPitchIndex(sIdx, str.fret, chord.capo, baseStrings);
      break;
    }
  }
  if (!hasMarkedRoot) {
    rootPitch = getChordRootPitch(chord.chordName);
  }
  const { colorNoteCount } = getColorNoteCountAndPitches(chord, rootPitch);
  return {
    chord,
    hasMarkedRoot,
    rootPitch,
    isInverted: chord.isInverted ?? false,
    colorNoteCount,
  };
};

export const sortChordsByRule = (chords: Chord[], rule?: GroupSortRule, sortKey = 'C'): Chord[] => {
  if (chords.length <= 1) return chords.slice();
  const effectiveRule: GroupSortRule = rule ?? 'ROOT_PITCH';
  if (effectiveRule === 'NAME_ASC') {
    return chords.slice().sort((a, b) => a.chordName.localeCompare(b.chordName));
  }
  const n = chords.length;
  const mappedList: SortMeta[] = new Array(n);
  for (let i = 0; i < n; i++) {
    mappedList[i] = buildSortMeta(chords[i]);
  }
  if (effectiveRule === 'ROOT_PITCH') {
    mappedList.sort((a, b) => {
      if (a.hasMarkedRoot !== b.hasMarkedRoot) return a.hasMarkedRoot ? -1 : 1;
      if (a.rootPitch !== b.rootPitch) return a.rootPitch - b.rootPitch;
      if (a.isInverted !== b.isInverted) return a.isInverted ? 1 : -1;
      if (a.colorNoteCount !== b.colorNoteCount) return a.colorNoteCount - b.colorNoteCount;
      return a.chord.chordName.localeCompare(b.chord.chordName);
    });
  } else if (effectiveRule === 'KEY_DEGREE') {
    const keyPitch = ROOT_PITCH_MAP[sortKey] ?? 0;
    mappedList.sort((a, b) => {
      if (a.hasMarkedRoot !== b.hasMarkedRoot) return a.hasMarkedRoot ? -1 : 1;
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
  const match = chordName.match(/^([A-G][#b]?)(.*)$/);
  if (!match) return chordName;
  const root = match[1];
  const suffix = match[2];
  let rootPitch = getChordRootPitch(root);
  if (rootPitch === 99) return chordName;
  rootPitch = (rootPitch + semitones + 120) % 12;
  return NOTES_SHARP[rootPitch] + suffix;
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
  chord: Pick<Chord, 'chordName' | 'capo' | 'fretCount' | 'tuning' | 'strings' | 'isInverted'>
): string => {
  const strSig = chord.strings.map(s => `${s.fret}_${s.preferFlat ? 1 : 0}_${s.isRoot ? 1 : 0}`).join('|');
  return `${chord.chordName.trim()}:${chord.capo}:${chord.fretCount}:${chord.tuning}:${chord.isInverted ? 1 : 0}:${strSig}`;
};

export const transposePhysicalChord = (chord: Chord, semitones: number, newCapo?: number, shiftName = true): Chord => {
  if (semitones === 0 && (newCapo === undefined || newCapo === chord.capo)) return chord;
  const newChord = cloneDeep(chord);
  if (shiftName) {
    newChord.chordName = transposeChordName(chord.chordName, semitones);
  }
  if (newCapo !== undefined) {
    newChord.capo = newCapo;
  }
  newChord.strings.forEach(str => {
    if (str.fret >= 0) {
      str.fret += semitones;
      if (str.fret < 0) {
        str.fret = -1;
        str.isRoot = false;
      }
    }
  });
  newChord.id = 'c_' + Math.random().toString(36).substring(2, 10);
  newChord.isInverted = computeIsInverted(newChord.strings, newChord.capo, newChord.tuning, newChord.chordName);
  newChord.fingerprint = computeChordFingerprint(newChord);
  return newChord;
};

export const getActiveBaseStrings = (tuning: TuningEnum) => {
  return TUNING_PRESETS[tuning]?.mapping || DEFAULT_TUNING_MAPPING;
};
