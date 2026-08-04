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
  if (!chordName || typeof chordName !== 'string') return 99;
  const match = chordName.match(/^([A-G][#b]?)/);
  if (!match) return 99;
  return ROOT_PITCH_MAP[match[1]] ?? 99;
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

  strings.forEach((str, sIdx) => {
    if (str.isRoot && str.fret >= 0) {
      hasMarkedRoot = true;
      rootPitch = calcPitchIndex(sIdx, str.fret, capoVal, baseStrings);
    }
  });

  if (!hasMarkedRoot) {
    rootPitch = getChordRootPitch(chordName);
  }

  let bassPitch = -1;
  strings.forEach((str, sIdx) => {
    if (str.fret >= 0) {
      const p = calcPitchIndex(sIdx, str.fret, capoVal, baseStrings);
      if (bassPitch === -1) bassPitch = p;
    }
  });

  return bassPitch !== -1 && rootPitch !== 99 && bassPitch !== rootPitch;
};

const getColorNoteCountAndPitches = (chord: Chord, rootPitch: number) => {
  if (rootPitch === 99) return { colorNoteCount: 0, chordPitches: new Set<number>() };
  const baseStrings = TUNING_PRESETS[chord.tuning]?.mapping || DEFAULT_TUNING_MAPPING;
  const chordPitches = new Set<number>();

  chord.strings.forEach((str, sIdx) => {
    if (str.fret >= 0) {
      chordPitches.add(calcPitchIndex(sIdx, str.fret, chord.capo, baseStrings));
    }
  });

  let count = 0;
  chordPitches.forEach(p => {
    const relativeToRoot = (p - rootPitch + 12) % 12;
    if (![0, 3, 4, 7].includes(relativeToRoot)) {
      count++;
    }
  });

  return { colorNoteCount: count, chordPitches };
};

export const sortChordsByRule = (chords: Chord[], rule?: GroupSortRule, sortKey = 'C'): Chord[] => {
  const effectiveRule: GroupSortRule = rule && rule !== ('CUSTOM' as any) ? rule : 'ROOT_PITCH';
  const list = [...chords];

  if (effectiveRule === 'NAME_ASC') {
    return list.sort((a, b) => a.chordName.localeCompare(b.chordName));
  }

  const mappedList = list.map(chord => {
    const baseStrings = TUNING_PRESETS[chord.tuning]?.mapping || DEFAULT_TUNING_MAPPING;
    let hasMarkedRoot = false;
    let rootPitch = 99;

    chord.strings.forEach((str, sIdx) => {
      if (str.isRoot && str.fret >= 0) {
        hasMarkedRoot = true;
        rootPitch = calcPitchIndex(sIdx, str.fret, chord.capo, baseStrings);
      }
    });

    if (!hasMarkedRoot) {
      rootPitch = getChordRootPitch(chord.chordName);
    }

    const { colorNoteCount } = getColorNoteCountAndPitches(chord, rootPitch);
    const isInverted = chord.isInverted ?? false;

    return { chord, hasMarkedRoot, rootPitch, isInverted, colorNoteCount };
  });

  if (effectiveRule === 'ROOT_PITCH') {
    mappedList.sort((a, b) => {
      if (a.hasMarkedRoot !== b.hasMarkedRoot) return a.hasMarkedRoot ? -1 : 1;
      if (a.rootPitch !== b.rootPitch) return a.rootPitch - b.rootPitch;
      if (a.isInverted !== b.isInverted) return a.isInverted ? 1 : -1;
      if (a.colorNoteCount !== b.colorNoteCount) return a.colorNoteCount - b.colorNoteCount;
      return a.chord.chordName.localeCompare(b.chord.chordName);
    });
    return mappedList.map(item => item.chord);
  }

  if (effectiveRule === 'KEY_DEGREE') {
    const keyPitch = ROOT_PITCH_MAP[sortKey] ?? 0;
    const diatonicIntervals = new Set([0, 2, 4, 5, 7, 9, 11]);
    const DIATONIC_DEGREE_MAP = [1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6, 7];

    const degreeMappedList = mappedList.map(item => {
      let isRootDiatonic = false;
      let degree = 99;

      if (item.rootPitch !== 99) {
        const intervalToKey = (item.rootPitch - keyPitch + 12) % 12;
        degree = DIATONIC_DEGREE_MAP[intervalToKey];
        isRootDiatonic = diatonicIntervals.has(intervalToKey);
      }

      return { ...item, isRootDiatonic, degree };
    });

    degreeMappedList.sort((a, b) => {
      if (a.hasMarkedRoot !== b.hasMarkedRoot) return a.hasMarkedRoot ? -1 : 1;
      if (a.isRootDiatonic !== b.isRootDiatonic) return a.isRootDiatonic ? -1 : 1;
      if (a.degree !== b.degree) return a.degree - b.degree;
      if (a.isInverted !== b.isInverted) return a.isInverted ? 1 : -1;
      if (a.colorNoteCount !== b.colorNoteCount) return a.colorNoteCount - b.colorNoteCount;
      return a.chord.chordName.localeCompare(b.chord.chordName);
    });

    return degreeMappedList.map(item => item.chord);
  }

  return list;
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
    // 🌟 在变体合并展示时，优先把「原位和弦」作为主指法，其次再按 Capo 排序
    variants.sort((a, b) => {
      const aInverted = a.isInverted ?? false;
      const bInverted = b.isInverted ?? false;
      if (aInverted !== bInverted) return aInverted ? 1 : -1;
      return (a.capo ?? 0) - (b.capo ?? 0);
    });

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

export const computeChordFingerprint = (
  chord: Pick<Chord, 'groupId' | 'chordName' | 'capo' | 'fretCount' | 'tuning' | 'strings' | 'isInverted'>
): string => {
  const strSig = chord.strings.map(s => `${s.fret}_${s.preferFlat ? 1 : 0}_${s.isRoot ? 1 : 0}`).join('|');
  // 🌟 将 isInverted 混入指纹，对齐去重逻辑
  return `${chord.groupId}:${chord.chordName.trim()}:${chord.capo}:${chord.fretCount}:${chord.tuning}:${chord.isInverted ? 1 : 0}:${strSig}`;
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
