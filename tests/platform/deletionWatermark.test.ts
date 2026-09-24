import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDataDeletedAt, markDataDeleted } from '@/platform/services/storage/deletionWatermark';
import { STORAGE_KEYS } from '@/platform/utils/constants';

/** 用内存 Map 顶掉 IDB kv 通道：本模块只关心「写回字符串、读回字符串」这一步 */
const { kvStore } = vi.hoisted(() => ({ kvStore: new Map<string, string>() }));

vi.mock('@/platform/services/storage/idbKv', () => ({
  kvGet: (key: string) => kvStore.get(key),
  kvSet: (key: string, value: string) => void kvStore.set(key, value),
}));

const KEY = STORAGE_KEYS.DATA_DELETED_AT;

beforeEach(() => kvStore.clear());

describe('数据删除水位线', () => {
  it('从未删除过任何实体时读作 0', () => {
    expect(getDataDeletedAt()).toBe(0);
  });

  it('脏值一律读作 0：空串 / 非数字 / 负数 / 非有限值', () => {
    for (const dirty of ['', 'abc', '-1', 'Infinity', 'NaN']) {
      kvStore.set(KEY, dirty);
      expect(getDataDeletedAt(), dirty).toBe(0);
    }
  });

  it('记录后可读回该时间戳，且落在约定的存储键上', () => {
    markDataDeleted(1_700_000_000_000);
    expect(getDataDeletedAt()).toBe(1_700_000_000_000);
    expect(kvStore.get(KEY)).toBe('1700000000000');
  });

  it('只前进不后退：更早的时间戳不覆盖已记录的', () => {
    markDataDeleted(2_000);
    markDataDeleted(1_000);
    expect(getDataDeletedAt()).toBe(2_000);
  });

  it('缺省参数取当前时间', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T00:00:00Z'));
    try {
      markDataDeleted();
      expect(getDataDeletedAt()).toBe(Date.now());
    } finally {
      vi.useRealTimers();
    }
  });
});
