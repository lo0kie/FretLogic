import { globalDarkMode } from '@/stores/globalState';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useUiStore } from '@/stores/uiStore';
import { A4_CONTENT_HEIGHT, A4_CONTENT_WIDTH, A4_HEIGHT_PX, A4_WIDTH_PX } from '@/utils/constants';
import { canvasToBlob, paginateLinesByHeight, renderElementToCanvas, writeBlobToClipboard } from '@/utils/score-export';
import { useDebounceFn } from '@vueuse/core';
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue';

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

export function useScoreExportPreview(
  sortedSelectedIndices: Ref<number[]>,
  metaHeaderRef: Ref<HTMLElement | null>,
  exportPageLineSet: Ref<Set<number>>,
  a4WrapperRef: Ref<HTMLElement | null>
) {
  const uiStore = useUiStore();
  const scoreEditor = useScoreEditorStore();
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
  let encodeCounter = 0;

  const waitForPaint = () =>
    new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

  const skipAddBtnSlot = (node: Node): boolean =>
    node.nodeType !== 1 || !(node as Element).classList.contains('add-btn-slot');

  const getLayoutDataKey = () => {
    const song = scoreEditor.activeSong;
    if (!song) return 'none';
    return `${song.id}_v${song.version ?? 1}_[${sortedSelectedIndices.value.join(',')}]_m${includeMetaBar.value}_dark${globalDarkMode.value}`;
  };

  const revokeCurrentObjectUrls = () => {
    pages.value.forEach(page => {
      if (page.objectUrl) URL.revokeObjectURL(page.objectUrl);
    });
  };

  const clearPreview = () => {
    revokeCurrentObjectUrls();
    pages.value = [];
    currentPageIndex.value = 0;
    staleQualityPageIndices.value.clear();
  };

  const clearAllCaches = () => {
    modeCaches[ExportMode.NORMAL] = null;
    modeCaches[ExportMode.A4] = null;
  };

  const decodeBlobToCanvas = async (blob: Blob): Promise<HTMLCanvasElement> => {
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 上下文不可用');
    context.drawImage(bmp, 0, 0);
    bmp.close();
    return canvas;
  };

  const restoreFromCache = async (cached: CachedModeData) => {
    const currentQuality = scoreEditor.exportQuality;
    const nextPages: PreviewPage[] = [];
    const staleIndices = new Set<number>();

    for (let i = 0; i < cached.pages.length; i++) {
      const pageCache = cached.pages[i]!;
      const canvas = cached.canvases[i] ?? null;

      if (Math.abs(pageCache.quality - currentQuality) < 0.001) {
        nextPages.push({
          canvas,
          blob: pageCache.blob,
          objectUrl: URL.createObjectURL(pageCache.blob),
        });
      } else {
        if (i === currentPageIndex.value && canvas) {
          const freshBlob = await canvasToBlob(canvas, 'image/jpeg', currentQuality);
          pageCache.blob = freshBlob;
          pageCache.quality = currentQuality;
          nextPages.push({
            canvas,
            blob: freshBlob,
            objectUrl: URL.createObjectURL(freshBlob),
          });
        } else {
          staleIndices.add(i);
          nextPages.push({
            canvas,
            blob: pageCache.blob,
            objectUrl: URL.createObjectURL(pageCache.blob),
          });
        }
      }
    }

    const oldPages = pages.value;
    pages.value = nextPages;
    staleQualityPageIndices.value = staleIndices;

    requestAnimationFrame(() => {
      oldPages.forEach(p => {
        if (p.objectUrl) URL.revokeObjectURL(p.objectUrl);
      });
    });
  };

  const generateNormalCanvases = async (): Promise<HTMLCanvasElement[]> => {
    const container = uiStore.activeExportTarget;
    if (!container) throw new Error('导出目标不存在');
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
      progress.value = 90;
      return [canvas];
    } finally {
      if (metaHeaderRef.value) {
        metaHeaderRef.value.style.width = '';
      }
    }
  };

  const generateA4Canvases = async (): Promise<HTMLCanvasElement[]> => {
    const container = uiStore.activeExportTarget;
    if (!container) throw new Error('导出目标不存在');
    const wrapper = a4WrapperRef.value;
    if (!wrapper) return [];
    const bgColor = globalDarkMode.value ? '#18181a' : '#f2f2f7';

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
    scoreEditor.exportScaleMultiplier = fitScale;

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
    const renderedCanvases: HTMLCanvasElement[] = [];

    try {
      for (let i = 0; i < pageChunks.length; i++) {
        const chunk = pageChunks[i]!;
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
        renderedCanvases.push(canvas);
        progress.value = Math.round(((i + 1) / pageChunks.length) * 90);
      }
      return renderedCanvases;
    } finally {
      wrapper.classList.remove('is-a4-capture-mode');
      scoreEditor.exportScaleMultiplier = 1;
      if (metaHeaderRef.value) metaHeaderRef.value.style.display = '';
    }
  };

  const generatePreview = async () => {
    if (isGenerating.value || !uiStore.activeExportTarget || sortedSelectedIndices.value.length === 0) {
      return;
    }

    const currentMode = mode.value;
    const layoutKey = getLayoutDataKey();
    const cached = modeCaches[currentMode];

    if (cached && cached.layoutKey === layoutKey && cached.canvases.length > 0) {
      isGenerating.value = true;
      try {
        await restoreFromCache(cached);
        progress.value = 100;
      } finally {
        isGenerating.value = false;
      }
      return;
    }

    isGenerating.value = true;
    progress.value = 0;
    clearPreview();

    try {
      const canvases = currentMode === ExportMode.NORMAL ? await generateNormalCanvases() : await generateA4Canvases();

      if (canvases.length === 0) throw new Error('未能生成有效的画布数据');

      const generatedPages: PreviewPage[] = [];
      const cachedPages: { blob: Blob; quality: number }[] = [];
      const currentQuality = scoreEditor.exportQuality;

      for (let i = 0; i < canvases.length; i++) {
        const canvas = canvases[i]!;
        const blob = await canvasToBlob(canvas, 'image/jpeg', currentQuality);
        generatedPages.push({ canvas, blob, objectUrl: URL.createObjectURL(blob) });
        cachedPages.push({ blob, quality: currentQuality });
      }

      pages.value = generatedPages;
      modeCaches[currentMode] = {
        layoutKey,
        canvases,
        pages: cachedPages,
      };

      progress.value = 100;
    } catch (err) {
      console.error('Generate Export Preview Error:', err);
      uiStore.toast.error(err instanceof Error ? err.message : '预览生成失败');
    } finally {
      exportPageLineSet.value = new Set();
      isGenerating.value = false;
    }
  };

  const reencodeCurrentPages = async () => {
    if (pages.value.length === 0) return;
    const currentMode = mode.value;
    const cached = modeCaches[currentMode];
    const idx = currentPageIndex.value;
    const targetPage = pages.value[idx];

    let targetCanvas = targetPage?.canvas || cached?.canvases[idx] || null;

    if (!targetCanvas) {
      if (targetPage?.blob) {
        try {
          targetCanvas = await decodeBlobToCanvas(targetPage.blob);
          if (cached && cached.canvases) {
            cached.canvases[idx] = targetCanvas;
          }
        } catch {
          await generatePreview();
          return;
        }
      } else {
        await generatePreview();
        return;
      }
    }

    const currentCounter = ++encodeCounter;
    isGenerating.value = true;

    try {
      const targetQuality = scoreEditor.exportQuality;
      const blob = await canvasToBlob(targetCanvas, 'image/jpeg', targetQuality);

      if (currentCounter !== encodeCounter) return;

      const oldObjectUrl = pages.value[idx]?.objectUrl;
      const nextPages = [...pages.value];
      nextPages[idx] = { canvas: targetCanvas, blob, objectUrl: URL.createObjectURL(blob) };
      pages.value = nextPages;

      if (cached && cached.pages[idx]) {
        cached.pages[idx] = { blob, quality: targetQuality };
      }

      if (oldObjectUrl) {
        requestAnimationFrame(() => URL.revokeObjectURL(oldObjectUrl));
      }

      const nextStale = new Set(pages.value.map((_, i) => i).filter(i => i !== idx));
      staleQualityPageIndices.value = nextStale;

      uiStore.toast.success(`已应用画质：${Math.round(targetQuality * 100)}%`);
    } catch (err) {
      console.error('画质调整失败:', err);
      uiStore.toast.error('画质调整失败');
    } finally {
      if (currentCounter === encodeCounter) {
        isGenerating.value = false;
      }
    }
  };

  const debouncedEncode = useDebounceFn(async () => {
    await reencodeCurrentPages();
  }, 150);

  const applyQuality = (nextQuality: number) => {
    scoreEditor.exportQuality = nextQuality;
    isGenerating.value = true;
    debouncedEncode();
  };

  const ensurePageQualityFresh = async (idx: number) => {
    if (!staleQualityPageIndices.value.has(idx)) return;
    const page = pages.value[idx];
    const currentMode = mode.value;
    const cached = modeCaches[currentMode];
    let canvas = page?.canvas || cached?.canvases[idx] || null;

    if (!canvas && page?.blob) {
      try {
        canvas = await decodeBlobToCanvas(page.blob);
        if (cached && cached.canvases) cached.canvases[idx] = canvas;
      } catch {
        return;
      }
    }

    if (!canvas) {
      staleQualityPageIndices.value.delete(idx);
      return;
    }

    const currentQuality = scoreEditor.exportQuality;
    const oldObjectUrl = page?.objectUrl;
    const blob = await canvasToBlob(canvas, 'image/jpeg', currentQuality);

    const nextPages = [...pages.value];
    nextPages[idx] = { canvas, blob, objectUrl: URL.createObjectURL(blob) };
    pages.value = nextPages;

    if (cached && cached.pages[idx]) {
      cached.pages[idx] = { blob, quality: currentQuality };
    }

    staleQualityPageIndices.value.delete(idx);
    if (oldObjectUrl) {
      requestAnimationFrame(() => URL.revokeObjectURL(oldObjectUrl));
    }
  };

  const ensureAllPagesQualityFresh = async () => {
    const staleIndices = Array.from(staleQualityPageIndices.value);
    if (staleIndices.length === 0) return;
    await Promise.all(staleIndices.map(idx => ensurePageQualityFresh(idx)));
  };

  const copyCurrentPage = async () => {
    const page = currentPage.value;
    if (!page) return;
    try {
      const source = page.canvas ?? (await decodeBlobToCanvas(page.blob));
      const pngBlob = await canvasToBlob(source, 'image/png');
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
    await ensureAllPagesQualityFresh();
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

  watch(currentPageIndex, idx => {
    ensurePageQualityFresh(idx);
  });

  watch(mode, generatePreview);

  watch(
    () => globalDarkMode.value,
    () => {
      clearAllCaches();
    }
  );

  onBeforeUnmount(() => {
    debouncedEncode.cancel();
    encodeCounter++;
    isGenerating.value = false;
    revokeCurrentObjectUrls();
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
