import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { reconcileBarres, useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import {
  computeBarreCandidates,
  isBarreStillValid,
  normalizeAndMergeBarres,
} from '@/domains/fretboard/model/coordinates';
import { idb } from '@/platform/services/storage';
import { hydrateIdbKv } from '@/platform/services/storage/idbKv';

import type { BarreEntity, BarreFret, GuitarStringsModel } from '@/domains/fretboard/types';

/** 按弦序构造六弦模型（全部不偏好降号） */
const strings = (...frets: number[]): GuitarStringsModel => frets.map(f => ({ fret: f, preferFlat: false }));

/**
 * 夹具窄化：横按品位在源码里是 branded BarreFret，测试按字面量书写后集中转换一次。
 * 参数放宽为 number 是因为失效用例要刻意构造越界值（如 fret: 0 不属于横按）。
 */
const barre = (fret: number, fromString: number, toString: number): BarreEntity => ({
  fret: fret as BarreFret,
  fromString,
  toString,
});

describe('setBarres（编辑器 store）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  // 「手动标记」与「清除横按」是 setBarres 的两个调用点，契约同为「不触碰 autoBarre」，
  // 差别只在最终落地的 barres，故收成一张表：calls 是依次发起的 setBarres 调用序列。
  it.each([
    {
      label: '手动标记横按：写入横按',
      calls: [[barre(1, 0, 5)]],
      expected: [{ fret: 1, fromString: 0, toString: 5 }],
    },
    {
      label: '清除横按：先标记再清空',
      calls: [[barre(1, 0, 5)], []],
      expected: undefined,
    },
  ])('$label 均不取消自动横按状态', ({ calls, expected }) => {
    const store = useChordEditorStore();
    store.autoBarre = true;
    for (const call of calls) store.setBarres(call);
    expect(store.autoBarre).toBe(true);
    expect(store.draftChord.barres).toEqual(expected);
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

  // 静音 / 空弦 / 更高品位切断连续段的取值见下方 isBarreStillValid 的 canBarreCover 参数表：
  // 同一条 `f < fret` 分支，两处（候选生成、有效性判定）只是同一规则的两种观测口径。

  it('同一品位不足两根弦时不产出候选', () => {
    expect(computeBarreCandidates(strings(3, -1, -1, -1, -1, -1), 5)).toEqual([]);
  });
});

describe('isBarreStillValid', () => {
  const fullBarre = barre(1, 0, 5);

  it('标准 F 横按有效', () => {
    expect(isBarreStillValid(strings(1, 3, 3, 2, 1, 1), fullBarre)).toBe(true);
  });

  it('端点弦被移走（静音或换品位）则失效', () => {
    expect(isBarreStillValid(strings(-1, 3, 3, 2, 1, 1), fullBarre)).toBe(false);
    expect(isBarreStillValid(strings(2, 3, 3, 2, 1, 1), fullBarre)).toBe(false);
    expect(isBarreStillValid(strings(1, 3, 3, 2, 1, -1), fullBarre)).toBe(false);
  });

  /**
   * canBarreCover 的 `f < fret` 单分支，只看「覆盖范围内中间弦的品位落在横按品位的哪一侧」：
   * 静音(-1) / 空弦(0) / 更低品 都低于横按品位 ⇒ 食指压不住、覆盖被切断；更高品视为食指垫底 ⇒ 仍成立。
   * 四个取值共用同一输入形状（2 品六弦跨度、中间弦取不同品位），故收成一张表。
   * 顺带用同一输入喂 computeBarreCandidates，锁定「切断 ⇒ 连续段拆开成多组候选」的对应表现。
   */
  it.each([
    {
      label: '中间弦静音：切断覆盖，横按失效且候选拆成两组',
      frets: [2, 2, -1, 2, 2, 2],
      expected: false,
      candidates: [
        { fret: 2, fromString: 0, toString: 1, finger: 1 },
        { fret: 2, fromString: 3, toString: 5, finger: 1 },
      ],
    },
    {
      label: '中间弦空弦：切断覆盖，横按失效且候选拆成两组',
      frets: [2, 2, 0, 2, 2, 2],
      expected: false,
      candidates: [
        { fret: 2, fromString: 0, toString: 1, finger: 1 },
        { fret: 2, fromString: 3, toString: 5, finger: 1 },
      ],
    },
    {
      label: '中间弦更低品位：切断覆盖，横按失效且候选收缩到右侧段',
      frets: [2, 1, 2, 2, 2, 2],
      expected: false,
      candidates: [{ fret: 2, fromString: 2, toString: 5, finger: 1 }],
    },
    {
      label: '中间弦更高品位（食指垫底）：覆盖成立，横按有效且产出全跨度 + 小横按',
      frets: [2, 4, 4, 2, 2, 2],
      expected: true,
      candidates: [
        { fret: 2, fromString: 0, toString: 5, finger: 1 },
        { fret: 4, fromString: 1, toString: 2, finger: 1 },
      ],
    },
  ])('$label', ({ frets, expected, candidates }) => {
    const model = strings(...frets);
    expect(isBarreStillValid(model, barre(2, 0, 5))).toBe(expected);
    expect(computeBarreCandidates(model, 5)).toEqual(candidates);
  });

  it('跨度不足两根弦或品位为 0 时无效', () => {
    expect(isBarreStillValid(strings(1, 3, 3, 2, 1, 1), barre(1, 2, 2))).toBe(false);
    expect(isBarreStillValid(strings(0, 0, -1, -1, -1, -1), barre(0, 0, 1))).toBe(false);
  });
});

describe('reconcileBarres', () => {
  it('弦品位未变化时返回原引用', () => {
    const oldFrets = [1, 3, 3, 2, 1, 1];
    const oldBarres: BarreEntity[] = [barre(1, 0, 5)];
    expect(reconcileBarres(oldFrets, oldFrets, oldBarres)).toBe(oldBarres);
  });

  // 以下三条各守一侧、互不可替代：reconcileBarres 收缩边界的两条 while 各管一端（左端点 / 右端点），
  // 而「锚点全失 ⇒ 横按废弃」是 while 全部走完后的收尾分支，故都不并入上面的参数表。
  it('外侧锚点被移除时边界向内收缩到最近的锚点弦', () => {
    const result = reconcileBarres([-1, 3, 3, 2, 1, 1], [1, 3, 3, 2, 1, 1], [barre(1, 0, 5)]);
    expect(result).toEqual([{ fret: 1, fromString: 4, toString: 5 }]);
  });

  it('所有锚点被移除时横按废弃', () => {
    const result = reconcileBarres([3, 3, 3, 2, 2, 2], [1, 3, 3, 2, 1, 1], [barre(1, 0, 5)]);
    expect(result).toBeUndefined();
  });

  it('覆盖范围内出现静音弦时横按废弃（与 isBarreStillValid 语义一致）', () => {
    const result = reconcileBarres([2, -1, 4, 2, 2, 2], [2, 4, 4, 2, 2, 2], [barre(2, 0, 5)]);
    expect(result).toBeUndefined();
  });

  it('端点换品位时收缩到剩余锚点范围', () => {
    const result = reconcileBarres([2, 4, 4, 2, 2, 3], [2, 4, 4, 2, 2, 2], [barre(2, 0, 5)]);
    expect(result).toEqual([{ fret: 2, fromString: 0, toString: 4 }]);
  });
});

describe('横按包含吸收与打断拆分（用户 222x22 场景）', () => {
  beforeEach(async () => {
    // 草稿走持久化存储（useChordEditorStore → useStorage → idbKv），会跨用例残留 ——
    // 本场景只显式设了 strings，fretCount / tuning 等仍取自草稿，用例能否成立会取决于同文件
    // 前面那些用例往草稿里写了什么。这里把存储重置成「全新安装」态，让场景完全由本用例自己构造。
    // 注：实测在当前执行顺序下不重置也是绿的 —— 这是提前消除「顺序依赖」这一隐患，
    // 不是在修复一个已观测到的失败。
    await idb.clear('kv');
    await hydrateIdbKv();
    setActivePinia(createPinia());
  });

  it('大横按应完全吸收被其覆盖的较小子横按', () => {
    const s = strings(2, 2, 2, 2, 2, 2);
    const existing: BarreEntity[] = [barre(2, 0, 2), barre(2, 4, 5), barre(2, 0, 5)];
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
    store.setBarres([barre(2, 0, 2), barre(2, 4, 5)]);
    expect(store.draftChord.barres).toHaveLength(2);

    // 3. 把 x 也改成 2（变成 2 2 2 2 2 2）
    store.draftChord.strings[3]!.fret = 2;
    // 此时全横按形成，应吸收原本的两个碎横按
    expect(store.draftChord.barres).toMatchObject([{ fret: 2, fromString: 0, toString: 5 }]);

    // 4. 再把该音符删除（变回 2 2 2 x 2 2）
    store.draftChord.strings[3]!.fret = -1;
    // 预期应仅保留左侧三个音符的横按，右侧两个音符不足 3 颗音符不作为横按保留！
    expect(store.draftChord.barres).toMatchObject([{ fret: 2, fromString: 0, toString: 2 }]);
  });
});
