/**
 * TopHeader 的乐谱「预览」导出动作集合：
 * - 长图复制 / 下载（normal 模式）
 * - A4 分页 Zip 下载
 * - A4 分页 PDF 下载
 * - 下载菜单标题的文件尺寸预估（复用 Worker 真实渲染）
 *
 * 从 TopHeader.vue 抽离：三段导出共享 payload 构造与 toast/错误样板，收敛为
 * runWorkerExportWithToast 通用管线，组件内只保留菜单项与响应式绑定。
 */
import { computed, ref, watch } from 'vue';

import { useRoute } from 'vue-router';

import { getScorePageSize } from '@/domains/score/constants';
import { useScoreLinesData } from '@/domains/score/editor/composables/useScoreLinesData';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import {
  prepareWorkerExportPayload,
  runWorkerEstimate,
  runWorkerExport,
} from '@/domains/score/preview/services/workerExportService';
import { writeBlobToClipboard } from '@/platform/services/clipboard/clipboard';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { useUiStore } from '@/platform/store/uiStore';
import { buildExportFileName, triggerBlobDownload } from '@/platform/utils/canvas';
import { ROUTE_PATHS } from '@/platform/utils/constants';
import { buildImagePdf } from '@/platform/utils/pdf';

import type { MenuItem } from '@/platform/ui/menu/types';
import type { PdfImagePage } from '@/platform/utils/pdf';

/** Worker 导出载荷类型（prepareWorkerExportPayload 返回值） */
type ExportPayload = ReturnType<typeof prepareWorkerExportPayload>;

