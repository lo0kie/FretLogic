/**
 * 同名多实例缓存的读数聚合：容量口径不一致时取「最严格的一份」，而不是只显示第一份 ——
 * 只显示第一份会把其余实例的口径藏掉，面板读数按「最快触顶」理解才不会误导。
 */
import { afterEach, describe, expect, it } from 'vitest';

import { listCaches, registerCache } from '@/platform/utils/cache';

describe('同名多实例缓存的聚合', () => {
  const offs: (() => void)[] = [];
  afterEach(() => offs.splice(0).forEach(off => off()));

  it('limit 不一致时取最小值并标注实例份数（allowMultiple 的设计性多实例）', () => {
    offs.push(registerCache({ name: '审查聚合A', limit: 8, size: () => 0 }, { allowMultiple: true }));
    offs.push(registerCache({ name: '审查聚合A', limit: 3, size: () => 0 }, { allowMultiple: true }));

    const stat = listCaches().find(cache => cache.name === '审查聚合A');
    expect(stat?.instances).toBe(2);
    expect(stat?.limit).toBe(3);
  });

  it('口径一致时原样展示', () => {
    offs.push(registerCache({ name: '审查聚合B', limit: 5, size: () => 0 }, { allowMultiple: true }));
    offs.push(registerCache({ name: '审查聚合B', limit: 5, size: () => 0 }, { allowMultiple: true }));

    const stat = listCaches().find(cache => cache.name === '审查聚合B');
    // 口径一致时 limit 原样取那一份，但**实例份数仍要如实计数** —— 只报 limit 不报份数，
    // 面板上就看不出这个名字背后挂了几个实例（聚合口径的另一半）
    expect(stat?.instances).toBe(2);
    expect(stat?.limit).toBe(5);
  });
});
