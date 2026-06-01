/**
 * @Author likan
 * @Date 2026-06-01
 * @Filepath fret-logic/src/types/chord.ts
 */

import type { TuningType } from '@/utils/musicTheory';

// 🌟 核心落地：单一琴弦的物理高内聚实体模型
export interface GuitarStringEntity {
  fret: number; // -1: 哑音, 0: 空弦, 1~N: 对应指板品位 [cite: 316, 317]
  preferFlat: boolean; // 当前弦是否强制选用降号(b)显示等音 [cite: 317]
  isRoot: boolean; // 当前弦的音符是否被标记为整个和弦的根音 [cite: 317]
}

// 🌟 强类型锁死：利用 TypeScript 元组限制平行动态数组，长度永远固定为 6 根吉他弦 [cite: 315, 318]
export type GuitarStringsModel = [
  GuitarStringEntity,
  GuitarStringEntity,
  GuitarStringEntity,
  GuitarStringEntity,
  GuitarStringEntity,
  GuitarStringEntity,
];

// 🌟 极致纯净、满血重构的单一和弦核心接口 [cite: 319]
export interface Chord {
  id: number | string;
  chordName: string;
  strings: GuitarStringsModel; // 🚀 降维打击：面向未来指法编号与音级标记的实体化基础 [cite: 316, 319]
  fretCount: number;
  capo: number;
  groupId: string;
  tuning: TuningType;
  barreFret?: number; // 手动横按标记品位 (0 为无横按)
}

export interface Group {
  id: string;
  name: string;
  collapsed: boolean;
}

export interface Toast {
  id: number;
  msg: string;
  canUndo: boolean;
}
