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

describe('kv 落盘窗口（flushNow 事务执行期间）', () => {
  it('事务执行期间的同键再写入必须保留脏标记，由下一轮落盘', async () => {
    kvSet('race', 'first');

    // 受控地复现「事务回调已执行、事务尚未 complete」这一瞬间：事务外壳换成假 store（不真写），
    // 在回调返回之后插入一次同键写入，再让事务「完成」。不这么构造就得靠微任务计数去卡 IDB
    // 事件的时序，那种测试今天绿明天飘；而这里测的正是 flushNow 的摘除契约本身 ——
    // 旧实现在 complete 后无条件摘除脏标记，会把这次新写入一并抹掉，'second' 从此永不落盘
    // （下一轮 flush 见脏集合为空直接 return，pagehide 的强制 flush 同样空转）。
    const runTxSpy = vi.spyOn(idb, 'runTx').mockImplementation(async (_storeNames, fn) => {
      fn(() => ({ put: () => {}, delete: () => {} }));
      kvSet('race', 'second');
    });

    try {
      await flushIdbKv();
    } finally {
      runTxSpy.mockRestore();
    }

    await flushIdbKv(); // 第二轮：旧实现下脏集合已被摘空，这一步空转，IDB 里根本不会有 race
    expect((await idb.get('kv', 'race'))?.value).toBe('second');
  });
});
