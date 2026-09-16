/**
 * TopHeader 的乐谱「预览」导出动作集合：
 * - 长图复制 / 下载（normal 模式）
 * - A4 分页 Zip 下载
 * - A4 分页 PDF 下载
 * - 下载菜单标题的文件尺寸预估（复用 Worker 真实渲染）
 *
 * 从 TopHeader.vue 抽离：三段导出共享 payload 构造与 toast/错误样板，统一走
 * runBusyAction 通用管线，组件内只保留菜单项与响应式绑定。
 */
import { computed } from 'vue';

import { storeToRefs } from 'pinia';
import { useRoute } from 'vue-router';

import { getScorePageSize } from '@/domains/score/constants';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { currentRenderData, fetchA4PageBlob, isPreviewRendering } from '@/domains/score/preview/scorePreviewCache';
import { runWorkerExport } from '@/domains/score/preview/services/workerExportService';
import { useScoreRenderPayload } from '@/domains/score/preview/useScoreRenderPayload';
import { runBusyAction } from '@/platform/composables/runBusyAction';
import { writeBlobToClipboard } from '@/platform/services/clipboard/clipboard';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { useUiStore } from '@/platform/store/uiStore';
import { buildExportFileName, triggerBlobDownload } from '@/platform/utils/canvas';
import { formatBytes } from '@/platform/utils/common';
import { ROUTE_PATHS } from '@/platform/utils/constants';
import { buildImagePdf } from '@/platform/utils/pdf';

import type { MenuItem } from '@/platform/ui/menu/types';
import type { PdfImagePage } from '@/platform/utils/pdf';

/** 预览导出模式：乐谱页且处于预览 tab（下载菜单与尺寸预估仅在此 tab 提供） */
const isPreviewExportModeOf = () => {
  const route = useRoute();
  const scoreEditor = useScoreEditorStore();
  return computed(() => route.path === ROUTE_PATHS.SCORE && scoreEditor.activeTab === 'preview');
};

