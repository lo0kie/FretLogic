import { describe, expect, it } from 'vitest';

import {
  absoluteFretLabel,
  absoluteFretOffsetOf,
  barreBeamRectOf,
  fretCenterYOf,
  fretLineYOf,
  gridBottomYOf,
  isBarreInWindow,
  isZeroFretWindow,
  showsFretNumber,
} from '@/domains/fretboard/model/fretGeometry';

/** 任意一组原点与品高：本模块是纯算式，断言只关心「给定这两者后的相对关系」 */
const GRID_TOP = 40;
const FRET_HEIGHT = 25;

describe('指板几何算式内核', () => {
  it('品格中心落在相邻两条品丝线的中点', () => {
    for (let fret = 1; fret <= 5; fret++) {
      const center = fretCenterYOf(fret, GRID_TOP, FRET_HEIGHT);
      const topLine = fretLineYOf(fret - 1, GRID_TOP, FRET_HEIGHT);
      const bottomLine = fretLineYOf(fret, GRID_TOP, FRET_HEIGHT);
      expect(center).toBeCloseTo((topLine + bottomLine) / 2);
    }
  });

  it('网格纵向底端就是末品丝线', () => {
    expect(gridBottomYOf(5, GRID_TOP, FRET_HEIGHT)).toBe(fretLineYOf(5, GRID_TOP, FRET_HEIGHT));
  });

  it('横按梁纵向对齐所在品中心，横向按跨度两端各外扩半个厚度', () => {
    const thickness = 8;
    const rect = barreBeamRectOf(2, { fromX: 100, toX: 60 }, thickness, GRID_TOP, FRET_HEIGHT);

    expect(rect.y).toBeCloseTo(fretCenterYOf(2, GRID_TOP, FRET_HEIGHT) - thickness / 2);
    expect(rect.height).toBe(thickness);
    // 两端各外扩半个厚度 ⇒ 宽度 = 跨度 + 整个厚度；跨度两端传反（toX < fromX）不影响结果
    expect(rect.width).toBeCloseTo(40 + thickness);
    expect(rect.x).toBeCloseTo(60 - thickness / 2);
  });

  it('横按越出可视品窗即不绘制', () => {
    expect(isBarreInWindow(1, 4)).toBe(true);
    expect(isBarreInWindow(4, 4)).toBe(true);
    expect(isBarreInWindow(0, 4)).toBe(false);
    expect(isBarreInWindow(5, 4)).toBe(false);
  });

  it('绝对品号随偏移窗口整体上移，零品窗口即品序本身', () => {
    expect(absoluteFretLabel(0, 3)).toBe(3);
    expect(absoluteFretLabel(5, 3)).toBe(8);
  });

  it('品号只画在首末两品之间', () => {
    expect(showsFretNumber(0, 4)).toBe(false);
    expect(showsFretNumber(1, 4)).toBe(true);
    expect(showsFretNumber(3, 4)).toBe(true);
    expect(showsFretNumber(4, 4)).toBe(false);
  });

  it('只有零品窗口才算「该画加粗弦枕」的那一档', () => {
    expect(isZeroFretWindow(0)).toBe(true);
    expect(isZeroFretWindow(2)).toBe(false);
  });

  it('绘制用的绝对偏移把品窗收紧的首列右移量一并计入，缺省偏移按 0 算', () => {
    expect(absoluteFretOffsetOf(3, 2)).toBe(5);
    expect(absoluteFretOffsetOf(undefined, 2)).toBe(2);
    expect(absoluteFretOffsetOf(null, 0)).toBe(0);
  });
});
