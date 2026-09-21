/**
 * TopHeader 的乐谱「预览」导出**状态壳**：
 * - 响应式状态（预览导出模式、下载菜单标题）留在本模块 —— 只读 route/store/预览缓存，零重依赖；
 * - 四个导出动作（长图/PDF/Zip/打印）的完整实现移入 scoreExportActions.ts，经动态 import
 *   懒加载。这样 workerExportService / useScoreRenderPayload / pdf / print 渲染链路不再进
 *   首屏闭包，只在用户首次点击导出（或复制长图）时拉取。
 *
 * 对外 API 与拆分前完全一致（动作函数语义不变，仅实现体改为异步模块加载）。
 */
import { computed } from 'vue';

import { useRoute } from 'vue-router';

import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { currentRenderData, isPreviewRendering } from '@/domains/score/preview/scorePreviewCache';
import { formatBytes } from '@/platform/utils/common';
import { ROUTE_PATHS } from '@/platform/utils/constants';

import type { MenuItem } from '@/platform/ui/menu/types';

/** 预览导出模式：乐谱页且处于预览 tab（下载菜单与尺寸预估仅在此 tab 提供） */
const isPreviewExportModeOf = () => {
  const route = useRoute();
  const scoreEditor = useScoreEditorStore();
  return computed(() => route.path === ROUTE_PATHS.SCORE && scoreEditor.activeTab === 'preview');
};

/** 懒加载导出动作实现（见 scoreExportActions.ts 文件头注释） */
const loadActions = () => import('./scoreExportActions');

/**
 * 预取导出动作实现模块（只拉取不执行）：
 * 供宿主 UI 挂载 / 空闲时机调用，把 chunk 下载提前到用户点击之前，消除首次点击的反馈死区。
 */
export const preloadExportActions = (): Promise<unknown> => loadActions();

export const useScoreExport = () => {
  const isPreviewExportMode = isPreviewExportModeOf();

  /** 预览 tab 的长图导出/复制（TopHeader 的「复制整曲长图」按钮直接调用） */
  const handleScoreExport = (op: 'copy' | 'download') => loadActions().then(m => m.handleScoreExport(op));

  /** 下载下拉标题：直接读预览共享缓存中 A4 分页各页字节数累加（渲染时即算好，UI 仅展示） */
  const downloadMenuTitle = computed(() => {
    if (!isPreviewExportMode.value) return '';
    const data = currentRenderData.value;
    if (!data || data.a4Urls.length === 0) return isPreviewRendering.value ? '预估文件尺寸计算中…' : '预估文件尺寸';

    const total = data.a4Sizes.reduce((sum, n) => sum + n, 0);
    return `预估文件 ${formatBytes(total)}`;
  });

  /** 下载菜单：长图 / 分页 PDF / 分页 Zip 三个下载入口，末项为打印（直接调系统打印对话框，不产出文件） */
  const downloadExportMenuItems: MenuItem[] = [
    {
      label: '下载为长图',
      icon: 'image-down',
      action: () => void loadActions().then(m => m.handleScoreExport('download')),
    },
    {
      label: '下载为 PDF',
      icon: 'file-text',
      action: () => void loadActions().then(m => m.handleScoreExportPdf()),
    },
    {
      label: '下载为 ZIP',
      icon: 'file-archive',
      action: () => void loadActions().then(m => m.handleScoreExportZip()),
    },
    {
      label: '打印',
      icon: 'printer',
      // 打印不是下载，与上方三项用分割线隔开，避免被读成「下载为打印」
      divided: true,
      action: () => void loadActions().then(m => m.handleScorePrint()),
    },
  ];

  return {
    isPreviewExportMode,
    handleScoreExport,
    downloadExportMenuItems,
    downloadMenuTitle,
  };
};
