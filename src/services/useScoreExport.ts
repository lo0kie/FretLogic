import { useUiStore } from '@/stores/uiStore';
import { copyElementToClipboard } from '@/utils/domExporter';
import { type Ref, nextTick, ref } from 'vue';

interface ExportOriginals {
  containerMinWidth: string;
  containerWidth: string;
  lines: {
    display: string;
    minWidth: string;
    width: string;
    transition: string;
    tagTransitions: string[];
  }[];
}

export function useScoreImageExport(scoreZoneRef: Ref<HTMLElement | null>, selectedLineSet: Ref<Set<number>>) {
  const uiStore = useUiStore();
  const isExporting = ref(false);
  const includeMetaBar = ref(true);

  const prepareForExport = (container: HTMLElement, lineEls: HTMLElement[]): ExportOriginals => {
    const originals: ExportOriginals = {
      containerMinWidth: container.style.minWidth,
      containerWidth: container.style.width,
      lines: lineEls.map(el => {
        const textTag = el.querySelector('.index-text-tag') as HTMLElement;
        return {
          display: el.style.display,
          minWidth: el.style.minWidth,
          width: el.style.width,
          transition: el.style.transition,
          tagTransitions: textTag ? [textTag.style.transition] : [],
        };
      }),
    };

    container.style.minWidth = '0';
    container.style.width = 'max-content';

    lineEls.forEach((el, idx) => {
      el.style.transition = 'none';

      const textTag = el.querySelector('.index-text-tag') as HTMLElement;
      if (textTag) {
        textTag.style.transition = 'none';
      }

      if (!selectedLineSet.value.has(idx)) {
        el.style.display = 'none';
      } else {
        el.style.minWidth = '0';
        el.style.width = 'max-content';
      }
    });

    void container.offsetWidth;
    return originals;
  };

  const measureSize = (container: HTMLElement, lineEls: HTMLElement[]) => {
    let maxWidth = 0;
    lineEls.forEach((el, idx) => {
      if (selectedLineSet.value.has(idx)) {
        maxWidth = Math.max(maxWidth, el.scrollWidth);
      }
    });

    if (maxWidth < 80) maxWidth = 360;

    return {
      width: maxWidth,
      height: container.scrollHeight,
    };
  };

  const restoreAfterExport = (container: HTMLElement, lineEls: HTMLElement[], originals: ExportOriginals) => {
    lineEls.forEach((el, idx) => {
      const ori = originals.lines[idx];
      el.style.display = ori.display;
      el.style.minWidth = ori.minWidth;
      el.style.width = ori.width;
      el.style.transition = ori.transition;

      const textTag = el.querySelector('.index-text-tag') as HTMLElement;
      if (textTag && ori.tagTransitions[0] !== undefined) {
        textTag.style.transition = ori.tagTransitions[0];
      }
    });

    container.style.minWidth = originals.containerMinWidth;
    container.style.width = originals.containerWidth;
  };

  const waitForPaint = () =>
    new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

  const handleCopySelectedImage = async () => {
    if (selectedLineSet.value.size > 20) {
      uiStore.toast.warning('单次导出行数过多，建议分段选择导出以保证图片清晰度');
    }

    if (isExporting.value || selectedLineSet.value.size === 0) return;

    const container = scoreZoneRef.value?.querySelector('.lyrics-lines-container') as HTMLElement;
    if (!container) return;
    const lineEls = Array.from(container.querySelectorAll('.lyrics-line')) as HTMLElement[];

    isExporting.value = true;
    uiStore.toast.info(`正在生成所选 ${selectedLineSet.value.size} 行图片...`);

    await nextTick();
    await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));

    let originals: ExportOriginals | null = null;

    try {
      await nextTick();
      await waitForPaint();

      originals = prepareForExport(container, lineEls);
      await waitForPaint();

      const { width, height } = measureSize(container, lineEls);
      const paddingX = 80;
      const paddingY = 100;
      const bgColor = getComputedStyle(document.body).getPropertyValue('--bg-main').trim() || '#f2f2f7';

      // 🌟 上层将属于乐谱排版的特有尺寸、样式、filter 算好后，直接传给统一导出引擎
      await copyElementToClipboard(container, {
        width: width + paddingX,
        height: height + paddingY,
        backgroundColor: bgColor,
        style: {
          transform: 'none',
          overflow: 'visible',
          backgroundColor: bgColor,
          width: `${width}px`,
          height: `${height}px`,
          minWidth: '0',
          paddingTop: `${paddingY / 2}px`,
          paddingBottom: `${paddingY / 2}px`,
          paddingLeft: `${paddingX / 2}px`,
          paddingRight: `${paddingX / 2}px`,
          boxSizing: 'content-box',
          margin: '0',
        },
        filter: (node: Node) => {
          if (!(node instanceof Element)) return true;
          return !node.classList.contains('add-btn-slot');
        },
      });

      uiStore.toast.success(`已成功复制所选 ${selectedLineSet.value.size} 行图片`);
    } catch (err) {
      console.error('Export Score Lines Error:', err);
      if (err instanceof Error) uiStore.toast.error(err.message);
      else uiStore.toast.error('导出图片失败');
    } finally {
      if (originals) {
        restoreAfterExport(container, lineEls, originals);
      }
      isExporting.value = false;
    }
  };

  return { isExporting, handleCopySelectedImage, includeMetaBar };
}
