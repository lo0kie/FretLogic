import { useStorage } from '@/platform/composables/useStorage';

import type { StorageLike } from '@vueuse/core';
import type { Ref } from 'vue';

/**
 * 工作台侧栏面板「展开/收起」持久化组合式函数。
 *
 * 每个面板实例独立调用（各自传入自己的 storageKey，互不共享）：
 * 展开态持久化到 kv 镜像（IDB 落盘），沿用历史 *_COLLAPSED 键位，读取时兼容两类旧值。
 *
 * 写入用显式字面量 'expanded' / 'collapsed'，**不再写 'true' / 'false'**：
 * 历史键里的布尔 'true' 语义是「已收起」，与本 ref（名为 expanded）的极性正好相反；
 * 若继续写布尔，旧值与新值在同一条键上无法区分，归一化会把用户一次收起读成一次展开。
 * 改用字面量后布尔分支只可能来自旧数据，归一化因此是单向且幂等的。
 *
 * 旧值归一化约定：
 *  - 'auto' / 'expanded' → 展开（早期三态中的 auto 即跟随内容、expanded 即常开）
 *  - 'collapsed' → 收起
 *  - 布尔 'true'（历史语义 = 收起）→ 收起；布尔 'false' → 展开
 *  - 无值 → 展开（默认）
 */
export function useWorkbenchPanelExpanded(storageKey: string, storage?: StorageLike): Ref<boolean> {
  /** 自定义序列化：read 时对旧值归一化为 boolean；write 时落显式三态字面量。
   *  这样 useStorage 的 ref 值恒为 boolean，读写路径最简，杜绝二次包装造成的写入丢失。 */
  const expanded = useStorage<boolean>(storageKey, true, storage, {
    writeDefaults: true,
    serializer: {
      read: (raw: string): boolean => {
        // 历史布尔字符串：键名是 *_COLLAPSED，故 true 记的是「已收起」
        if (raw === 'true') return false;
        if (raw === 'false') return true;
        // 新写入的字面量与更早的三态字符串
        return !raw.startsWith('collapsed');
      },
      write: (v: boolean): string => (v ? 'expanded' : 'collapsed'),
    },
  });

  return expanded;
}
