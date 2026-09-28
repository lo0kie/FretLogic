// @vitest-environment jsdom
/**
 * songStore.hydrate 的「读失败」门禁 —— 「读失败」与「库本来就是空的」必须可区分。
 *
 * 设计口径写在两处（`2026-09-25-1605-regression-and-audit-fixes.md` 的变更日志、
 * `syncActions.ts` 的就绪门禁注释）：读失败时 store 应**保持未水合**，因为启动期云端比对与同步动作
 * 的就绪门禁都以 `isHydrated()` 为准 —— 把「读失败」当成「本地无乐谱」，给出的正是那个
 * 「云端较新、可一键覆盖本地」的方向判断。
 *
 * 而 `loadInitialSongs` 原先吞掉异常返回 `[]`，于是调用方无从区分，门禁照样置位 ——
 * 这条口径从未真正生效。本用例钉住它。
 */
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSongStore } from '@/domains/score/library/store/songStore';
import { songRepository } from '@/domains/score/model/songRepository';
import { idb } from '@/platform/services/storage';
import { hydrateIdbKv } from '@/platform/services/storage/idbKv';

describe('songStore 水合门禁', () => {
  beforeEach(async () => {
    await idb.clear('songs');
    await idb.clear('syncMeta');
    await idb.clear('kv');
    await hydrateIdbKv();
    setActivePinia(createPinia());
  });

  afterEach(() => vi.restoreAllMocks());

  it('读失败保持未水合，且恢复后能真正重试', async () => {
    const songStore = useSongStore();
    vi.spyOn(songRepository, 'loadSongs').mockRejectedValueOnce(new Error('IDB 读失败'));

    await songStore.hydrate();

    // 未水合：此时内存是空初值，但库状态未知，任何基于「本地为空」的判断都不成立
    expect(songStore.isHydrated()).toBe(false);

    // 门禁仍为假 ⇒ hydrate 的重入判定不会提前返回，能真正再读一次（与 chordStore 的同位口径一致）
    await songStore.hydrate();
    expect(songStore.isHydrated()).toBe(true);
  });

  it('库确实是空的时照常算水合完成（不把空库误判成读失败）', async () => {
    const songStore = useSongStore();

    await songStore.hydrate();

    expect(songStore.isHydrated()).toBe(true);
    expect(songStore.songs).toEqual([]);
  });
});
