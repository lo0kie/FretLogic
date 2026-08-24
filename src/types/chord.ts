import type { FRET_COUNTS } from '@/utils/constants';
import type { Tuning } from '@/utils/musicTheory';
import type { Song } from './song';

/** 单根琴弦：[0] 品位（-1 静音 / 0 空弦 / >=1 按品），[1] 是否偏好降号 */
export type GuitarStringEntity = [fret: number, preferFlat: boolean];

/** 六根弦的二维数组（固定长度 6） */
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
