/**
 * 歌词拖拽自动滚动：指针接近容器边缘时以 rAF 驱动渐加速滚动，拖拽结束即停。
 */
export function useDragAutoScroll() {
  let autoScrollRafId: number | null = null;

  const SCROLL_THRESHOLD = 50;
  const MAX_SCROLL_SPEED = 14;

  const stopAutoScroll = () => {
    if (autoScrollRafId !== null) {
      cancelAnimationFrame(autoScrollRafId);
      autoScrollRafId = null;
    }
  };

  const checkAutoScroll = (
    container: HTMLElement | null | undefined,
    pointerPos: { x: number; y: number },
    onScrollTick?: () => void
  ) => {
    if (!container) {
      stopAutoScroll();
      return;
    }

    const rect = container.getBoundingClientRect();
    const { y, x } = pointerPos;

    let scrollDeltaY = 0;
    let scrollDeltaX = 0;

    if (y < rect.top + SCROLL_THRESHOLD && y > rect.top - 20) {
      const intensity = (rect.top + SCROLL_THRESHOLD - y) / SCROLL_THRESHOLD;
      scrollDeltaY = -Math.min(MAX_SCROLL_SPEED, Math.max(2, intensity * MAX_SCROLL_SPEED));
    } else if (y > rect.bottom - SCROLL_THRESHOLD && y < rect.bottom + 20) {
      const intensity = (y - (rect.bottom - SCROLL_THRESHOLD)) / SCROLL_THRESHOLD;
      scrollDeltaY = Math.min(MAX_SCROLL_SPEED, Math.max(2, intensity * MAX_SCROLL_SPEED));
    }

    if (x < rect.left + SCROLL_THRESHOLD && x > rect.left - 20) {
      const intensity = (rect.left + SCROLL_THRESHOLD - x) / SCROLL_THRESHOLD;
      scrollDeltaX = -Math.min(MAX_SCROLL_SPEED, Math.max(2, intensity * MAX_SCROLL_SPEED));
    } else if (x > rect.right - SCROLL_THRESHOLD && x < rect.right + 20) {
      const intensity = (x - (rect.right - SCROLL_THRESHOLD)) / SCROLL_THRESHOLD;
      scrollDeltaX = Math.min(MAX_SCROLL_SPEED, Math.max(2, intensity * MAX_SCROLL_SPEED));
    }

    const canScrollUp = scrollDeltaY < 0 && container.scrollTop > 0;
    const canScrollDown = scrollDeltaY > 0 && container.scrollTop + container.clientHeight < container.scrollHeight - 2;
    const canScrollLeft = scrollDeltaX < 0 && container.scrollLeft > 0;
    const canScrollRight = scrollDeltaX > 0 && container.scrollLeft + container.clientWidth < container.scrollWidth - 2;

    const actualScrollY = canScrollUp || canScrollDown ? scrollDeltaY : 0;
    const actualScrollX = canScrollLeft || canScrollRight ? scrollDeltaX : 0;

    if (actualScrollY !== 0 || actualScrollX !== 0) {
      container.scrollTop += actualScrollY;
      container.scrollLeft += actualScrollX;
      onScrollTick?.();
      autoScrollRafId = requestAnimationFrame(() => checkAutoScroll(container, pointerPos, onScrollTick));
    } else {
      stopAutoScroll();
    }
  };

  const isScrolling = () => autoScrollRafId !== null;

  return {
    checkAutoScroll,
    stopAutoScroll,
    isScrolling,
  };
}
