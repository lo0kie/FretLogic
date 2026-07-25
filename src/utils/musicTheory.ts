import { GuitarStringEntity } from '@/types';

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
