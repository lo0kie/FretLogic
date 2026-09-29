// @vitest-environment jsdom
/**
 * chordStore 的**写回门禁**：水合成功前 `persistAll()` 必须整体放弃落盘。
 *
 * 为什么值得单独钉：门禁关着时内存里是读失败留下的空初值，写回去等于把「还没读到的库」
 * 覆盖成空库（真丢数据）。而这条路径平时看不出来 —— `chordStoreExitFlush.test.ts` 里
 * 那句「必须真水合：写回门禁关着时 persistAll 本就空转」正说明它是**静默**的，
 * 故这里同时给正对照：水合之后同一个调用必须真的落盘，否则「没被调用」可能只是接线断了。
 */
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { chordRepository } from '@/domains/chord/model/chordRepository';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { idb } from '@/platform/services/storage';
import { hydrateIdbKv } from '@/platform/services/storage/idbKv';

describe('chordStore 写回门禁', () => {
  beforeEach(async () => {
    await idb.clear('groups');
    await idb.clear('chords');
    await idb.clear('syncMeta');
    await idb.clear('kv');
    await hydrateIdbKv();
    setActivePinia(createPinia());
  });

  afterEach(() => vi.restoreAllMocks());

  it('未水合时整体放弃：persistAll 不触发整库写入', async () => {
    const saveSpy = vi.spyOn(chordRepository, 'save');
    const chordStore = useChordStore();
    expect(chordStore.isHydrated()).toBe(false);

    await chordStore.persistAll();

    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('正对照：水合之后同一个调用真的落盘', async () => {
    const saveSpy = vi.spyOn(chordRepository, 'save');
    const chordStore = useChordStore();
    await chordStore.hydrate();

    await chordStore.persistAll();

    expect(chordStore.isHydrated()).toBe(true);
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });
});
