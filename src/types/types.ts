/**
 * @Author likan
 * @Date 2026-05-31
 * @Filepath fret-logic\src\types\types.ts
 */

import type { TuningType } from '@/utils/musicTheory';

// 馃専 强类型防线：利用 TypeScript 元组彻底限制平行动态数组，长度永远固定为 6 根标准吉他弦
export type FretTuple = [number, number, number, number, number, number];
export type BoolTuple = [boolean, boolean, boolean, boolean, boolean, boolean];

// 馃専 指板物理琴弦核心实体模型（面向未来手指编号、音级标记、高亮的实体化基础）
export interface GuitarStringEntity {
  fret: number; // -1: 哑音, 0: 空弦, 1~5: 具体按物品位
  preferFlat: boolean; // 是否强制选用降号(b)显示等音
  isRoot: boolean; // 当前音符是否被标记为整个和弦的根音
}

// 馃専 统一包装为高内聚的单一元组，未来可用于代替散落的三个平行元组
export type GuitarStringsModel = [
  GuitarStringEntity,
  GuitarStringEntity,
  GuitarStringEntity,
  GuitarStringEntity,
  GuitarStringEntity,
  GuitarStringEntity,
];

// 馃専 满血修复：明确 export 基础 Chord 接口，彻底秒杀外部组件引用的编译阻断报错
export interface Chord {
  id: number | string;
  chordName: string;
  selectedFrets: FretTuple; // 馃専 升级：锁死为强类型六元素元组
  fretCount: number;
  capo: number;
  groupId: string;
  rootMark: number;
  useFlat: BoolTuple; // 馃専 升级：锁死为强类型六元素元组
  tuning: TuningType;
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
