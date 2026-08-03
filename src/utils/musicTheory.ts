import type { Chord, GroupSortRule, GuitarStringEntity } from '@/types';

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
