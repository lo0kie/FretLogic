import { computed } from 'vue';

import { useStorage } from '@vueuse/core';

import type { ComputedRef } from 'vue';

/**
 * 工作台面板三态行为：auto（有音符时展开否则收起）/ expanded（始终展开）/ collapsed（始终收起）。
 * 模式持久化到 localStorage（沿用原 *_COLLAPSED 键，旧布尔值首次访问时归一化为三态）。
 */

export type PanelMode = 'auto' | 'expanded' | 'collapsed';

/** 各模式的展示文案（按钮 tooltip / aria-label 用） */
export const PANEL_MODE_LABEL = [
  { label: '自动', value: 'auto' },
  { label: '展开', value: 'expanded' },
  { label: '收起', value: 'collapsed' },
];

/**
 * 面板收起/展开行为状态机。
 * @param storageKey 持久化键（沿用历史 *_COLLAPSED 键位）
 * @param hasContent 惰性求值：当前是否有音符（仅 auto 模式下参与判定）
 */
export function usePanelMode(storageKey: string, hasContent: () => boolean) {
  const mode = useStorage<PanelMode>(storageKey, 'auto');
  // 旧版本该键存布尔（false=展开 / true=收起），首次访问归一化为三态
  if (typeof mode.value === 'boolean') {
    mode.value = mode.value ? 'collapsed' : 'expanded';
  }

  /** 实际生效的展开态：手动模式直接生效，auto 模式跟随内容 */
  const effectiveExpanded = computed(() => {
    if (mode.value === 'expanded') return true;
    if (mode.value === 'collapsed') return false;
    return hasContent();
  }) as ComputedRef<boolean>;

  /** 用户点击标题栏：从当前视觉状态取反并写入手动模式（auto 模式下点击即固定） */
  const toggleCollapse = () => {
    mode.value = effectiveExpanded.value ? 'collapsed' : 'expanded';
  };

  /** 模式循环按钮：auto → expanded → collapsed → auto */
  const cycleMode = () => {
    mode.value = mode.value === 'auto' ? 'expanded' : mode.value === 'expanded' ? 'collapsed' : 'auto';
  };

  return { mode, effectiveExpanded, toggleCollapse, cycleMode };
}
