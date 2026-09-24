import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bootstrapDataLayer } from '@/app/services/data/bootstrap';
import { idb } from '@/platform/services/storage';
import { flushIdbKv, hydrateIdbKv, kvGet, kvRemove, kvSet } from '@/platform/services/storage/idbKv';
import { logger } from '@/platform/utils/logger';

// 转录模块整体打桩：本文件只验证 bootstrap 的容错契约（转录失败不阻塞引导）
vi.mock('@/app/services/data/migrateLegacy', () => ({
  transcribeLegacyLocalStorage: vi.fn(async () => {
    throw new Error('IDB unavailable');
  }),
}));

describe('数据层启动容错', () => {
  beforeEach(async () => {
    await idb.clear('chords');
    await idb.clear('groups');
    await idb.clear('songs');
    await idb.clear('syncMeta');
    await idb.clear('kv');
    await hydrateIdbKv();
  });

  it('转录失败时引导不抛错、正常完成，且错误被记录', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(bootstrapDataLayer()).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('kv 内存镜像的水合窗口', () => {
  it('窗口期（await 期间）的写入必须保留，不得被 memory.clear() 读成一次删除', async () => {
    await idb.put('kv', { key: 'from-idb', value: 'old' });

    const pending = hydrateIdbKv();
    // hydrate 的首个 await 已让出控制权：此刻的写入正落在水合窗口内
    kvSet('window', 'written-during-hydrate');
    await pending;

    expect(kvGet('from-idb')).toBe('old');
    expect(kvGet('window')).toBe('written-during-hydrate');

    // 关键的一半：窗口期的写入必须原样落盘 —— 内存被清空后 flush 会把它当成删除
    await flushIdbKv();
    expect((await idb.get('kv', 'window'))?.value).toBe('written-during-hydrate');
    expect((await idb.get('kv', 'from-idb'))?.value).toBe('old');
  });

  it('窗口期内的删除请求仍然生效（内存现状覆盖回读值）', async () => {
    await idb.put('kv', { key: 'gone', value: 'stale' });

    const pending = hydrateIdbKv();
    kvRemove('gone');
    await pending;

    expect(kvGet('gone')).toBeNull();
    await flushIdbKv();
    expect(await idb.get('kv', 'gone')).toBeUndefined();
  });
});
