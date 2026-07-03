import { GuitarStringEntity } from '@/types';

export const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export enum TuningEnum {
  STANDARD = 'STANDARD',
  DROP_D = 'DROP_D',
  DADGAD = 'DADGAD',
  OPEN_G = 'OPEN_G',
  HALF_STEP = 'HALF_STEP',
}

export const TUNING_PRESETS: Record<
  TuningEnum,
  { name: string; mapping: [number, number, number, number, number, number] }
> = {
  [TuningEnum.STANDARD]: { name: 'Standard (EADGBE)', mapping: [40, 45, 50, 55, 59, 64] },
  [TuningEnum.DROP_D]: { name: 'Drop D (DADGBE)', mapping: [38, 45, 50, 55, 59, 64] },
  [TuningEnum.DADGAD]: { name: 'DADGAD', mapping: [38, 45, 50, 55, 57, 62] },
  [TuningEnum.OPEN_G]: { name: 'Open G (DGDGBD)', mapping: [38, 43, 50, 55, 59, 62] },
  [TuningEnum.HALF_STEP]: { name: 'Half Step Down', mapping: [39, 44, 49, 54, 58, 63] },
};

export const isMuted = (s: GuitarStringEntity) => s.fret === -1;
export const isOpen = (s: GuitarStringEntity) => s.fret === 0;

export const createString = (): GuitarStringEntity => ({
  fret: -1,
  isRoot: false,
  preferFlat: false,
});

export const calcNoteLabel = (
  sIdx: number,
  fretVal: number,
  capoVal: number,
  preferFlat: boolean = false,
  baseStrings: readonly number[] = [40, 45, 50, 55, 59, 64]
): string => {
  if (fretVal === -1) return '✕';
  const base = baseStrings[sIdx];
  const actualOffset = fretVal > 0 && capoVal > 0 ? capoVal : 0;

  const noteIndex = (base + fretVal + actualOffset) % 12;
  return preferFlat ? NOTES_FLAT[noteIndex] : NOTES_SHARP[noteIndex];
};

export const extractRootNote = (chordName: string): string | null => {
  const trimmed = chordName.trim();
  if (trimmed.length === 0) return null;

  const slashParts = trimmed.split('/');
  const targetPart = slashParts.length > 1 ? slashParts[1] : slashParts[0];

  const firstChar = targetPart.charAt(0).toUpperCase();
  if (firstChar < 'A' || firstChar > 'G') return null;

  if (targetPart.length > 1) {
    const secondChar = targetPart.charAt(1);
    if (secondChar === '#' || secondChar === 'b') {
      return firstChar + secondChar;
    }
  }

  return firstChar;
};
