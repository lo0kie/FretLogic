import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bootstrapDataLayer } from '@/app/services/data/bootstrap';
import { idb } from '@/platform/services/storage';
import { hydrateIdbKv } from '@/platform/services/storage/idbKv';
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
