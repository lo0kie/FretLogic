import { ref, watch } from 'vue';

import { useStorage } from '@/platform/composables/useStorage';
import { STORAGE_KEYS } from '@/platform/utils/constants';

import type { Ref } from 'vue';

export type WorkbenchPanelId = 'analysis' | 'variants' | 'export';

export const DEFAULT_WORKBENCH_PANEL_ORDER: readonly WorkbenchPanelId[] = ['variants', 'analysis', 'export'] as const;

/**
 * 校验并清洗工作台面板顺序：保证所有默认面板存在、无未知项且不重复
 */
export function sanitizePanelOrder(raw: unknown): WorkbenchPanelId[] {
  if (!Array.isArray(raw)) return [...DEFAULT_WORKBENCH_PANEL_ORDER];
  const valid = raw.filter((id): id is WorkbenchPanelId =>
    DEFAULT_WORKBENCH_PANEL_ORDER.includes(id as WorkbenchPanelId)
  );
  const unique = Array.from(new Set(valid));
  for (const defaultId of DEFAULT_WORKBENCH_PANEL_ORDER) {
    if (!unique.includes(defaultId)) {
      unique.push(defaultId);
    }
  }
  return unique;
}

export interface UseWorkbenchPanelsOrderReturn {
  panels: Ref<WorkbenchPanelId[]>;
  storedOrder: Ref<WorkbenchPanelId[]>;
  setOrder: (newOrder: WorkbenchPanelId[]) => void;
}

/**
 * 工作台面板顺序管理的组合式函数：
 * 维护面板展示顺序、自动与持久化存储（kv 镜像）保持双向同步，对外仅暴露 setOrder 一个重排入口。
 */
export function useWorkbenchPanelsOrder(): UseWorkbenchPanelsOrderReturn {
  const storedOrder = useStorage<WorkbenchPanelId[]>(STORAGE_KEYS.WORKBENCH_PANEL_ORDER, [
    ...DEFAULT_WORKBENCH_PANEL_ORDER,
  ]);

  const panels = ref<WorkbenchPanelId[]>(sanitizePanelOrder(storedOrder.value));

  watch(
    storedOrder,
    newVal => {
      const sanitized = sanitizePanelOrder(newVal);
      if (JSON.stringify(sanitized) !== JSON.stringify(panels.value)) {
        panels.value = sanitized;
      }
    },
    { deep: true }
  );

  const syncToStorage = (newOrder: WorkbenchPanelId[]) => {
    const sanitized = sanitizePanelOrder(newOrder);
    panels.value = sanitized;
    storedOrder.value = [...sanitized];
  };

  const setOrder = (newOrder: WorkbenchPanelId[]) => {
    syncToStorage(newOrder);
  };

  return {
    panels,
    storedOrder,
    setOrder,
  };
}
