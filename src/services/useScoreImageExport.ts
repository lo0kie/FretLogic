// === FILE: C:\Users\lookie\userspace\coding\fret-logic\src\services\useScoreImageExport.ts ===

import { useUiStore } from '@/stores/uiStore';
import { type Ref, nextTick, ref } from 'vue';

interface ExportOriginals {
  containerMinWidth: string;
  containerWidth: string;
  lines: {
    display: string;
    minWidth: string;
    width: string;
    transition: string;
    tagTransitions: string[]; // 🌟 记录每个行号标签原有的 transition
  }[];
}

export function useScoreImageExport(scoreZoneRef: Ref<HTMLElement | null>, selectedLineSet: Ref<Set<number>>) {
  const uiStore = useUiStore();
  const isExporting = ref(false);

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
      // 🌟 1. 临时关掉行的 transition
      el.style.transition = 'none';

      // 🌟 2. 临时关掉行号标签的 transition，让其瞬间褪色
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

  const generateBlob = async (container: HTMLElement, contentWidth: number, contentHeight: number) => {
    const htmlToImage = await import('html-to-image');
    const bgColor = getComputedStyle(document.body).getPropertyValue('--bg-main').trim() || '#f2f2f7';

    const paddingX = 80;
    const paddingY = 100;

    return htmlToImage.toBlob(container, {
      width: contentWidth + paddingX,
      height: contentHeight + paddingY,
      backgroundColor: bgColor,
      pixelRatio: 2,
      quality: 0.95,
      cacheBust: true,
      style: {
        transform: 'none',
        overflow: 'visible',
        backgroundColor: bgColor,
        width: `${contentWidth}px`,
        height: `${contentHeight}px`,
        minWidth: '0',
        paddingTop: `${paddingY / 2}px`,
        paddingBottom: `${paddingY / 2}px`,
        paddingLeft: `${paddingX / 2}px`,
        paddingRight: `${paddingX / 2}px`,
        boxSizing: 'content-box',
        margin: '0',
      },
      filter: (node: Node) => {
        if (node instanceof HTMLElement && node.classList.contains('add-btn-slot')) {
          return false;
        }
        return true;
      },
    });
  };

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

    let originals: ExportOriginals | null = null;

    try {
      await nextTick();
      await waitForPaint();

      originals = prepareForExport(container, lineEls);
      await waitForPaint();

      const { width, height } = measureSize(container, lineEls);
      const blob = await generateBlob(container, width, height);
      if (!blob) throw new Error('生成图片失败');

      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      uiStore.toast.success(`已成功复制所选 ${selectedLineSet.value.size} 行图片`);
    } catch (err) {
      console.error('Export Score Lines Error:', err);
      uiStore.toast.error('导出图片失败');
    } finally {
      if (originals) {
        restoreAfterExport(container, lineEls, originals);
      }
      isExporting.value = false;
    }
  };

  return { isExporting, handleCopySelectedImage };
}
