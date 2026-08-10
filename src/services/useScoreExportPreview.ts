import { A4_CONTENT_HEIGHT, A4_CONTENT_WIDTH, A4_HEIGHT_PX, A4_WIDTH_PX } from '@/constants/print';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSettingsStore } from '@/stores/settingsStore';
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

/**
 * 真正的缓存数据。
 *
 * 注意：
 * - 不保存 objectUrl
 * - objectUrl 属于当前预览生命周期
 * - blob + canvas 才是真正需要复用的渲染结果
 */
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
  const settingStore = useSettingsStore();
  const uiStore = useUiStore();
  const scoreEditor = useScoreEditorStore();

  const progress = ref(0);
  const mode = ref<ExportMode>('normal');
  const pages = shallowRef<PreviewPage[]>([]);
  const currentPageIndex = ref(0);
  const isGenerating = ref(false);
  const currentPage = computed(() => pages.value[currentPageIndex.value] ?? null);

  const includeMetaBar = ref(true);

  /**
   * 普通模式和 A4 模式分别缓存。
   *
   * 例如：
   *
   * normal -> 普通缓存
   * a4     -> A4 缓存
   *
   * 两套缓存互不影响。
   */
  const previewCache: Record<ExportMode, PreviewCache | null> = {
    normal: null,
    a4: null,
  };

  /**
   * 当前数据对应的 cache key。
   *
   * 当歌曲内容、选择的行、是否包含歌曲信息发生变化时，
   * key 会变化，从而自动判定缓存失效。
   */
  let lastDataKey = '';

  const waitForPaint = () =>
    new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

  const skipAddBtnSlot = (node: Node): boolean =>
    node.nodeType !== 1 || !(node as Element).classList.contains('add-btn-slot');

  /**
   * 生成导出内容的数据指纹。
   *
   * activeSong 本身是响应式对象，JSON.stringify 会拿到当前最新数据。
   *
   * 这里没有把 mode 放进去，因为 normal / a4 本身就是两套独立缓存。
   */
  const getDataKey = () => {
    const activeSong = scoreEditor.activeSong;

    return JSON.stringify({
      song: activeSong
        ? {
            id: activeSong.id,
            title: activeSong.title,
            lyrics: activeSong.lyrics,
            chordMap: activeSong.chordMap,
            lineIds: activeSong.lineIds,
          }
        : null,
      selectedIndices: sortedSelectedIndices.value,
      includeMetaBar: includeMetaBar.value,
    });
  };

  /**
   * 释放当前预览所使用的 object URL。
   *
   * 注意：
   * 这里只释放 pages，不释放 previewCache。
   *
   * cache 中没有 objectUrl，所以不会影响缓存。
   */
  const revokeCurrentObjectUrls = () => {
    pages.value.forEach(page => {
      URL.revokeObjectURL(page.objectUrl);
    });
  };

  /**
   * 清空当前正在显示的预览。
   *
   * 注意：
   * 这里只清当前 pages。
   * 不清 previewCache。
   *
   * 这样关闭 Modal 后重新打开，可以直接从缓存恢复。
   */
  const clearPreview = () => {
    revokeCurrentObjectUrls();

    pages.value = [];
    currentPageIndex.value = 0;
  };

  /**
   * 清空两套缓存。
   *
   * 一般情况下不需要主动调用，因为 cache key 会自动处理失效。
   * 主要用于组件销毁时释放 Canvas / Blob 的引用。
   */
  const clearPreviewCache = () => {
    previewCache.normal = null;
    previewCache.a4 = null;
    lastDataKey = '';
  };

  /**
   * 将缓存页恢复成当前预览页。
   *
   * 每次恢复时只重新创建 object URL。
   *
   * 不重新：
   * - renderElementToCanvas
   * - canvasToBlob
   * - DOM 测量
   * - A4 分页
   */
  const restoreCachedPages = async (cache: PreviewCache) => {
    // 先创建新的 object URL
    const nextPages = cache.pages.map(page => ({
      canvas: page.canvas,
      blob: page.blob,
      objectUrl: URL.createObjectURL(page.blob),
    }));

    // 预加载并等待浏览器完成图片解码
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

    // 图片全部准备完成之后，才切换当前页面
    const oldPages = pages.value;

    pages.value = nextPages;
    currentPageIndex.value = 0;

    // 下一帧再释放旧 URL
    requestAnimationFrame(() => {
      oldPages.forEach(page => {
        URL.revokeObjectURL(page.objectUrl);
      });
    });
  };

  /**
   * 将当前 pages 保存到缓存。
   *
   * 注意：
   * pages 中的 objectUrl 不保存。
   */
  const saveCurrentPagesToCache = (cacheKey: string) => {
    previewCache[mode.value] = {
      key: cacheKey,
      pages: pages.value.map(page => ({
        canvas: page.canvas,
        blob: page.blob,
      })),
    };
  };

  /**
   * 将 Canvas 加入当前预览。
   *
   * 同时生成 Blob。
   *
   * Blob 会被缓存，因此后续切换模式时不需要再次 canvasToBlob。
   */
  const pushPage = async (canvas: HTMLCanvasElement) => {
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.85);
    pages.value = [...pages.value, { canvas, blob, objectUrl: URL.createObjectURL(blob) }];
  };

  /**
   * 普通图片预览。
   */
  const generateNormalPreview = async () => {
    const container = uiStore.activeExportTarget!;

    const paddingX = 80;
    const paddingY = 100;

    const bgColor = getComputedStyle(document.body).getPropertyValue('--bg-main').trim() || '#f2f2f7';

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

  /**
   * A4 图片预览。
   *
   * 第一次进入 A4 时正常执行：
   *
   * 1. 测量自然宽度
   * 2. 测量每行高度
   * 3. 计算 fitScale
   * 4. 计算分页
   * 5. 逐页生成 Canvas
   *
   * 后续只要 cache key 不变，就不会再次进入这里。
   */
  const generateA4Preview = async () => {
    const container = uiStore.activeExportTarget!; // 仍然用它做测量、筛选行
    const wrapper = a4WrapperRef.value;
    if (!wrapper) return;
    const bgColor = getComputedStyle(document.body).getPropertyValue('--bg-main').trim() || '#f2f2f7';
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

  /**
   * 生成预览。
   *
   * 核心缓存逻辑：
   *
   * 第一次：
   *
   *   normal -> render -> cache.normal
   *   a4     -> render -> cache.a4
   *
   * 第二次切换：
   *
   *   normal -> restore cache.normal
   *   a4     -> restore cache.a4
   */
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

    // 🌟 命中缓存：恢复页面，将进度调至 100%，直接返回（此时 isGenerating 仍为 false）
    if (cached?.key === currentDataKey) {
      await restoreCachedPages(cached);
      progress.value = 100;
      return;
    }

    // 🌟 未命中缓存：开启加载状态并清理旧预览
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

  /**
   * 复制当前页。
   *
   * 直接复用已经生成好的 Blob，
   * 不再执行 canvasToBlob。
   */
  const copyCurrentPage = async () => {
    const page = currentPage.value;
    if (!page) {
      return;
    }
    try {
      // 🌟 剪贴板严格要求 PNG 格式，点击复制时从保留的 canvas 实时提取 PNG 写入
      const pngBlob = await canvasToBlob(page.canvas, 'image/png');
      await writeBlobToClipboard(pngBlob);
      uiStore.toast.success(
        pages.value.length > 1 ? `已复制第 ${currentPageIndex.value + 1} 页图片` : '已成功复制至系统剪贴板'
      );
    } catch (err) {
      uiStore.toast.error(err instanceof Error ? err.message : '复制失败');
    }
  };

  /**
   * 导出 PDF。
   *
   * 这里继续使用 Canvas -> dataURL，
   * 因为 jsPDF 当前代码就是按照 PNG dataURL 添加图片。
   *
   * 这个操作只发生在用户主动点击 PDF，
   * 不影响预览缓存。
   */
  const downloadPdf = async () => {
    if (isGenerating.value) return;

    // 🌟 核心修复 1：PDF 本质是分页文档。如果在“常规长图”模式点击导出 PDF，自动切回 A4 模式重新生成
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

  /**
   * mode 的 watch 保留。
   *
   * 但现在它切换时会优先走 cache。
   */
  watch(mode, generatePreview);

  watch(
    () => settingStore.isDarkMode,
    () => {
      previewCache.normal = null;
      previewCache.a4 = null;
      lastDataKey = '';
    }
  );

  /**
   * 组件销毁：
   *
   * 1. 释放当前 object URL
   * 2. 清掉 cache 对 Canvas / Blob 的引用
   *
   * 这样不会因为 composable 销毁而长期持有大 Canvas。
   */
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
