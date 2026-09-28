/**
 * 指针贴边自动滚动：指针接近可滚容器边缘时以 rAF 驱动**渐加速**滚动，指针离开或到边界即停。
 *
 * 通用手势原语（零业务语义）：只读容器矩形 / 可滚量，只写 scrollTop / scrollLeft。
 * 原先住在乐谱域的拖拽实现里，于是被绑在域内；拖拽排序、画布平移这类场景同样需要它，
 * 故与其它手势原语一同归平台层。
 *
 * 与 `useEdgeScroll` 的分工（名字相近、关切不同，不要互相替代）：
 * - 本文件：**拖拽期间**由指针位置驱动的滚动，需要「渐加速 + 逐帧续帧」；
 * - `useEdgeScroll`：只观测各边**是否还能滚**（暴露 visible 标志与 scrollToEdge），
 *   不接指针、不驱动滚动，供浮动按钮 / 自动加载这类 UI 用。
 */

import { clamp } from '@/platform/utils/common';

/** 边缘判定带宽（px）：指针进入距边这么近的范围才开始滚 */
const SCROLL_THRESHOLD = 50;
/** 最大每帧滚动量（px）：越贴近边缘越接近它 */
const MAX_SCROLL_SPEED = 14;
/** 指针已越出容器的容忍量（px）：略微移出仍继续滚，避免贴边抖动 */
const OUTSIDE_TOLERANCE = 20;

export function usePointerEdgeAutoScroll() {
  let autoScrollRafId: number | null = null;
  // O5：rAF 循环每帧读「最近一次上报的指针位置」。旧实现递归闭包捕获首帧的 pointerPos 对象，
  // 调用方每次 pointermove 传入新对象时循环拿不到更新，指针回中心后仍持续滚动、永不中止。
  let latestPos: { x: number; y: number } | null = null;
  let activeContainer: HTMLElement | null = null;
  let activeTick: (() => void) | null = null;

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

    if (y < rect.top + SCROLL_THRESHOLD && y > rect.top - OUTSIDE_TOLERANCE) {
      const intensity = (rect.top + SCROLL_THRESHOLD - y) / SCROLL_THRESHOLD;
      scrollDeltaY = -clamp(intensity * MAX_SCROLL_SPEED, 2, MAX_SCROLL_SPEED);
    } else if (y > rect.bottom - SCROLL_THRESHOLD && y < rect.bottom + OUTSIDE_TOLERANCE) {
      const intensity = (y - (rect.bottom - SCROLL_THRESHOLD)) / SCROLL_THRESHOLD;
      scrollDeltaY = clamp(intensity * MAX_SCROLL_SPEED, 2, MAX_SCROLL_SPEED);
    }

    if (x < rect.left + SCROLL_THRESHOLD && x > rect.left - OUTSIDE_TOLERANCE) {
      const intensity = (rect.left + SCROLL_THRESHOLD - x) / SCROLL_THRESHOLD;
      scrollDeltaX = -clamp(intensity * MAX_SCROLL_SPEED, 2, MAX_SCROLL_SPEED);
    } else if (x > rect.right - SCROLL_THRESHOLD && x < rect.right + OUTSIDE_TOLERANCE) {
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
