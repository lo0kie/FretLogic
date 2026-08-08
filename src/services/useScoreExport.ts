import { useUiStore } from '@/stores/uiStore';
import { copyElementToClipboard } from '@/utils/domExporter';
import { nextTick, Ref, ref } from 'vue';

export function useScoreImageExport(selectedLineSet: Ref<Set<number>>, metaHeaderRef: Ref<HTMLElement | null>) {
  const uiStore = useUiStore();
  const isExporting = ref(false);
  const includeMetaBar = ref(true);

  const measureSize = (container: HTMLElement, lineEls: HTMLElement[]) => {
    let maxWidth = 0;
    lineEls.forEach((el, idx) => {
      if (selectedLineSet.value.has(idx)) {
        maxWidth = Math.max(maxWidth, el.scrollWidth);
      }
    });
    if (metaHeaderRef.value) {
      maxWidth = Math.max(maxWidth, metaHeaderRef.value.scrollWidth);
    }
    if (maxWidth < 360) maxWidth = 360;
    return {
      width: maxWidth,
      height: container.scrollHeight,
    };
  };

  const waitForPaint = () =>
    new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

  const handleCopySelectedImage = async () => {
    if (selectedLineSet.value.size > 20) {
      uiStore.toast.warning('单次最多支持导出 20 行，请分段选择导出');
      return;
    }

    if (isExporting.value || selectedLineSet.value.size === 0 || !uiStore.activeExportTarget) return;
    const lineEls = Array.from(uiStore.activeExportTarget.querySelectorAll('.lyrics-line')) as HTMLElement[];

    isExporting.value = true;
    uiStore.toast.info(`正在生成所选 ${selectedLineSet.value.size} 行图片...`);

    try {
      await nextTick();
      await waitForPaint();

      const { width, height } = measureSize(uiStore.activeExportTarget, lineEls);
      if (metaHeaderRef.value) {
        metaHeaderRef.value.style.width = `${width}px`;
      }
      const paddingX = 80;
      const paddingY = 100;
      const bgColor = getComputedStyle(document.body).getPropertyValue('--bg-main').trim() || '#f2f2f7';

      await copyElementToClipboard(uiStore.activeExportTarget, {
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
      if (metaHeaderRef.value) {
        metaHeaderRef.value.style.width = '';
      }
      isExporting.value = false;
    }
  };

  return { isExporting, handleCopySelectedImage, includeMetaBar };
}
