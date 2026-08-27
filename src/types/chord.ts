import type { FRET_COUNTS } from '@/utils/core/constants';
import type { Tuning } from '@/utils/music/musicTheory';
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

/** 升降状态：0: 还原/无, 1: 升号(#/♯), -1: 降号(b/♭) */
export type AccidentalType = 0 | 1 | -1;

/** 基础音名 */
export type NaturalPitchLetter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

/** 根音/低音分片：[基础自然音名, 升降状态] */
export type RootSegment = [natural: NaturalPitchLetter, accidental: AccidentalType];

/** 扩展音/变化音分片：如 [#9] -> [9, 1], [b5] -> [5, -1], [maj7] -> ['maj7', 0] */
export type ExtensionSegment = [degree: number | string, accidental?: AccidentalType];

/** 结构化和弦名分片 */
export interface ChordNameSegments {
  root: RootSegment;
  quality?: string;
  extensions?: ExtensionSegment[];
  bass?: RootSegment;
}

/** 横按描述实体 */
export interface BarreEntity {
  /** 横按所在品格（>= 1；0 品为变调夹/空弦不属于横按） */
  fret: number;
  /** 横按起始弦索引（0~5，0 代表 6 弦，5 代表 1 弦） */
  fromString: number;
  /** 横按终止弦索引（0~5，必须 >= fromString） */
  toString: number;
  /** 可选：指法指序（通常为 1 指 / 食指） */
  finger?: 1 | 2 | 3 | 4;
}

export interface Chord {
  id: string;
  /** 结构化和弦名分片（唯一核心语义真实源），未指定和弦名时为 null */
  nameSegments: ChordNameSegments | null;
  strings: GuitarStringsModel;
  fretCount: (typeof FRET_COUNTS)[number];
  capo: number;
  groupId: string;
  tuning: Tuning;
  /** 根音所在弦的索引（单点标记，替代原来每根弦各自维护的 isRoot）；null 表示未指定根音 */
  rootStringIndex: number | null;
  /** 横按配置列表（仅手动标记，支持多横按如双横按和弦）；未标记则为空 */
  barres?: BarreEntity[];
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
