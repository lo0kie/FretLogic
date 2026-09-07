import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { reconcileBarres, useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import {
  computeBarreCandidates,
  isBarreStillValid,
  normalizeAndMergeBarres,
} from '@/domains/fretboard/model/coordinates';

import type { BarreEntity, GuitarStringsModel } from '@/domains/fretboard/types';

/** 按弦序构造六弦模型（全部不偏好降号） */
const strings = (...frets: number[]): GuitarStringsModel => frets.map(f => [f, false]) as unknown as GuitarStringsModel;

describe('setBarres（编辑器 store）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('手动标记横按不取消自动横按状态', () => {
    const store = useChordEditorStore();
    store.autoBarre = true;
    store.setBarres([{ fret: 1, fromString: 0, toString: 5 }]);
    expect(store.autoBarre).toBe(true);
    expect(store.draftChord.barres).toEqual([{ fret: 1, fromString: 0, toString: 5 }]);
  });

  it('清除横按同样保留自动横按状态', () => {
    const store = useChordEditorStore();
    store.autoBarre = true;
    store.setBarres([{ fret: 1, fromString: 0, toString: 5 }]);
    store.setBarres([]);
    expect(store.autoBarre).toBe(true);
    expect(store.draftChord.barres).toBeUndefined();
  });
});

describe('computeBarreCandidates', () => {
  it('F 大三和弦 133211：产出 1 品全横按 + 3 品 4/3 弦小横按', () => {
    const result = computeBarreCandidates(strings(1, 3, 3, 2, 1, 1), 5);
    expect(result).toEqual([
      { fret: 1, fromString: 0, toString: 5, finger: 1 },
      { fret: 3, fromString: 1, toString: 2, finger: 1 },
    ]);
  });

  it('22x222：静音弦切断，产出两组候选', () => {
    const result = computeBarreCandidates(strings(2, 2, -1, 2, 2, 2), 5);
    expect(result).toEqual([
      { fret: 2, fromString: 0, toString: 1, finger: 1 },
      { fret: 2, fromString: 3, toString: 5, finger: 1 },
    ]);
  });

  it('端点之间允许更高品位（食指垫底）：244222 产出 2 品全跨度 + 4 品小横按', () => {
    const result = computeBarreCandidates(strings(2, 4, 4, 2, 2, 2), 5);
    expect(result).toEqual([
      { fret: 2, fromString: 0, toString: 5, finger: 1 },
      { fret: 4, fromString: 1, toString: 2, finger: 1 },
    ]);
  });

  it('空弦切断连续段：220222 产出两组候选', () => {
    const result = computeBarreCandidates(strings(2, 2, 0, 2, 2, 2), 5);
    expect(result).toEqual([
      { fret: 2, fromString: 0, toString: 1, finger: 1 },
      { fret: 2, fromString: 3, toString: 5, finger: 1 },
    ]);
  });

  it('同一品位不足两根弦时不产出候选', () => {
    expect(computeBarreCandidates(strings(3, -1, -1, -1, -1, -1), 5)).toEqual([]);
  });

  it('相同输入命中缓存返回同一引用', () => {
    const s = strings(1, 3, 3, 2, 1, 1);
    expect(computeBarreCandidates(s, 5)).toBe(computeBarreCandidates(s, 5));
  });
});

describe('isBarreStillValid', () => {
  const barre: BarreEntity = { fret: 1, fromString: 0, toString: 5 };

  it('标准 F 横按有效', () => {
    expect(isBarreStillValid(strings(1, 3, 3, 2, 1, 1), barre)).toBe(true);
  });

  it('端点弦被移走（静音或换品位）则失效', () => {
    expect(isBarreStillValid(strings(-1, 3, 3, 2, 1, 1), barre)).toBe(false);
    expect(isBarreStillValid(strings(2, 3, 3, 2, 1, 1), barre)).toBe(false);
    expect(isBarreStillValid(strings(1, 3, 3, 2, 1, -1), barre)).toBe(false);
  });

  it('覆盖范围内出现静音弦则失效', () => {
    expect(isBarreStillValid(strings(1, -1, 1, 1, 1, 1), barre)).toBe(false);
  });

  it('覆盖范围内出现空弦则失效', () => {
    expect(isBarreStillValid(strings(1, 0, 1, 1, 1, 1), barre)).toBe(false);
  });

  it('覆盖范围内出现更低品位则失效', () => {
    expect(isBarreStillValid(strings(2, 1, 2, 2, 2, 2), { fret: 2, fromString: 0, toString: 5 })).toBe(false);
  });

  it('覆盖范围内出现更高品位（垫底）仍有效', () => {
    expect(isBarreStillValid(strings(2, 4, 4, 2, 2, 2), { fret: 2, fromString: 0, toString: 5 })).toBe(true);
  });

  it('跨度不足两根弦或品位为 0 时无效', () => {
    expect(isBarreStillValid(strings(1, 3, 3, 2, 1, 1), { fret: 1, fromString: 2, toString: 2 })).toBe(false);
    expect(isBarreStillValid(strings(0, 0, -1, -1, -1, -1), { fret: 0, fromString: 0, toString: 1 })).toBe(false);
  });
});

