import { describe, expect, it } from 'vitest';

import { pruneForFretCount } from '@/domains/chord/store/chordBarreLogic';
import { MUTED_FRET } from '@/domains/fretboard/constants';

import type { BarreEntity, GuitarStringEntity, StringIndex } from '@/domains/chord/types';

/** 以指法简写（-1 静音 / 0 空弦 / 正数按弦品）构造弦模型，preferFlat 与断言无关恒为 false */
const stringsOf = (frets: number[]): GuitarStringEntity[] => frets.map(fret => ({ fret, preferFlat: false }));

const barreOf = (fret: number, fromString: number, toString: number): BarreEntity => ({
  fret: fret as BarreEntity['fret'],
  fromString,
  toString,
});

type PruneState = Parameters<typeof pruneForFretCount>[0];

const stateOf = (
  frets: number[],
  extra?: Partial<Pick<PruneState, 'fretOffset' | 'rootStringIndex' | 'barres'>>
): PruneState => ({
  strings: stringsOf(frets),
  rootStringIndex: null,
  fretOffset: 0,
  ...extra,
});

const fretsOf = (state: PruneState): number[] => state.strings.map(s => s.fret);

describe('pruneForFretCount 缩品裁剪', () => {
  it('用户例子：4 品 xx444x 切 3 品得 xx333x（删首部空列，绝对品位不变）', () => {
    const state = stateOf([MUTED_FRET, MUTED_FRET, 4, 4, 4, MUTED_FRET], { rootStringIndex: 2 });
    pruneForFretCount(state, 3, 4);
    expect(fretsOf(state)).toEqual([MUTED_FRET, MUTED_FRET, 3, 3, 3, MUTED_FRET]);
    expect(state.fretOffset).toBe(1);
    // 根音弦仍在按弦，根标记保留
    expect(state.rootStringIndex).toBe(2);
  });

  it('首部无空列时回退为掐音：1x44xx 切 3 品 → 1xxxxx（fretOffset 不动）', () => {
    const state = stateOf([1, MUTED_FRET, 4, 4, MUTED_FRET, MUTED_FRET]);
    pruneForFretCount(state, 3, 4);
    expect(fretsOf(state)).toEqual([1, MUTED_FRET, MUTED_FRET, MUTED_FRET, MUTED_FRET, MUTED_FRET]);
    expect(state.fretOffset).toBe(0);
  });

  it('首部空列不足时先移窗、余量掐音：xx2xx5 切 3 品 → x1xxxx（fretOffset 1）', () => {
    // overflow=2，首部空列只有 1 个（列 2 被 2 品音占用）→ shift 1 后 5 品音变 4 品仍越界，掐掉
    const state = stateOf([MUTED_FRET, 2, MUTED_FRET, MUTED_FRET, 5, MUTED_FRET]);
    pruneForFretCount(state, 3, 5);
    expect(fretsOf(state)).toEqual([MUTED_FRET, 1, MUTED_FRET, MUTED_FRET, MUTED_FRET, MUTED_FRET]);
    expect(state.fretOffset).toBe(1);
  });

  it('fretOffset 已达上限 12 时无法移窗，直接掐音', () => {
    const state = stateOf([MUTED_FRET, MUTED_FRET, 4, 4, MUTED_FRET, MUTED_FRET], { fretOffset: 12 });
    pruneForFretCount(state, 3, 4);
    expect(fretsOf(state)).toEqual([MUTED_FRET, MUTED_FRET, MUTED_FRET, MUTED_FRET, MUTED_FRET, MUTED_FRET]);
    expect(state.fretOffset).toBe(12);
  });

  it('无越界音时只缩窗不改数据：xx222x 切 3 品原样保留', () => {
    const state = stateOf([MUTED_FRET, MUTED_FRET, 2, 2, 2, MUTED_FRET]);
    pruneForFretCount(state, 3, 4);
    expect(fretsOf(state)).toEqual([MUTED_FRET, MUTED_FRET, 2, 2, 2, MUTED_FRET]);
    expect(state.fretOffset).toBe(0);
  });

  it('横按随窗口平移且保持有效；锚点被掐的横按随之废弃', () => {
    // 横按 fret 2 跨 2-3 弦：shift 1 后落 fret 1，锚点仍在 → 保留；
    // 横按 fret 5 跨 5-6 弦：shift 1 后落 fret 4 仍越界 → 废弃
    const state = stateOf([MUTED_FRET, 2, 2, MUTED_FRET, 5, MUTED_FRET], {
      barres: [barreOf(2, 1, 2), barreOf(5, 4, 5)],
    });
    pruneForFretCount(state, 3, 5);
    expect(fretsOf(state)).toEqual([MUTED_FRET, 1, 1, MUTED_FRET, MUTED_FRET, MUTED_FRET]);
    expect(state.barres).toEqual([barreOf(1, 1, 2)]);
  });

  it('被掐音的弦若是根音弦，根标记一并失效', () => {
    const state = stateOf([1, MUTED_FRET, 4, 4, MUTED_FRET, MUTED_FRET], { rootStringIndex: 2 as StringIndex });
    pruneForFretCount(state, 3, 4);
    expect(state.rootStringIndex).toBeNull();
  });
});
