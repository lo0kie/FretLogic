import { FRET_COUNTS } from '@/constants';
import { Tuning } from '@/utils/musicTheory';
import type { Song } from './song';

export interface GuitarStringEntity {
  fret: number;
  preferFlat: boolean;
}

export type GuitarStringsModel = [
  GuitarStringEntity,
  GuitarStringEntity,
  GuitarStringEntity,
  GuitarStringEntity,
  GuitarStringEntity,
  GuitarStringEntity,
];

/** 分组排序规则 */
export enum GroupSortRule {
  ROOT_PITCH = 'ROOT_PITCH',
  KEY_DEGREE = 'KEY_DEGREE',
  NAME_ASC = 'NAME_ASC',
}

export interface Chord {
  id: string;
  chordName: string;
  strings: GuitarStringsModel;
  fretCount: (typeof FRET_COUNTS)[number];
  capo: number;
  groupId: string;
  tuning: Tuning;
  /** 根音所在弦的索引（单点标记，替代原来每根弦各自维护的 isRoot）；null 表示未指定根音 */
  rootStringIndex: number | null;
}

export interface Group {
  id: string;
  name: string;
  sortRule: GroupSortRule;
  sortKey?: string;
}

export interface ImportExportPayload {
  version?: number;
  groups: Group[];
  chords: Chord[];
  songs: Song[];
}

export interface GroupedChordCard {
  mainChord: Chord;
  variants: Chord[];
  hasVariants: boolean;
  variantCount: number;
}
