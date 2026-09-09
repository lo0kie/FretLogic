/**
 * useWorkbenchPanelExpanded 持久化协议回归测试：
 * 验证收起/展开状态写入 LocalStorage 后能正确往返读回，且兼容历史三态字符串值。
 * 用内存 StorageLike 代替 node 环境缺失的 localStorage（VueUse 写入为异步 flush，断言前 await nextTick）。
 */
import { nextTick } from 'vue';

import { beforeEach, describe, expect, it } from 'vitest';

import { useWorkbenchPanelExpanded } from '@/domains/chord/workbench/composables/useWorkbenchPanelExpanded';

import type { StorageLike } from '@vueuse/core';

/** 极简内存 Storage，模拟 StorageLike 契约 */
function makeMemStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: k => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: k => {
      map.delete(k);
    },
  } as StorageLike;
}

describe('useWorkbenchPanelExpanded 持久化协议', () => {
  const mem = makeMemStorage();

  beforeEach(() => {
    mem.removeItem('PROBE_EXPANDED_V1');
  });

  it('收起(false)写入后，读回仍为收起', async () => {
    const expanded = useWorkbenchPanelExpanded('PROBE_EXPANDED_V1', mem);
    expect(expanded.value).toBe(true); // 无历史值 → 默认展开
    expanded.value = false; // 用户收起
    await nextTick(); // 等 useStorage watch flush 写入 storage
    expect(expanded.value).toBe(false);
    // 模拟刷新：重新创建 composable，从同一存储读
    const reloaded = useWorkbenchPanelExpanded('PROBE_EXPANDED_V1', mem);
    expect(reloaded.value).toBe(false); // 持久化应保留收起态
  });

  it('展开(true)写入后，读回仍为展开', async () => {
    const expanded = useWorkbenchPanelExpanded('PROBE_EXPANDED_V1', mem);
    expanded.value = true;
    await nextTick();
    const reloaded = useWorkbenchPanelExpanded('PROBE_EXPANDED_V1', mem);
    expect(reloaded.value).toBe(true);
  });

  it('兼容历史三态字符串值', () => {
    mem.setItem('PROBE_EXPANDED_V1', 'collapsed');
    expect(useWorkbenchPanelExpanded('PROBE_EXPANDED_V1', mem).value).toBe(false);
    mem.setItem('PROBE_EXPANDED_V1', 'expanded');
    expect(useWorkbenchPanelExpanded('PROBE_EXPANDED_V1', mem).value).toBe(true);
    mem.setItem('PROBE_EXPANDED_V1', 'auto');
    expect(useWorkbenchPanelExpanded('PROBE_EXPANDED_V1', mem).value).toBe(true);
  });
});