export const useScoreExportActions = () => {
  const scoreEditor = useScoreEditorStore();
  const settingsStore = useSettingsStore();
  const uiStore = useUiStore();
  const { isCopying } = storeToRefs(uiStore);
  const isPreviewExportMode = isPreviewExportModeOf();
  // Worker 渲染载荷统一构建（全曲行索引 + 设置项读取），与预览面板共享同一来源
  const { getAllLineIndices, buildRenderPayload } = useScoreRenderPayload();

  /**
   * 预览 tab 的导出：整曲经 Worker 离屏渲染为一张长图（normal 模式），
   * 再按操作写入剪贴板或触发浏览器下载。
   */
  const handleScoreExport = (op: 'copy' | 'download') => {
    const song = scoreEditor.activeSong;
    if (!song || getAllLineIndices().length === 0) return Promise.resolve(null);

    return runBusyAction({
      busy: isCopying,
      loadingText: '正在渲染整曲长图...',
      logPrefix: 'Score export error:',
      errorFallback: '导出失败',
      run: async () => {
        const blob = await getLongImageBlob();
        if (op === 'copy') {
          await writeBlobToClipboard(blob);
          return '成功复制至系统剪贴板';
        }
        triggerBlobDownload(blob, `${buildExportFileName(song.title || '')}.jpg`);
        return '已开始下载';
      },
      successText: message => message,
    });
  };

  /** 预览 tab 的分页导出为 Zip：经 Worker 离屏渲染为 A4 分页图片，再打包为一个 zip 文件下载 */
  const handleScoreExportZip = () => {
    const song = scoreEditor.activeSong;
    if (!song || getAllLineIndices().length === 0) return Promise.resolve(null);

    return runBusyAction({
      busy: isCopying,
      loadingText: '正在渲染分页图片并打包...',
      logPrefix: 'Score export zip error:',
      errorFallback: '导出失败',
      run: async () => {
        const blobs = await getA4Blobs();
        if (blobs.length === 0) throw new Error('未能生成有效的导出图片');

        // 每页为已压缩的 JPEG，Zip 内采用 store(level 0) 直接归档，避免重复压缩耗时
        const files: Record<string, Uint8Array> = {};
        const base = buildExportFileName(song.title || '');
        for (let i = 0; i < blobs.length; i++) {
          const buf = await blobs[i]!.arrayBuffer();
          files[`${base}_第${i + 1}页.jpg`] = new Uint8Array(buf);
        }
        // 动态导入 fflate：不进首屏 chunk，仅点击「下载为分页 Zip」时拉取
        const { zipSync } = await import('fflate');
        const zipData = zipSync(files, { level: 0 });
        triggerBlobDownload(new Blob([zipData], { type: 'application/zip' }), `${base}.zip`);
        return '已开始下载';
      },
      successText: message => message,
    });
  };

  /** 预览 tab 的分页导出为 PDF：经 Worker 渲染 A4 分页图片后，把每页 JPEG 原样嵌入 PDF 后下载 */
  const handleScoreExportPdf = () => {
    const song = scoreEditor.activeSong;
    if (!song || getAllLineIndices().length === 0) return Promise.resolve(null);

    return runBusyAction({
      busy: isCopying,
      loadingText: '正在渲染分页图片并生成 PDF...',
      logPrefix: 'Score export pdf error:',
      errorFallback: '导出失败',
      run: async () => {
        const blobs = await getA4Blobs();
        if (blobs.length === 0) throw new Error('未能生成有效的导出图片');

        // 页面物理尺寸：worker 以 96dpi 点阵渲染，PDF 采用 pt(72dpi)，进行 0.75 = 72/96 换算；
        // 像素尺寸用于图片 XObject 的 /Width /Height，物理尺寸用于 MediaBox 与铺满变换
        const { width, height } = getScorePageSize(settingsStore.scorePageSize);
        const wPt = Math.round((width * 72) / 96);
        const hPt = Math.round((height * 72) / 96);

        // 手写极简 PDF 图像容器：各页 JPEG 以 /DCTDecode 原样嵌入，零二次编码、零依赖
        const pages: PdfImagePage[] = [];
        for (const blob of blobs) {
          pages.push({
            jpeg: new Uint8Array(await blob.arrayBuffer()),
            pixelWidth: width,
            pixelHeight: height,
            widthPt: wPt,
            heightPt: hPt,
          });
        }
        const pdfData = buildImagePdf(pages);
        const base = buildExportFileName(song.title || '');
        // pdfData 为 Uint8Array<ArrayBufferLike>，切片得到精确长度的 ArrayBuffer 以匹配 BlobPart
        triggerBlobDownload(new Blob([pdfData.slice()], { type: 'application/pdf' }), `${base}.pdf`);
        return '已开始下载';
      },
      successText: message => message,
    });
  };

  /**
   * 直接从预览共享缓存取已渲染的 Blob，避免重复触发 Worker 渲染：
   * 预览面板在渲染/切歌时已把 A4 分页产物写入 scorePreviewCache，
   * 下载菜单的预估尺寸与三种导出均复用该结果，仅缓存缺失时回退重新渲染。
   */
  /** 取 A4 分页 Blob（PDF / ZIP 导出复用预览已渲染结果） */
  const getA4Blobs = async (): Promise<Blob[]> => {
    const data = currentRenderData.value;
    if (data && data.a4Urls.length > 0) {
      const blobs = await Promise.all(data.a4Urls.map(fetchA4PageBlob));
      return blobs.filter((blob): blob is Blob => blob !== null);
    }
    const { blobs } = await runWorkerExport(buildRenderPayload('a4'));
    if (blobs.length === 0) throw new Error('未能生成有效的导出图片');
    return blobs;
  };

  /** 取长图 Blob（「下载为长图」按需渲染，预览不预渲染长图，故每次都走 Worker） */
  const getLongImageBlob = async (): Promise<Blob> => {
    const { blobs } = await runWorkerExport(buildRenderPayload('normal'));
    if (blobs.length === 0) throw new Error('未能生成有效的导出图片');
    return blobs[0]!;
  };

  /** 下载下拉标题：直接读预览共享缓存中 A4 分页各页字节数累加（渲染时即算好，UI 仅展示） */
  const downloadMenuTitle = computed(() => {
    if (!isPreviewExportMode.value) return '';
    const data = currentRenderData.value;
    if (!data || data.a4Urls.length === 0) {
      return isPreviewRendering.value ? '预估文件尺寸计算中…' : '预估文件尺寸';
    }
    const total = data.a4Sizes.reduce((sum, n) => sum + n, 0);
    return `预估文件 ${formatBytes(total)}`;
  });

  /** 下载菜单：长图 / 分页 PDF / 分页 Zip 三个导出入口 */
  const downloadExportMenuItems: MenuItem[] = [
    {
      label: '下载为长图',
      icon: 'image-down',
      action: () => void handleScoreExport('download'),
    },
    {
      label: '下载为 PDF',
      icon: 'file-text',
      action: () => void handleScoreExportPdf(),
    },
    {
      label: '下载为 ZIP',
      icon: 'file-archive',
      action: () => void handleScoreExportZip(),
    },
  ];

  return {
    isPreviewExportMode,
    handleScoreExport,
    downloadExportMenuItems,
    downloadMenuTitle,
  };
};
