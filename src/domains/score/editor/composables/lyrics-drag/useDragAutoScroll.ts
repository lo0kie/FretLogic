/**
 * 歌词拖拽自动滚动：指针接近容器边缘时以 rAF 驱动渐加速滚动，拖拽结束即停。
 */

import { clamp } from '@/platform/utils/common';

export function useDragAutoScroll() {
  let autoScrollRafId: number | null = null;
  // O5：rAF 循环每帧读「最近一次上报的指针位置」。旧实现递归闭包捕获首帧的 pointerPos 对象，
  // 调用方每次 pointermove 传入新对象时循环拿不到更新，指针回中心后仍持续滚动、永不中止。
  let latestPos: { x: number; y: number } | null = null;
  let activeContainer: HTMLElement | null = null;
  let activeTick: (() => void) | null = null;

  const SCROLL_THRESHOLD = 50;
  const MAX_SCROLL_SPEED = 14;

  /** 停止边缘自动滚动的 rAF 循环 */
  const stopAutoScroll = () => {
    if (autoScrollRafId !== null) {
      cancelAnimationFrame(autoScrollRafId);
      autoScrollRafId = null;
    }
    activeContainer = null;
    activeTick = null;
  };

  /** 单帧：按最新指针位置计算边缘速度并滚动；仍在边缘则排下一帧，否则自然结束 */
  const scrollFrame = () => {
    autoScrollRafId = null;
    const container = activeContainer;
    const onScrollTick = activeTick;
    const pointerPos = latestPos;
    if (!container || !pointerPos) {
      stopAutoScroll();
      return;
    }

    const rect = container.getBoundingClientRect();
    const { y, x } = pointerPos;

    let scrollDeltaY = 0;
    let scrollDeltaX = 0;

    if (y < rect.top + SCROLL_THRESHOLD && y > rect.top - 20) {
      const intensity = (rect.top + SCROLL_THRESHOLD - y) / SCROLL_THRESHOLD;
      scrollDeltaY = -clamp(intensity * MAX_SCROLL_SPEED, 2, MAX_SCROLL_SPEED);
    } else if (y > rect.bottom - SCROLL_THRESHOLD && y < rect.bottom + 20) {
      const intensity = (y - (rect.bottom - SCROLL_THRESHOLD)) / SCROLL_THRESHOLD;
      scrollDeltaY = clamp(intensity * MAX_SCROLL_SPEED, 2, MAX_SCROLL_SPEED);
    }

    if (x < rect.left + SCROLL_THRESHOLD && x > rect.left - 20) {
      const intensity = (rect.left + SCROLL_THRESHOLD - x) / SCROLL_THRESHOLD;
      scrollDeltaX = -clamp(intensity * MAX_SCROLL_SPEED, 2, MAX_SCROLL_SPEED);
    } else if (x > rect.right - SCROLL_THRESHOLD && x < rect.right + 20) {
      const intensity = (x - (rect.right - SCROLL_THRESHOLD)) / SCROLL_THRESHOLD;
      scrollDeltaX = clamp(intensity * MAX_SCROLL_SPEED, 2, MAX_SCROLL_SPEED);
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
      autoScrollRafId = requestAnimationFrame(scrollFrame);
    } else stopAutoScroll();
  };

  /** 检查指针是否接近容器边缘并渐加速滚动（越近越快）；循环进行中重复调用仅更新指针位置，不叠加 rAF */
  const checkAutoScroll = (
    container: HTMLElement | null | undefined,
    pointerPos: { x: number; y: number },
    onScrollTick?: () => void
  ) => {
    if (!container) {
      stopAutoScroll();
      return;
    }
    // 始终记录最新已知指针位置（副本，防调用方复用/替换对象造成的陈旧读数）
    latestPos = { x: pointerPos.x, y: pointerPos.y };
    if (autoScrollRafId !== null)
      // 循环已在跑：只更新位置，下一帧 scrollFrame 自然按新位置决策（含停止）
      return;

    activeContainer = container;
    activeTick = onScrollTick ?? null;
    autoScrollRafId = requestAnimationFrame(scrollFrame);
  };

  /** 是否正在进行边缘自动滚动 */
  const isScrolling = () => autoScrollRafId !== null;

  return {
    checkAutoScroll,
    stopAutoScroll,
    isScrolling,
  };
}
