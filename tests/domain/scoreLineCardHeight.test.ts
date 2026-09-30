import { describe, expect, it } from 'vitest';

import { useFretboardCanvasGeometry } from '@/domains/fretboard/components/useFretboardCanvasGeometry';
import { chordCardCanvasHeightPx } from '@/domains/score/editor/lineCardHeight';

import type { Chord } from '@/domains/chord/types';
import type { FretboardCanvasPalette } from '@/domains/fretboard/fretboardCanvasPalette';

/**
 * 排列区「行内最高指板图卡的画布高」与画布实绘必须**逐像素一致** —— 它同时是离屏行的占位高度
 * 的一半（另一半是实测出来的行内留白，见 useScoreViewportRender）。
 *
 * 这里锁的是**同源**这条契约本身：本算式是画布侧推导（`useFretboardCanvasGeometry` 的 cssHeight）
 * 的镜像，两条路径各自算一遍，任何一侧改了品窗 / 弦枕 / 弦数 / 缩放的取法，这条断言就会红 ——
 * 而占位与实绘一旦分叉，内容总高会随滚动漂移、滚动落点算不准（本模块存在的理由）。
 *
 * 只覆盖**几何**：断言比的是两条独立推导的结果，不写死任何像素字面量。
 */

/** 造一个最小可用和弦：本用例只关心品窗 / 弦数 / 弦枕三项，其余字段给中性值 */
const chordOf = (options: { frets: number[]; fretCount: 4 | 5; fretOffset?: number }): Chord => ({
  id: 'c_probe' as Chord['id'],
  nameSegments: null,
  strings: options.frets.map(fret => ({ fret, preferFlat: false })),
  fretCount: options.fretCount,
  fretOffset: (options.fretOffset ?? 0) as Chord['fretOffset'],
  groupId: 'g_probe' as Chord['groupId'],
  tuning: 'STANDARD',
  rootStringIndex: null,
  barres: [],
  createdAt: 0,
  updatedAt: 0,
});

/** 本用例只读 cssHeight（纯几何量），配色不参与推导，故给一个空壳调色板 */
const NO_PALETTE = (): FretboardCanvasPalette => ({}) as FretboardCanvasPalette;

/** 画布侧的同一次推导：props 与 `ChordSlot` 交给 `FretboardCanvas` 的那一套一致 */
const canvasHeightOf = (chord: Chord, scale: number, trimEmptyEdgeFrets: boolean): number =>
  useFretboardCanvasGeometry(
    {
      chord,
      scale,
      shorthand: false,
      hideChordName: false,
      hideOpenStringNotes: false,
      hideFretNumbers: false,
      hideBoldNut: false,
      hideBarre: false,
      trimEmptyEdgeFrets,
    },
    NO_PALETTE
  ).cssHeight.value;

/** 用例表的一行：同一套算式在不同形态 / 开关 / 倍率下的取值 */
const cases: Array<{
  label: string;
  frets: number[];
  fretCount: 4 | 5;
  fretOffset?: number;
  scale: number;
  trimEmptyEdgeFrets: boolean;
}> = [
  {
    label: '零品窗口：画加粗弦枕那张图',
    frets: [0, 0, 0, 3],
    fretCount: 4,
    scale: 1.4,
    trimEmptyEdgeFrets: false,
  },
  {
    label: '偏移品窗：不画弦枕，少一条弦枕的高度',
    frets: [-1, 5, 5, 5],
    fretCount: 4,
    fretOffset: 5,
    scale: 1.4,
    trimEmptyEdgeFrets: false,
  },
  {
    label: '开启收紧：首末空品格被裁掉，网格列数变少',
    frets: [-1, 5, 5, 5],
    fretCount: 5,
    fretOffset: 5,
    scale: 1.4,
    trimEmptyEdgeFrets: true,
  },
  {
    label: '倍率只改尺寸、不改几何',
    frets: [0, 2, 2, 1],
    fretCount: 4,
    scale: 2.8,
    trimEmptyEdgeFrets: false,
  },
];

describe('排列区指板图卡的画布高算式', () => {
  it.each(cases)('$label：与画布实绘逐像素一致', ({ frets, fretCount, fretOffset, scale, trimEmptyEdgeFrets }) => {
    const chord = chordOf({ frets, fretCount, fretOffset });
    expect(chordCardCanvasHeightPx(chord, { scale, trimEmptyEdgeFrets })).toBe(
      canvasHeightOf(chord, scale, trimEmptyEdgeFrets)
    );
  });

  it('收紧品窗只会让图卡更矮，不会更高', () => {
    const chord = chordOf({ frets: [-1, 5, 5, -1], fretCount: 5, fretOffset: 5 });
    expect(chordCardCanvasHeightPx(chord, { scale: 1.4, trimEmptyEdgeFrets: true })).toBeLessThan(
      chordCardCanvasHeightPx(chord, { scale: 1.4, trimEmptyEdgeFrets: false })
    );
  });
});
