import type { Chord, GroupedChordCard, GroupSortRule, GuitarStringEntity } from '@/types';
import { cloneDeep } from './dataParser';

export const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export const TUNING_MAPPING_STANDARD = Object.freeze([40, 45, 50, 55, 59, 64] as const);
export const TUNING_MAPPING_DROP_D = Object.freeze([38, 45, 50, 55, 59, 64] as const);
export const TUNING_MAPPING_DADGAD = Object.freeze([38, 45, 50, 55, 57, 62] as const);
export const TUNING_MAPPING_OPEN_G = Object.freeze([38, 43, 50, 55, 59, 62] as const);
export const TUNING_MAPPING_HALF_STEP = Object.freeze([39, 44, 49, 54, 58, 63] as const);

export const DEFAULT_TUNING_MAPPING = TUNING_MAPPING_STANDARD;

export enum TuningEnum {
  STANDARD = 'STANDARD',
  DROP_D = 'DROP_D',
  DADGAD = 'DADGAD',
  OPEN_G = 'OPEN_G',
  HALF_STEP = 'HALF_STEP',
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
};

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

export const isAccidentalNote = (pitchIndex: number): boolean => {
  return [1, 3, 6, 8, 10].includes(pitchIndex);
};

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

const ROOT_PITCH_MAP: Record<string, number> = {
  'C': 0,
  'C#': 1,
  'Db': 1,
  'D': 2,
  'D#': 3,
  'Eb': 3,
  'E': 4,
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
};

export const getChordRootPitch = (chordName: string): number => {
  const match = chordName.match(/^([A-G][#b]?)/);
  if (!match) return 99;
  return ROOT_PITCH_MAP[match[1]] ?? 99;
};

export const sortChordsByRule = (chords: Chord[], rule?: GroupSortRule, sortKey = 'C'): Chord[] => {
  if (!rule || rule === 'CUSTOM') return chords;
  const list = [...chords];
  if (rule === 'NAME_ASC') {
    return list.sort((a, b) => a.chordName.localeCompare(b.chordName));
  }
  if (rule === 'ROOT_PITCH') {
    return list.sort((a, b) => getChordRootPitch(a.chordName) - getChordRootPitch(b.chordName));
  }
  if (rule === 'KEY_DEGREE') {
    const keyPitch = ROOT_PITCH_MAP[sortKey] ?? 0;
    return list.sort((a, b) => {
      const pitchA = getChordRootPitch(a.chordName);
      const pitchB = getChordRootPitch(b.chordName);
      const intervalA = pitchA === 99 ? 99 : (pitchA - keyPitch + 12) % 12;
      const intervalB = pitchB === 99 ? 99 : (pitchB - keyPitch + 12) % 12;
      return intervalA - intervalB;
    });
  }
  return list;
};

// 🌟 P3 移调引擎
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

export const groupChordsByName = (chords: Chord[]): GroupedChordCard[] => {
  const map = new Map<string, Chord[]>();

  chords.forEach(chord => {
    const key = chord.chordName.trim().toLowerCase();
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(chord);
  });

  const result: GroupedChordCard[] = [];

  map.forEach(variants => {
    variants.sort((a, b) => (a.capo ?? 0) - (b.capo ?? 0));

    const mainChord = variants[0];
    result.push({
      mainChord,
      variants,
      hasVariants: variants.length > 1,
      variantCount: variants.length,
    });
  });

  return result;
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
  newChord.fingerprint = undefined;
  return newChord;
};
