import type { TuningType } from '@/utils/musicTheory';

export const FRET_COUNTS = [3, 4, 5] as const;
export type FretCount = (typeof FRET_COUNTS)[number];

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
  fretCount: FretCount;
  capo: number;
  groupId: string;
  tuning: TuningType;
}

export interface Group {
  id: string;
  name: string;
  collapsed: boolean;
}

// 🌟 核心修改：拓展支持 Promise 状态的 Toast 类型
export type ToastType = 'info' | 'success' | 'error' | 'loading';

export interface Toast {
  id: number;
  msg: string;
  type: ToastType;
  canUndo?: boolean;
}
