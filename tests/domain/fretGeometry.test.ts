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

/** 品窗规则表的一行：同一条规则的不同取值只差入参与期望值 */
type FretWindowCase = { label: string; actual: () => number | boolean; expected: number | boolean };

describe('指板几何算式内核', () => {
  it('品格中心落在相邻两条品丝线的中点', () => {
    for (let fret = 1; fret <= 5; fret++) {
      const center = fretCenterYOf(fret, GRID_TOP, FRET_HEIGHT);
      const topLine = fretLineYOf(fret - 1, GRID_TOP, FRET_HEIGHT);
      const bottomLine = fretLineYOf(fret, GRID_TOP, FRET_HEIGHT);
      expect(center).toBeCloseTo((topLine + bottomLine) / 2);
    }
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

  /**
   * 品窗派生 / 裁剪判据：同一组规则的不同取值，逐行对应一条判据（含各条边界）。
   *
   * 判据的设计理由（见内核注释，改任一条前须先读）：
   * - 品号只标 `1..fretCount-1`，与 Canvas 的 `for (f = 1; f < fretCount; f++)` 同一判据；
   * - 只有零品窗口（fretOffset === 0）画加粗弦枕，偏移窗口下该位置留给品号；
   * - 越出可视品窗的横按两介质都不绘制；
   * - 绝对偏移 = 和弦自身偏移 + 品窗收紧的首列右移量（leadTrim），缺省偏移按 0 算 ——
   *   主线程 renderFretboardCanvas 与导出 Worker scoreExportFretboard 此前各写一遍同一算式。
   */
  it.each<FretWindowCase>([
    {
      label: '网格纵向底端就是末品丝线',
      actual: () => gridBottomYOf(5, GRID_TOP, FRET_HEIGHT),
      // 期望值**独立算出来**（末品丝线 = 网格顶 + 品数 × 品高），不再用 fretLineYOf 反推 ——
      // 两个函数一起改错时，互推的期望值会跟着一起错、这条断言就白写了
      expected: GRID_TOP + 5 * FRET_HEIGHT,
    },
    { label: '横按落在窗内首品（1/4）', actual: () => isBarreInWindow(1, 4), expected: true },
    { label: '横按落在窗内末品（4/4）', actual: () => isBarreInWindow(4, 4), expected: true },
    { label: '横按低于窗下界（0/4）不绘制', actual: () => isBarreInWindow(0, 4), expected: false },
    { label: '横按越出窗上界（5/4）不绘制', actual: () => isBarreInWindow(5, 4), expected: false },
    { label: '零品窗口：绝对品号即品序', actual: () => absoluteFretLabel(0, 3), expected: 3 },
    { label: '偏移窗口：绝对品号随窗口整体上移', actual: () => absoluteFretLabel(5, 3), expected: 8 },
    { label: '首品不标品号（0/4）', actual: () => showsFretNumber(0, 4), expected: false },
    { label: '首品之后起标（1/4）', actual: () => showsFretNumber(1, 4), expected: true },
    { label: '末品之前仍标（3/4）', actual: () => showsFretNumber(3, 4), expected: true },
    { label: '末品不标品号（4/4）', actual: () => showsFretNumber(4, 4), expected: false },
    { label: '零品窗口才算「该画加粗弦枕」的那一档', actual: () => isZeroFretWindow(0), expected: true },
    { label: '偏移窗口不算零品窗口（2）', actual: () => isZeroFretWindow(2), expected: false },
    {
      label: '绝对偏移把品窗收紧的首列右移量一并计入',
      actual: () => absoluteFretOffsetOf(3, 2),
      expected: 5,
    },
    { label: '缺省偏移（undefined）按 0 算', actual: () => absoluteFretOffsetOf(undefined, 2), expected: 2 },
    { label: '空偏移（null）按 0 算', actual: () => absoluteFretOffsetOf(null, 0), expected: 0 },
  ])('$label', ({ actual, expected }) => {
    expect(actual()).toBe(expected);
  });
});
