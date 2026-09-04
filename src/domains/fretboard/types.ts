import type { Brand } from '@/platform/types/brand';

/** 单根琴弦：[0] 品位（-1 静音 / 0 空弦 / >=1 按品），[1] 是否偏好降号 */
export type GuitarStringEntity = [fret: number, preferFlat: boolean];

/** 琴弦模型：动态长度的琴弦数组（支持 3~10 弦，常用 4/6/7/8 弦） */
export type GuitarStringsModel = GuitarStringEntity[];

/** 琴弦索引：从 0 开始的非负整数（0 代表最低音粗弦，如 6 弦吉他的低 E） */
export type StringIndex = number;

/** 变调夹品位（0 表示不使用变调夹，上限 12） */
export type Capo = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** 和弦指板品位/把位偏移量（0 表示指板视窗从 1 品起步，上限 12） */
export type FretOffset = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** 品牌数值：横按所在品位（正整数 >= 1；0 品为变调夹/空弦不属于横按），运行时仍是 number */
export type BarreFret = Brand<number, 'BarreFret'>;

/** 横按描述实体 */
export interface BarreEntity {
  /** 横按所在品位（>= 1；0 品为变调夹/空弦不属于横按） */
  fret: BarreFret;
  /** 横按起始弦索引（0~5，0 代表 6 弦，5 代表 1 弦） */
  fromString: StringIndex;
  /** 横按终止弦索引（0~5，必须 >= fromString） */
  toString: StringIndex;
  /** 可选：指法指序（通常为 1 指 / 食指） */
  finger?: 1 | 2 | 3 | 4;
}
