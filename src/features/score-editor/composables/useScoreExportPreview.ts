import { computed, onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue';

import { useDebounceFn } from '@vueuse/core';

import { useScoreLinesData } from '@/features/score-editor/composables/useScoreLinesData';
import { prepareWorkerExportPayload, runWorkerExport } from '@/services/export/workerExportService';
import { globalDarkMode } from '@/stores/globalState';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import { DEFAULT_SCORE_TITLE } from '@/utils/core/constants';
import { canvasToBlob, writeBlobToClipboard, yieldMainThread } from '@/utils/score/score-export';

export enum ExportMode {
  NORMAL = 'normal',
  A4 = 'a4',
}

export interface PreviewPage {
  canvas: HTMLCanvasElement | null;
  blob: Blob;
  objectUrl: string;
}

interface CachedModeData {
  layoutKey: string;
  canvases: HTMLCanvasElement[];
  pages: { blob: Blob; quality: number }[];
}

/** 导出预览核心：按普通/A4 两种模式把选中行在 Web Worker 离屏渲染为画布，管理分页预览、画质重编码与复制/下载/PDF 导出 */
export function useScoreExportPreview(sortedSelectedIndices: Ref<number[]>) {
  const uiStore = useUiStore();
  const settingsStore = useSettingsStore();
  const scoreEditor = useScoreEditorStore();
  const { chordsLookupMap } = useScoreLinesData();
  const progress = ref(0);
  const mode = ref<ExportMode>(ExportMode.NORMAL);
  const pages = shallowRef<PreviewPage[]>([]);
  const currentPageIndex = ref(0);
  const isGenerating = ref(false);
  const currentPage = computed(() => pages.value[currentPageIndex.value] ?? null);
  const includeMetaBar = ref(true);

  const modeCaches: Record<ExportMode, CachedModeData | null> = {
    [ExportMode.NORMAL]: null,
    [ExportMode.A4]: null,
  };

  const staleQualityPageIndices = ref<Set<number>>(new Set());

  let runId = 0;

  /** 生成当前布局的缓存键：歌 ID + 版本 + 选中行 + 元信息栏 + 暗色模式 + 导出画质 + 符号简写，任一变化即视为缓存失效 */
  const getLayoutDataKey = () => {
    const song = scoreEditor.activeSong;
    if (!song) return 'none';
    return `${song.id}_v${song.version ?? 1}_[${sortedSelectedIndices.value.join(',')}]_m${includeMetaBar.value}_dark${globalDarkMode.value}_q${scoreEditor.exportQuality}_sh${settingsStore.scoreChordShorthand}`;
  };

  /** 释放当前所有预览页的 Blob URL，防止内存泄漏 */
  const revokeCurrentObjectUrls = () => {
    pages.value.forEach(page => {
      if (page.objectUrl) URL.revokeObjectURL(page.objectUrl);
    });
  };

  /** 清空预览页并释放资源，回到无预览状态 */
  const clearPreview = () => {
    runId++;
    revokeCurrentObjectUrls();
    pages.value = [];
    currentPageIndex.value = 0;
    staleQualityPageIndices.value.clear();
  };

  /** 丢弃普通/A4 两种模式的渲染缓存（如暗色模式切换等全局因素变化时使用） */
  const clearAllCaches = () => {
    modeCaches[ExportMode.NORMAL] = null;
    modeCaches[ExportMode.A4] = null;
  };

  /** 生成导出预览：布局与画质未变时直接走缓存恢复，否则通过 Worker 重新渲染并编码为 Blob 页写入缓存 */
  const generatePreview = async () => {
    if (!uiStore.activeExportTarget || sortedSelectedIndices.value.length === 0) {
      return;
    }

    const currentRunId = ++runId;
    const currentMode = mode.value;
    const layoutKey = getLayoutDataKey();
    const cached = modeCaches[currentMode];

    if (cached && cached.layoutKey === layoutKey && cached.pages.length > 0) {
      isGenerating.value = true;
      try {
        const nextPages: PreviewPage[] = cached.pages.map(pageCache => ({
          canvas: null,
          blob: pageCache.blob,
          objectUrl: URL.createObjectURL(pageCache.blob),
        }));
        if (currentRunId !== runId) return;
        const oldPages = pages.value;
        pages.value = nextPages;
        requestAnimationFrame(() => {
          oldPages.forEach(p => {
            if (p.objectUrl) URL.revokeObjectURL(p.objectUrl);
          });
        });
        progress.value = 100;
      } finally {
        if (currentRunId === runId) {
          isGenerating.value = false;
        }
      }
      return;
    }

    isGenerating.value = true;
    progress.value = 0;

    try {
      const activeSong = scoreEditor.activeSong;
      if (!activeSong) throw new Error('歌曲数据不存在');

      const payload = prepareWorkerExportPayload(
        activeSong,
        sortedSelectedIndices.value,
        chordsLookupMap.value,
        currentMode === ExportMode.NORMAL ? 'normal' : 'a4',
        scoreEditor.exportQuality,
        settingsStore.scoreChordShorthand,
        includeMetaBar.value
      );

      const blobs = await runWorkerExport(payload, pct => {
        if (currentRunId === runId) {
          progress.value = pct;
        }
      });

      if (currentRunId !== runId) return;
      if (blobs.length === 0) throw new Error('未能生成有效的导出数据');

      revokeCurrentObjectUrls();
      const generatedPages: PreviewPage[] = [];
      const cachedPages: { blob: Blob; quality: number }[] = [];
      const currentQuality = scoreEditor.exportQuality;

      for (let i = 0; i < blobs.length; i++) {
        const blob = blobs[i]!;
        generatedPages.push({ canvas: null, blob, objectUrl: URL.createObjectURL(blob) });
        cachedPages.push({ blob, quality: currentQuality });
      }

      pages.value = generatedPages;
      modeCaches[currentMode] = {
        layoutKey,
        canvases: [],
        pages: cachedPages,
      };

      progress.value = 100;
    } catch (err) {
      if (currentRunId === runId) {
        console.error('Generate Export Preview Error:', err);
        uiStore.toast.error(err instanceof Error ? err.message : '预览生成失败');
      }
    } finally {
      if (currentRunId === runId) {
        isGenerating.value = false;
      }
    }
  };

  const debouncedGenerate = useDebounceFn(async () => {
    await generatePreview();
  }, 120);

  /** 应用新画质：更新当前画质并通过 Worker 防抖重新生成 */
  const applyQuality = (nextQuality: number) => {
    scoreEditor.exportQuality = nextQuality;
    debouncedGenerate();
  };

  /** 复制当前页为 PNG 到系统剪贴板 */
  const copyCurrentPage = async () => {
    const page = currentPage.value;
    if (!page) return;
    try {
      let source = page.canvas;
      if (!source) {
        const bmp = await createImageBitmap(page.blob);
        const canvas = document.createElement('canvas');
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(bmp, 0, 0);
        bmp.close();
        source = canvas;
      }
      const pngBlob = await canvasToBlob(source, 'image/png');
      await writeBlobToClipboard(pngBlob);
      uiStore.toast.success(
        pages.value.length > 1 ? `已复制第 ${currentPageIndex.value + 1} 页图片` : '已成功复制至系统剪贴板'
      );
    } catch (err) {
      uiStore.toast.error(err instanceof Error ? err.message : '复制失败');
    }
  };

  /** 打包所有页下载为 PDF；普通模式先自动切换到 A4 分页，保证每页尺寸正确 */
  const downloadPdf = async () => {
    if (isGenerating.value) return;
    if (mode.value === ExportMode.NORMAL) {
      uiStore.toast.info('正在为您自动切换至 A4 分页模式...');
      mode.value = ExportMode.A4;
      await generatePreview();
    }
    if (pages.value.length === 0) return;

    const loadingId = uiStore.toast.loading('正在打包 PDF，请稍候...');
    try {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
      for (const [i, page] of pages.value.entries()) {
        if (i > 0) pdf.addPage();
        const bytes = new Uint8Array(await page.blob.arrayBuffer());
        pdf.addImage(bytes, 'JPEG', 0, 0, 210, 297);
        await yieldMainThread();
      }
      pdf.save(`${scoreEditor.activeSong?.title || DEFAULT_SCORE_TITLE}.pdf`);
      uiStore.removeToast(loadingId);
      uiStore.toast.success('PDF 已生成，请查看下载');
    } catch (err) {
      uiStore.removeToast(loadingId);
      uiStore.toast.error(err instanceof Error ? err.message : 'PDF 生成失败');
    }
  };

  /** 下载当前页图片（多页时文件名追加页码后缀） */
  const downloadCurrentPage = () => {
    const page = currentPage.value;
    if (!page) return;
    const title = scoreEditor.activeSong?.title?.trim() || DEFAULT_SCORE_TITLE;
    const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_');
    const pageSuffix = pages.value.length > 1 ? `_p${currentPageIndex.value + 1}` : '';
    const ext = page.blob.type.includes('png') ? 'png' : 'jpg';
    const link = document.createElement('a');
    link.href = page.objectUrl;
    link.download = `${safeTitle}${pageSuffix}.${ext}`;
    link.click();
    uiStore.toast.success(pages.value.length > 1 ? `已下载第 ${currentPageIndex.value + 1} 页` : '图片已下载');
  };

  watch([mode, includeMetaBar], generatePreview);

  watch(
    () => globalDarkMode.value,
    () => {
      clearAllCaches();
    }
  );

  onBeforeUnmount(() => {
    debouncedGenerate.cancel();
    isGenerating.value = false;
    clearPreview();
  });

  return {
    mode,
    pages,
    currentPage,
    currentPageIndex,
    isGenerating,
    includeMetaBar,
    generatePreview,
    copyCurrentPage,
    downloadPdf,
    clearPreview,
    downloadCurrentPage,
    progress,
    applyQuality,
  };
}
