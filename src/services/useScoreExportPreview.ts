import { A4_CONTENT_HEIGHT, A4_CONTENT_WIDTH, A4_HEIGHT_PX, A4_WIDTH_PX } from '@/constants/print';
import { globalDarkMode } from '@/stores/globalState';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useUiStore } from '@/stores/uiStore';
import { canvasToBlob, renderElementToCanvas, writeBlobToClipboard } from '@/utils/domExporter';
import { paginateLinesByHeight } from '@/utils/paginateLines';
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue';

export type ExportMode = 'normal' | 'a4';

export interface PreviewPage {
  canvas: HTMLCanvasElement;
  blob: Blob;
  objectUrl: string;
}

interface CachedPreviewPage {
  canvas: HTMLCanvasElement;
  blob: Blob;
}

interface PreviewCache {
  key: string;
  pages: CachedPreviewPage[];
}

export function useScoreExportPreview(
  sortedSelectedIndices: Ref<number[]>,
  metaHeaderRef: Ref<HTMLElement | null>,
  exportPageLineSet: Ref<Set<number>>,
  a4WrapperRef: Ref<HTMLElement | null>
) {
  const uiStore = useUiStore();
  const scoreEditor = useScoreEditorStore();
  const progress = ref(0);
  const mode = ref<ExportMode>('normal');
  const pages = shallowRef<PreviewPage[]>([]);
  const currentPageIndex = ref(0);
  const isGenerating = ref(false);
  const currentPage = computed(() => pages.value[currentPageIndex.value] ?? null);
  const includeMetaBar = ref(true);
  const previewCache: Record<ExportMode, PreviewCache | null> = {
    normal: null,
    a4: null,
  };
  let lastDataKey = '';

  const waitForPaint = () =>
    new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

  const skipAddBtnSlot = (node: Node): boolean =>
    node.nodeType !== 1 || !(node as Element).classList.contains('add-btn-slot');

  const getDataKey = () => {
    const song = scoreEditor.activeSong;
    if (!song) return 'none';
    return `${song.id}_v${song.version ?? 1}_[${sortedSelectedIndices.value.join(',')}]_m${includeMetaBar.value}`;
  };

  const revokeCurrentObjectUrls = () => {
    pages.value.forEach(page => {
      URL.revokeObjectURL(page.objectUrl);
    });
  };

  const clearPreview = () => {
    revokeCurrentObjectUrls();
    pages.value = [];
    currentPageIndex.value = 0;
  };

  const clearPreviewCache = () => {
    previewCache.normal = null;
    previewCache.a4 = null;
    lastDataKey = '';
  };

  const restoreCachedPages = async (cache: PreviewCache) => {
    const nextPages = cache.pages.map(page => ({
      canvas: page.canvas,
      blob: page.blob,
      objectUrl: URL.createObjectURL(page.blob),
    }));
    await Promise.all(
      nextPages.map(
        page =>
          new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('预览图片加载失败'));
            img.src = page.objectUrl;
          })
      )
    );
    const oldPages = pages.value;
    pages.value = nextPages;
    currentPageIndex.value = 0;
    requestAnimationFrame(() => {
      oldPages.forEach(page => {
        URL.revokeObjectURL(page.objectUrl);
      });
    });
  };

  const saveCurrentPagesToCache = (cacheKey: string) => {
    previewCache[mode.value] = {
      key: cacheKey,
      pages: pages.value.map(page => ({
        canvas: page.canvas,
        blob: page.blob,
      })),
    };
  };

  const pushPage = async (canvas: HTMLCanvasElement) => {
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.85);
    pages.value = [...pages.value, { canvas, blob, objectUrl: URL.createObjectURL(blob) }];
  };

  const generateNormalPreview = async () => {
    const container = uiStore.activeExportTarget!;
    const paddingX = 80;
    const paddingY = 100;
    const bgColor = globalDarkMode.value ? '#18181a' : '#f2f2f7';
    exportPageLineSet.value = new Set(sortedSelectedIndices.value);
    await nextTick();
    await waitForPaint();
    const lineEls = Array.from(container.querySelectorAll<HTMLElement>('.lyrics-line'));
    let maxWidth = 0;
    lineEls.forEach((el, idx) => {
      if (sortedSelectedIndices.value.includes(idx)) {
        maxWidth = Math.max(maxWidth, el.scrollWidth);
      }
    });
    if (metaHeaderRef.value) {
      maxWidth = Math.max(maxWidth, metaHeaderRef.value.scrollWidth);
    }
    maxWidth = Math.max(maxWidth, 360);
    const height = container.scrollHeight;
    if (metaHeaderRef.value) {
      metaHeaderRef.value.style.width = `${maxWidth}px`;
    }
    try {
      progress.value = 50;
      const canvas = await renderElementToCanvas(container, {
        width: maxWidth + paddingX,
        height: height + paddingY,
        backgroundColor: bgColor,
        style: {
          transform: 'none',
          overflow: 'visible',
          backgroundColor: bgColor,
          width: `${maxWidth}px`,
          height: `${height}px`,
          minWidth: '0',
          paddingTop: `${paddingY / 2}px`,
          paddingBottom: `${paddingY / 2}px`,
          paddingLeft: `${paddingX / 2}px`,
          paddingRight: `${paddingX / 2}px`,
          boxSizing: 'content-box',
          margin: '0',
        },
        filter: skipAddBtnSlot,
      });
      await pushPage(canvas);
      progress.value = 100;
    } finally {
      if (metaHeaderRef.value) {
        metaHeaderRef.value.style.width = '';
      }
    }
  };

  const generateA4Preview = async () => {
    const container = uiStore.activeExportTarget!;
    const wrapper = a4WrapperRef.value;
    if (!wrapper) return;
    const bgColor = globalDarkMode.value ? '#18181a' : '#f2f2f7';
    const originalFontScale = scoreEditor.fontScale;
    const originalFretboardScale = scoreEditor.fretboardScale;
    exportPageLineSet.value = new Set(sortedSelectedIndices.value);
    await nextTick();
    await waitForPaint();
    const lineEls = Array.from(container.querySelectorAll<HTMLElement>('.lyrics-line'));
    let naturalMaxWidth = 0;
    lineEls.forEach((el, idx) => {
      if (sortedSelectedIndices.value.includes(idx)) naturalMaxWidth = Math.max(naturalMaxWidth, el.scrollWidth);
    });
    if (metaHeaderRef.value) naturalMaxWidth = Math.max(naturalMaxWidth, metaHeaderRef.value.scrollWidth);
    const fitScale = Math.min(1, A4_CONTENT_WIDTH / Math.max(naturalMaxWidth, 1));
    scoreEditor.fontScale = originalFontScale * fitScale;
    scoreEditor.fretboardScale = originalFretboardScale * fitScale;
    await nextTick();
    await waitForPaint();
    const scaledHeights = new Map<number, number>();
    lineEls.forEach((el, idx) => {
      if (sortedSelectedIndices.value.includes(idx)) scaledHeights.set(idx, el.scrollHeight);
    });
    const headerHeight = metaHeaderRef.value?.scrollHeight ?? 0;
    const pageChunks = paginateLinesByHeight(
      sortedSelectedIndices.value,
      scaledHeights,
      A4_CONTENT_HEIGHT - headerHeight,
      A4_CONTENT_HEIGHT
    );
    progress.value = 0;
    wrapper.classList.add('is-a4-capture-mode');
    try {
      for (let i = 0; i < pageChunks.length; i++) {
        const chunk = pageChunks[i];
        exportPageLineSet.value = new Set(chunk.lineIndices);
        if (metaHeaderRef.value) metaHeaderRef.value.style.display = chunk.isFirstPage ? '' : 'none';
        await nextTick();
        await waitForPaint();
        const canvas = await renderElementToCanvas(wrapper, {
          width: A4_WIDTH_PX,
          height: A4_HEIGHT_PX,
          backgroundColor: bgColor,
          style: { backgroundColor: bgColor },
          filter: skipAddBtnSlot,
        });
        await pushPage(canvas);
        progress.value = Math.round(((i + 1) / pageChunks.length) * 100);
      }
    } finally {
      wrapper.classList.remove('is-a4-capture-mode');
      scoreEditor.fontScale = originalFontScale;
      scoreEditor.fretboardScale = originalFretboardScale;
      if (metaHeaderRef.value) metaHeaderRef.value.style.display = '';
    }
  };

  const generatePreview = async () => {
    if (isGenerating.value || !uiStore.activeExportTarget || sortedSelectedIndices.value.length === 0) {
      return;
    }
    const currentMode = mode.value;
    const currentDataKey = getDataKey();
    if (lastDataKey !== currentDataKey) {
      previewCache.normal = null;
      previewCache.a4 = null;
      lastDataKey = currentDataKey;
    }
    const cached = previewCache[currentMode];
    if (cached?.key === currentDataKey) {
      await restoreCachedPages(cached);
      progress.value = 100;
      return;
    }
    isGenerating.value = true;
    progress.value = 0;
    clearPreview();
    try {
      if (currentMode === 'normal') {
        await generateNormalPreview();
      } else {
        await generateA4Preview();
      }
      if (pages.value.length > 0) {
        saveCurrentPagesToCache(currentDataKey);
      }
    } catch (err) {
      console.error('Generate Export Preview Error:', err);
      uiStore.toast.error(err instanceof Error ? err.message : '预览生成失败');
    } finally {
      exportPageLineSet.value = new Set();
      isGenerating.value = false;
    }
  };

  const copyCurrentPage = async () => {
    const page = currentPage.value;
    if (!page) {
      return;
    }
    try {
      const pngBlob = await canvasToBlob(page.canvas, 'image/png');
      await writeBlobToClipboard(pngBlob);
      uiStore.toast.success(
        pages.value.length > 1 ? `已复制第 ${currentPageIndex.value + 1} 页图片` : '已成功复制至系统剪贴板'
      );
    } catch (err) {
      uiStore.toast.error(err instanceof Error ? err.message : '复制失败');
    }
  };

  const downloadPdf = async () => {
    if (isGenerating.value) return;
    if (mode.value === 'normal') {
      uiStore.toast.info('正在为您自动切换至 A4 分页模式...');
      mode.value = 'a4';
      await generatePreview();
    }
    if (pages.value.length === 0) {
      return;
    }
    const loadingId = uiStore.toast.loading('正在打包 PDF，请稍候...');
    try {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({
        unit: 'mm',
        format: 'a4',
      });
      for (const [i, page] of pages.value.entries()) {
        if (i > 0) {
          pdf.addPage();
        }
        const bytes = new Uint8Array(await page.blob.arrayBuffer());
        pdf.addImage(bytes, 'JPEG', 0, 0, 210, 297);
      }
      pdf.save(`${scoreEditor.activeSong?.title || '歌词谱'}.pdf`);
      uiStore.removeToast(loadingId);
      uiStore.toast.success('PDF 已生成，请查看下载');
    } catch (err) {
      uiStore.removeToast(loadingId);
      uiStore.toast.error(err instanceof Error ? err.message : 'PDF 生成失败');
    }
  };

  const downloadCurrentPage = () => {
    const page = currentPage.value;
    if (!page) return;
    const title = scoreEditor.activeSong?.title?.trim() || '歌词谱';
    const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_');
    const pageSuffix = pages.value.length > 1 ? `_p${currentPageIndex.value + 1}` : '';
    const ext = page.blob.type.includes('png') ? 'png' : 'jpg';
    const link = document.createElement('a');
    link.href = page.objectUrl;
    link.download = `${safeTitle}${pageSuffix}.${ext}`;
    link.click();
    uiStore.toast.success(pages.value.length > 1 ? `已下载第 ${currentPageIndex.value + 1} 页` : '图片已下载');
  };

  watch(mode, generatePreview);
  watch(
    () => globalDarkMode.value,
    () => {
      previewCache.normal = null;
      previewCache.a4 = null;
      lastDataKey = '';
    }
  );

  onBeforeUnmount(() => {
    revokeCurrentObjectUrls();
    clearPreviewCache();
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
  };
}
