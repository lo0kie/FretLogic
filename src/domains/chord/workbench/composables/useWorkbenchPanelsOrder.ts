import { ref, watch } from 'vue';

import { useStorage } from '@vueuse/core';

import { STORAGE_KEYS } from '@/platform/utils/constants';

import type { Ref } from 'vue';

export type WorkbenchPanelId = 'analysis' | 'variants' | 'export' | 'settings';

export const DEFAULT_WORKBENCH_PANEL_ORDER: readonly WorkbenchPanelId[] = [
  'variants',
  'analysis',
  'export',
  'settings',
] as const;

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
  resetOrder: () => void;
  movePanel: (fromIndex: number, toIndex: number) => void;
  movePanelById: (id: WorkbenchPanelId, targetIndex: number) => void;
}

/**
 * 工作台面板顺序管理的组合式函数（底层能力）：
 * 维护面板展示顺序、自动与 LocalStorage 保持双向同步、提供重排/重置/位移等自定义能力。
 */
export function useWorkbenchPanelsOrder(): UseWorkbenchPanelsOrderReturn {
  const storedOrder = useStorage<WorkbenchPanelId[]>(
    STORAGE_KEYS.WORKBENCH_PANEL_ORDER,
    [...DEFAULT_WORKBENCH_PANEL_ORDER],
    localStorage
  );

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

  const resetOrder = () => {
    syncToStorage([...DEFAULT_WORKBENCH_PANEL_ORDER]);
  };

  const movePanel = (fromIndex: number, toIndex: number) => {
    if (
      fromIndex < 0 ||
      fromIndex >= panels.value.length ||
      toIndex < 0 ||
      toIndex >= panels.value.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const next = [...panels.value];
    const [item] = next.splice(fromIndex, 1);
    if (item) {
      next.splice(toIndex, 0, item);
      syncToStorage(next);
    }
  };

  const movePanelById = (id: WorkbenchPanelId, targetIndex: number) => {
    const fromIndex = panels.value.indexOf(id);
    if (fromIndex !== -1) {
      movePanel(fromIndex, targetIndex);
    }
  };

  return {
    panels,
    storedOrder,
    setOrder,
    resetOrder,
    movePanel,
    movePanelById,
  };
}
