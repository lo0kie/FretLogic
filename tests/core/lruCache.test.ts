import { describe, expect, it, vi } from 'vitest';

import { createLruCache } from '@/utils/core/lruCache';

describe('createLruCache', () => {
  it('应当支持基础的读写、存在性与大小查询', () => {
    const cache = createLruCache<number>(3);
    expect(cache.size).toBe(0);
    expect(cache.has('a')).toBe(false);
    expect(cache.get('a')).toBeUndefined();

    cache.set('a', 1);
    expect(cache.size).toBe(1);
    expect(cache.has('a')).toBe(true);
    expect(cache.get('a')).toBe(1);
  });

  it('超过容量上限时应当按最久未访问顺序淘汰最旧项', () => {
    const evicted: [string, number][] = [];
    const cache = createLruCache<number>(3, {
      onEvict: (k, v) => evicted.push([k, v]),
    });

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.size).toBe(3);

    // 访问 a，使其成为最新使用，顺序变为 b, c, a
    cache.set('a', 1);

    // 写入 d，应当淘汰 b
    cache.set('d', 4);
    expect(cache.size).toBe(3);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('c')).toBe(true);
    expect(cache.has('d')).toBe(true);
    expect(evicted).toEqual([['b', 2]]);
  });

  it('覆盖已有 key 且值发生变更时应当对旧值触发 onEvict', () => {
    const onEvict = vi.fn();
    const cache = createLruCache<string>(3, { onEvict });

    cache.set('key1', 'val1');
    expect(onEvict).not.toHaveBeenCalled();

    // 覆盖为新值
    cache.set('key1', 'val2');
    expect(onEvict).toHaveBeenCalledTimes(1);
    expect(onEvict).toHaveBeenCalledWith('key1', 'val1');

    // 写入完全相同的值，不重复触发
    cache.set('key1', 'val2');
    expect(onEvict).toHaveBeenCalledTimes(1);
  });

  it('调用 clear 时应当对缓存中所有残留项触发 onEvict 并清空', () => {
    const evicted: [string, number][] = [];
    const cache = createLruCache<number>(5, {
      onEvict: (k, v) => evicted.push([k, v]),
    });

    cache.set('x', 10);
    cache.set('y', 20);
    cache.set('z', 30);
    expect(cache.size).toBe(3);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.has('x')).toBe(false);
    expect(evicted).toEqual([
      ['x', 10],
      ['y', 20],
      ['z', 30],
    ]);
  });

  it('不传入 options 时应当保持完全正常的 LRU 淘汰行为', () => {
    const cache = createLruCache<string>(2);
    cache.set('a', 'apple');
    cache.set('b', 'banana');
    cache.set('c', 'cherry');

    expect(cache.size).toBe(2);
    expect(cache.has('a')).toBe(false);
    expect(cache.get('b')).toBe('banana');
    expect(cache.get('c')).toBe('cherry');

    cache.clear();
    expect(cache.size).toBe(0);
  });
});
