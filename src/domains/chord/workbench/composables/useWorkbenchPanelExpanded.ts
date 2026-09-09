import { useStorage } from '@vueuse/core';

import type { StorageLike } from '@vueuse/core';
import type { Ref } from 'vue';

/**
 * 工作台侧栏面板「展开/收起」持久化组合式函数。
 *
 * 每个面板实例独立调用（各自传入自己的 storageKey，互不共享）：
 * 展开态持久化到 LocalStorage，沿用历史 *_COLLAPSED 键位，布尔语义，兼容旧三态字符串值。
 *
 * 旧值归一化约定：
 *  - 旧三态字符串 'auto' / 'expanded' → 展开（早期这些面板三态中的 auto 即跟随内容、expanded 即常开）
 *  - 旧三态字符串 'collapsed' → 收起
 *  - 旧布尔 true（历史语义 = 收起）→ 收起；false → 展开
 *  - 无值 → 展开（默认）
 */
export function useWorkbenchPanelExpanded(storageKey: string, storage: StorageLike = localStorage): Ref<boolean> {
  /** 自定义序列化：read 时对旧值归一化为 boolean；write 时直接存原始布尔值字符串。
   *  这样 useStorage 的 ref 值恒为 boolean，读写路径最简，杜绝二次包装造成的写入丢失。 */
  const expanded = useStorage<boolean>(storageKey, true, storage, {
    writeDefaults: true,
    serializer: {
      read: (raw: string): boolean => {
        // 历史布尔字符串
        if (raw === 'false') return false;
        if (raw === 'true') return true;
        // 历史三态字符串
        return !raw.startsWith('collapsed');
      },
      write: (v: boolean): string => (v ? 'true' : 'false'),
    },
  });

  return expanded;
}