describe('reconcileBarres', () => {
  it('弦品位未变化时返回原引用', () => {
    const oldFrets = [1, 3, 3, 2, 1, 1];
    const oldBarres: BarreEntity[] = [{ fret: 1, fromString: 0, toString: 5 }];
    expect(reconcileBarres(oldFrets, oldFrets, oldBarres)).toBe(oldBarres);
  });

  it('外侧锚点被移除时边界向内收缩到最近的锚点弦', () => {
    const result = reconcileBarres([-1, 3, 3, 2, 1, 1], [1, 3, 3, 2, 1, 1], [{ fret: 1, fromString: 0, toString: 5 }]);
    expect(result).toEqual([{ fret: 1, fromString: 4, toString: 5 }]);
  });

  it('所有锚点被移除时横按废弃', () => {
    const result = reconcileBarres([3, 3, 3, 2, 2, 2], [1, 3, 3, 2, 1, 1], [{ fret: 1, fromString: 0, toString: 5 }]);
    expect(result).toBeUndefined();
  });

  it('覆盖范围内出现静音弦时横按废弃（与 isBarreStillValid 语义一致）', () => {
    const result = reconcileBarres([2, -1, 4, 2, 2, 2], [2, 4, 4, 2, 2, 2], [{ fret: 2, fromString: 0, toString: 5 }]);
    expect(result).toBeUndefined();
  });

  it('端点换品位时收缩到剩余锚点范围', () => {
    const result = reconcileBarres([2, 4, 4, 2, 2, 3], [2, 4, 4, 2, 2, 2], [{ fret: 2, fromString: 0, toString: 5 }]);
    expect(result).toEqual([{ fret: 2, fromString: 0, toString: 4 }]);
  });

  it('支持同品位非重叠的多条横按同时并存与校验', () => {
    const barres: BarreEntity[] = [
      { fret: 2, fromString: 0, toString: 1 },
      { fret: 2, fromString: 3, toString: 5 },
    ];
    const result = reconcileBarres([2, 2, -1, 2, 2, 2], [2, 2, -1, 2, 2, 2], barres);
    expect(result).toBe(barres);
  });
});

describe('横按包含吸收与打断拆分（用户 222x22 场景）', () => {
  it('大横按应完全吸收被其覆盖的较小子横按', () => {
    const s = strings(2, 2, 2, 2, 2, 2);
    const existing: BarreEntity[] = [
      { fret: 2, fromString: 0, toString: 2 },
      { fret: 2, fromString: 4, toString: 5 },
      { fret: 2, fromString: 0, toString: 5 },
    ];
    const merged = normalizeAndMergeBarres(existing, s);
    expect(merged).toEqual([{ fret: 2, fromString: 0, toString: 5 }]);
  });

  it('222x22 标记左右横按后补齐全横按再删除中间音符，仅保留左侧三个音符的横按', () => {
    setActivePinia(createPinia());
    const store = useChordEditorStore();
    store.autoBarre = true;

    // 1. 设置 2 2 2 x 2 2
    store.draftChord.strings = strings(2, 2, 2, -1, 2, 2);
    // 2. 手动给左右两侧都标记为横按
    store.setBarres([
      { fret: 2, fromString: 0, toString: 2 },
      { fret: 2, fromString: 4, toString: 5 },
    ]);
    expect(store.draftChord.barres).toHaveLength(2);

    // 3. 把 x 也改成 2（变成 2 2 2 2 2 2）
    store.draftChord.strings[3]![0] = 2;
    // 此时全横按形成，应吸收原本的两个碎横按
    expect(store.draftChord.barres).toMatchObject([{ fret: 2, fromString: 0, toString: 5 }]);

    // 4. 再把该音符删除（变回 2 2 2 x 2 2）
    store.draftChord.strings[3]![0] = -1;
    // 预期应仅保留左侧三个音符的横按，右侧两个音符不足 3 颗音符不作为横按保留！
    expect(store.draftChord.barres).toMatchObject([{ fret: 2, fromString: 0, toString: 2 }]);
  });
});
