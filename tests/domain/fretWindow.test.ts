import { describe, expect, it } from 'vitest';

import { clampDrawFretCount, DEFAULT_FRET_COUNT, FRET_COUNTS, MIN_FRET_COUNT } from '@/domains/fretboard/constants';
import { resolveFretWindowFromUsed } from '@/domains/fretboard/model/fretWindow';

/** 用例表达用：默认开启收紧，第三个参数留给「未开启」的场景 */
const win = (stored: number, used: number[], trim = true) => resolveFretWindowFromUsed(stored, used, trim);

/** 覆盖全部品数档位，外加一档越界值 */
const STORED_CANDIDATES = [...new Set<number>([...FRET_COUNTS, DEFAULT_FRET_COUNT + 2])];

/** 1..stored 的全部非空占用组合——不变量用穷举守住，不逐例手算期望值 */
const allUsedCombos = (stored: number): number[][] => {
  const columns = Array.from({ length: stored }, (_, i) => i + 1);
  const combos: number[][] = [];
  for (let mask = 1; mask < 1 << stored; mask += 1) combos.push(columns.filter((_, i) => mask & (1 << i)));
  return combos;
};

describe('品窗收紧口径 resolveFretWindowFromUsed', () => {
  // 同一条「按占用列收紧窗口」规则的不同取值：未开启 / 首末本就占满 / 无占用 / 空弦静音不占列 /
  // 首部空列右移 / 下限只抬高起点。原先一值一例，实为同一判据的等价重复，故收成一张表；
  // 表内每行仍是独立断言，合并后检测能力与拆开时相同。
  it.each([
    {
      label: '未开启收紧：原样返回存储列数，起点不动',
      stored: DEFAULT_FRET_COUNT + 2,
      used: [DEFAULT_FRET_COUNT + 2],
      trim: false,
      drawFretCount: clampDrawFretCount(DEFAULT_FRET_COUNT + 2),
      leadTrim: 0,
    },
    {
      label: '首末本就无空列：原样返回',
      stored: DEFAULT_FRET_COUNT + 2,
      used: [1, DEFAULT_FRET_COUNT + 2],
      trim: true,
      drawFretCount: DEFAULT_FRET_COUNT + 2,
      leadTrim: 0,
    },
    {
      label: '无占用：原样返回',
      stored: DEFAULT_FRET_COUNT + 2,
      used: [] as number[],
      trim: true,
      drawFretCount: DEFAULT_FRET_COUNT + 2,
      leadTrim: 0,
    },
    {
      label: '空弦（0）与静音（-1）不占列：只用到它们等同于没有占用',
      stored: DEFAULT_FRET_COUNT + 2,
      used: [0, -1],
      trim: true,
      drawFretCount: DEFAULT_FRET_COUNT + 2,
      leadTrim: 0,
    },
    // 5 列里只用到第 4 品：起点右移 1 列（第 4 品落到窗口末列），列数收到下限
    {
      label: '首部空列右移起点，且列数同步收缩——二者必须一起动，否则圆点与横按梁落到错误的品上',
      stored: DEFAULT_FRET_COUNT + 2,
      used: [4],
      trim: true,
      drawFretCount: MIN_FRET_COUNT,
      leadTrim: 1,
    },
    {
      label: '列数下限只抬高起点，不会让窗口越过最后一个占用列',
      stored: DEFAULT_FRET_COUNT + 2,
      used: [DEFAULT_FRET_COUNT + 2],
      trim: true,
      drawFretCount: MIN_FRET_COUNT,
      leadTrim: DEFAULT_FRET_COUNT + 2 - MIN_FRET_COUNT,
    },
  ])('$label', ({ stored, used, trim, drawFretCount, leadTrim }) => {
    expect(resolveFretWindowFromUsed(stored, used, trim)).toEqual({ drawFretCount, leadTrim });
  });

  it('异常列数走 clamp 兜底：缺省 / 0 / NaN 一律回落默认档', () => {
    const fallback = clampDrawFretCount(DEFAULT_FRET_COUNT);
    expect(resolveFretWindowFromUsed(0, [0], false).drawFretCount).toBe(fallback);
    expect(resolveFretWindowFromUsed(Number.NaN, [0], false).drawFretCount).toBe(fallback);
  });

  it('不变量：任意占用组合下窗口都不低于下限、不越界，且每个占用列都落在窗口内', () => {
    for (const stored of STORED_CANDIDATES)
      for (const used of allUsedCombos(stored)) {
        const { drawFretCount, leadTrim } = win(stored, used);
        const label = `stored=${stored} used=[${used}]`;
        expect(drawFretCount, label).toBeGreaterThanOrEqual(MIN_FRET_COUNT);
        expect(leadTrim, label).toBeGreaterThanOrEqual(0);
        expect(leadTrim + drawFretCount, label).toBeLessThanOrEqual(clampDrawFretCount(stored));
        for (const fret of used) {
          expect(fret, label).toBeGreaterThanOrEqual(leadTrim + 1);
          expect(fret, label).toBeLessThanOrEqual(leadTrim + drawFretCount);
        }
      }
  });
});
