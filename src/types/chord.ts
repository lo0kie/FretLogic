import { FRET_COUNTS } from '@/constants';
import { TuningEnum } from '@/utils/musicTheory';
import type { Song } from './song';

export type Writable<T> = {
  -readonly [P in keyof T]: T[P];
};

export interface GuitarStringEntity {
  fret: number;
  preferFlat: boolean;
  isRoot: boolean;
}

export type GuitarStringsModel = [
  GuitarStringEntity,
  GuitarStringEntity,
  GuitarStringEntity,
  GuitarStringEntity,
  GuitarStringEntity,
  GuitarStringEntity,
];

export interface Chord {
  id: string;
  chordName: string;
  strings: GuitarStringsModel;
  fretCount: (typeof FRET_COUNTS)[number];
  capo: number;
  groupId: string;
  tuning: TuningEnum;
  fingerprint?: string;
}

export interface Group {
  id: string;
  name: string;
  collapsed: boolean;
}

export interface ImportExportPayload {
  groups: Group[];
  chords: Chord[];
  songs?: Song[]; // 🌟 新增乐谱备份支持
}
