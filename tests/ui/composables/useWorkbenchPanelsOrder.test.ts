import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_WORKBENCH_PANEL_ORDER,
  sanitizePanelOrder,
  useWorkbenchPanelsOrder,
} from '@/features/workbench/composables/useWorkbenchPanelsOrder';

describe('useWorkbenchPanelsOrder: sanitizePanelOrder', () => {
  it('非法或空入参时兜底返回默认面板顺序', () => {
    expect(sanitizePanelOrder(null)).toEqual([...DEFAULT_WORKBENCH_PANEL_ORDER]);
    expect(sanitizePanelOrder(undefined)).toEqual([...DEFAULT_WORKBENCH_PANEL_ORDER]);
    expect(sanitizePanelOrder('not-an-array')).toEqual([...DEFAULT_WORKBENCH_PANEL_ORDER]);
    expect(sanitizePanelOrder(123)).toEqual([...DEFAULT_WORKBENCH_PANEL_ORDER]);
    expect(sanitizePanelOrder({})).toEqual([...DEFAULT_WORKBENCH_PANEL_ORDER]);
  });

  it('保留合法自定义顺序', () => {
    const custom = ['settings', 'analysis', 'export'] as const;
    expect(sanitizePanelOrder(custom)).toEqual(['settings', 'analysis', 'export']);

    const custom2 = ['export', 'settings', 'analysis'] as const;
    expect(sanitizePanelOrder(custom2)).toEqual(['export', 'settings', 'analysis']);
  });

  it('自动过滤未知或非法 panelId 并补齐缺失的面板', () => {
    const partialWithInvalid = ['analysis', 'unknown-panel', 'analysis'];
    const result = sanitizePanelOrder(partialWithInvalid);

    expect(result).toContain('analysis');
    expect(result).toContain('export');
    expect(result).toContain('settings');
    expect(result).not.toContain('unknown-panel');
    expect(result).toHaveLength(3);
    expect(result).toEqual(['analysis', 'export', 'settings']);
  });

  it('自动对重复项去重', () => {
    const duplicated = ['settings', 'settings', 'analysis', 'settings'];
    const result = sanitizePanelOrder(duplicated);

    expect(result).toHaveLength(3);
    expect(result).toEqual(['settings', 'analysis', 'export']);
  });
});

describe('useWorkbenchPanelsOrder: 底层自定义顺序与状态管理', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('初始化时加载默认顺序', () => {
    const { panels, storedOrder } = useWorkbenchPanelsOrder();
    expect(panels.value).toEqual(['analysis', 'export', 'settings']);
    expect(storedOrder.value).toEqual(['analysis', 'export', 'settings']);
  });

  it('支持 setOrder 设置并持久化新顺序', () => {
    const { panels, storedOrder, setOrder } = useWorkbenchPanelsOrder();
    setOrder(['settings', 'export', 'analysis']);

    expect(panels.value).toEqual(['settings', 'export', 'analysis']);
    expect(storedOrder.value).toEqual(['settings', 'export', 'analysis']);
  });

  it('支持 resetOrder 恢复默认顺序', () => {
    const { panels, setOrder, resetOrder } = useWorkbenchPanelsOrder();
    setOrder(['export', 'settings', 'analysis']);
    expect(panels.value).toEqual(['export', 'settings', 'analysis']);

    resetOrder();
    expect(panels.value).toEqual(['analysis', 'export', 'settings']);
  });

  it('支持 movePanel 移动面板位置', () => {
    const { panels, movePanel } = useWorkbenchPanelsOrder();
    // 把第 0 项 (analysis) 移到第 2 项末尾
    movePanel(0, 2);
    expect(panels.value).toEqual(['export', 'settings', 'analysis']);

    // 把第 1 项 (settings) 移到第 0 项
    movePanel(1, 0);
    expect(panels.value).toEqual(['settings', 'export', 'analysis']);
  });

  it('movePanel 越界索引安全无副作用', () => {
    const { panels, movePanel } = useWorkbenchPanelsOrder();
    movePanel(-1, 2);
    expect(panels.value).toEqual(['analysis', 'export', 'settings']);

    movePanel(0, 10);
    expect(panels.value).toEqual(['analysis', 'export', 'settings']);

    movePanel(1, 1);
    expect(panels.value).toEqual(['analysis', 'export', 'settings']);
  });

  it('支持 movePanelById 按面板 ID 调整位置', () => {
    const { panels, movePanelById } = useWorkbenchPanelsOrder();
    movePanelById('settings', 0);
    expect(panels.value).toEqual(['settings', 'analysis', 'export']);

    movePanelById('analysis', 2);
    expect(panels.value).toEqual(['settings', 'export', 'analysis']);
  });
});