/** 字节数 → 人类可读尺寸（中文单位：B / KB / MB / GB） */
const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx++;
  }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unitIdx]}`;
};

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
  const { chordsLookupMap } = useScoreLinesData();
  const isPreviewExportMode = isPreviewExportModeOf();

  /** 整曲全部歌词行索引（预览/导出始终覆盖全曲） */
  const allLyricsLineIndices = (): number[] => {
    const lyrics = scoreEditor.activeSong?.lyrics;
    if (!lyrics) return [];
    return Array.from({ length: lyrics.split('\n').length }, (_, i) => i);
  };

  /** 统一构造 Worker 导出载荷（normal / a4 模式共用同一组设置项） */
  const buildExportPayload = (mode: 'normal' | 'a4'): ExportPayload =>
    prepareWorkerExportPayload(
      scoreEditor.activeSong!,
      allLyricsLineIndices(),
      chordsLookupMap.value,
      mode,
      settingsStore.scoreChordShorthand,
      settingsStore.scoreLayoutAlign,
      scoreEditor.fontScale,
      scoreEditor.fretboardScale,
      settingsStore.scoreShowBarre,
      settingsStore.scoreLyricsFontWeight,
      settingsStore.scoreExportQuality,
      settingsStore.scorePageMargin,
      settingsStore.scorePageSize,
      settingsStore.scoreShowFooter,
      settingsStore.scoreIgnoreEmptySpace
    );

  /**
   * 预览 tab 的导出：整曲经 Worker 离屏渲染为一张长图（normal 模式），
   * 再按操作写入剪贴板或触发浏览器下载。
   */
  const handleScoreExport = async (op: 'copy' | 'download') => {
    if (uiStore.isCopying) return;
    const song = scoreEditor.activeSong;
    const lineIndices = allLyricsLineIndices();
    if (!song || lineIndices.length === 0) return;

    uiStore.isCopying = true;
    const exportLoadingToastId = uiStore.toast.loading('正在渲染整曲长图...');
    try {
      const payload = buildExportPayload('normal');
      const { blobs } = await runWorkerExport(payload);
      if (blobs.length === 0) throw new Error('未能生成有效的导出图片');

      if (op === 'copy') {
        await writeBlobToClipboard(blobs[0]!);
        uiStore.toast.success('成功复制至系统剪贴板');
      } else {
        triggerBlobDownload(blobs[0]!, `${buildExportFileName(song.title || '')}.jpg`);
        uiStore.toast.success('已开始下载');
      }
    } catch (err) {
      console.error('Score export error:', err);
      uiStore.toast.error(err instanceof Error ? err.message : '导出失败');
    } finally {
      uiStore.removeToast(exportLoadingToastId);
      uiStore.isCopying = false;
    }
  };

  /** 预览 tab 的分页导出为 Zip：经 Worker 离屏渲染为 A4 分页图片，再打包为一个 zip 文件下载 */
  const handleScoreExportZip = async () => {
    if (uiStore.isCopying) return;
    const song = scoreEditor.activeSong;
    const lineIndices = allLyricsLineIndices();
    if (!song || lineIndices.length === 0) return;

    uiStore.isCopying = true;
    const exportLoadingToastId = uiStore.toast.loading('正在渲染分页图片并打包...');
    try {
      const payload = buildExportPayload('a4');
      const { blobs } = await runWorkerExport(payload);
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
      uiStore.toast.success('已开始下载');
    } catch (err) {
      console.error('Score export zip error:', err);
      uiStore.toast.error(err instanceof Error ? err.message : '导出失败');
    } finally {
      uiStore.removeToast(exportLoadingToastId);
      uiStore.isCopying = false;
    }
  };

  /** 预览 tab 的分页导出为 PDF：经 Worker 渲染 A4 分页图片后，用 pdf-lib（按需懒加载）把
   *  每页 JPEG 原样嵌入 PDF（/DCTDecode，不二次编码），每页铺满对应 MediaBox 后下载 */
  const handleScoreExportPdf = async () => {
    if (uiStore.isCopying) return;
    const song = scoreEditor.activeSong;
    const lineIndices = allLyricsLineIndices();
    if (!song || lineIndices.length === 0) return;

    uiStore.isCopying = true;
    const exportLoadingToastId = uiStore.toast.loading('正在渲染分页图片并生成 PDF...');
    try {
      const payload = buildExportPayload('a4');
      const { blobs } = await runWorkerExport(payload);
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
      uiStore.toast.success('已开始下载');
    } catch (err) {
      console.error('Score export pdf error:', err);
      uiStore.toast.error(err instanceof Error ? err.message : '导出失败');
    } finally {
      uiStore.removeToast(exportLoadingToastId);
      uiStore.isCopying = false;
    }
  };

  /** 下载下拉标题：展示预估长图文件尺寸（进入预览导出态时经 Worker 真实渲染测量） */
  const estimatedLongImageBytes = ref<number | null>(null);
  const isEstimating = ref(false);
  /** 上次估算的输入指纹：输入未变化则跳过重复渲染 */
  const lastEstimateKey = ref('');

  /** 聚合影响导出尺寸的响应式输入，作为估算去重指纹 */
  const buildEstimateKey = (): string => {
    const song = scoreEditor.activeSong;
    if (!song) return '';
    // 和弦排列指纹：槽位→和弦 id 的绑定关系决定渲染出哪些指板图，
    // 仅记「有无」会在增删/换绑和弦后产生相同指纹而跳过重估（store 变更时替换新 Map 引用）
    const chordMapKey = song.chordMap
      ? [...song.chordMap.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).join('|')
      : '0';
    return [
      song.lyrics,
      song.singer ?? '',
      song.title ?? '',
      chordMapKey,
      chordsLookupMap.value?.size ?? 0,
      settingsStore.scoreChordShorthand,
      settingsStore.scoreLayoutAlign,
      scoreEditor.fontScale,
      scoreEditor.fretboardScale,
      settingsStore.scoreShowBarre,
      settingsStore.scoreLyricsFontWeight,
      settingsStore.scoreExportQuality,
      settingsStore.scorePageMargin,
      settingsStore.scorePageSize,
      settingsStore.scoreShowFooter,
      settingsStore.scoreIgnoreEmptySpace,
    ].join('|');
  };

  /** 触发尺寸预估：复用 Worker 真实渲染管线，仅取长图 blob 字节数 */
  const updateExportSizeEstimate = async () => {
    const key = buildEstimateKey();
    if (!key || isEstimating.value || key === lastEstimateKey.value) return;

    isEstimating.value = true;
    try {
      const payload = buildExportPayload('normal');
      const { longImageBytes } = await runWorkerEstimate(payload);
      // 渲染期间输入可能已变化，仅在指纹未被覆盖时采纳结果
      if (key === buildEstimateKey()) {
        estimatedLongImageBytes.value = longImageBytes;
        lastEstimateKey.value = key;
      }
    } catch {
      estimatedLongImageBytes.value = null;
    } finally {
      isEstimating.value = false;
    }
  };

  /** 下载下拉标题文本：空态返回 ''（不渲染标题行）；计算中/就绪分别给出状态 */
  const downloadMenuTitle = computed(() => {
    if (!isPreviewExportMode.value) return '';
    const bytes = estimatedLongImageBytes.value;
    if (bytes == null) return isEstimating.value ? '预估文件尺寸计算中…' : '预估文件尺寸';
    return `预估文件大小 ${formatBytes(bytes)}`;
  });

  /** 进入预览导出态或任一影响尺寸的设定变更时，按需刷新预估尺寸 */
  watch(
    [
      isPreviewExportMode,
      () => scoreEditor.activeSong?.lyrics,
      () => scoreEditor.activeSong?.singer,
      () => scoreEditor.activeSong?.chordMap,
      () => chordsLookupMap.value,
      () => settingsStore.scoreChordShorthand,
      () => settingsStore.scoreLayoutAlign,
      () => scoreEditor.fontScale,
      () => scoreEditor.fretboardScale,
      () => settingsStore.scoreShowBarre,
      () => settingsStore.scoreLyricsFontWeight,
      () => settingsStore.scoreExportQuality,
      () => settingsStore.scorePageMargin,
      () => settingsStore.scorePageSize,
      () => settingsStore.scoreShowFooter,
      () => settingsStore.scoreIgnoreEmptySpace,
    ],
    () => {
      if (isPreviewExportMode.value) void updateExportSizeEstimate();
    },
    // 立即执行：页面刷新后若已处于预览导出态（URL 持久化到 preview tab）且歌曲已同步水合，
    // watch 不会因「值从未变化」而触发，需 immediate 主动跑一次预估，否则 size 一直为空
    { immediate: true }
  );

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
