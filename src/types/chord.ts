import type { TuningEnum } from '@/utils/musicTheory';
import type { FretCount, GuitarStringsModel } from './fretboard';

export interface Chord {
  id: string;
  chordName: string;
  strings: GuitarStringsModel;
  fretCount: FretCount;
  capo: number;
  groupId: string;
  tuning: TuningEnum;
}

export interface Group {
  id: string;
  name: string;
  collapsed: boolean;
}
