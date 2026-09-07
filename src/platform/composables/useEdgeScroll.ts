import { onBeforeUnmount, reactive, toValue, watch } from 'vue';

import type { MaybeRef } from 'vue';

/** 可跟踪的容器边：任意子集组合，决定暴露哪些“滚到该边”入口 */
export type ScrollEdge = 'top' | 'bottom' | 'left' | 'right';

export interface UseEdgeScrollOptions {
  /** 判定“未贴边”的阈值(px)，默认 8 */
  threshold?: number;
  /** 需要跟踪的边；决定暴露哪些 visible 状态与 scrollToX。默认仅 ['bottom'] */
  edges?: ScrollEdge[];
}

/**
 * 边缘滚动 composable：绑定可滚容器，随其滚动/尺寸变化刷新各边的 `visible`
 * （内容溢出可视区且未贴该边才为真），并暴露 `scrollToX` 平滑滚至对应边。
 * 与 UI 解耦，供浮动按钮、自动加载等场景复用；`edges` 支持任意方向组合。
 */
export const useEdgeScroll = (target: MaybeRef<HTMLElement | null>, options: UseEdgeScrollOptions = {}) => {
  const { threshold = 8, edges = ['bottom'] } = options;
  const has = (edge: ScrollEdge) => edges.includes(edge);

  /** 各边是否应显示“滚到该边”入口：可滚动 且 未贴该边 */
  const visible = reactive<Record<ScrollEdge, boolean>>({
    top: false,
    bottom: false,
    left: false,
    right: false,
  });

  let current: HTMLElement | null = null;
  let resizeObserver: ResizeObserver | null = null;

  const refresh = () => {
    const el = toValue(target);
    if (!el) {
      visible.top = visible.bottom = visible.left = visible.right = false;
      return;
    }
    const scrollableY = el.scrollHeight > el.clientHeight + 1;
    const scrollableX = el.scrollWidth > el.clientWidth + 1;

    const reachBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
    const reachTop = el.scrollTop <= threshold;
    const reachRight = el.scrollLeft + el.clientWidth >= el.scrollWidth - threshold;
    const reachLeft = el.scrollLeft <= threshold;

    visible.bottom = has('bottom') ? scrollableY && !reachBottom : false;
    visible.top = has('top') ? scrollableY && !reachTop : false;
    visible.right = has('right') ? scrollableX && !reachRight : false;
    visible.left = has('left') ? scrollableX && !reachLeft : false;
  };

  const handleScroll = () => refresh();

  watch(
    () => toValue(target),
    next => {
      current?.removeEventListener('scroll', handleScroll);
      resizeObserver?.disconnect();
      current = next ?? null;
      if (current) {
        current.addEventListener('scroll', handleScroll, { passive: true });
        // 内容高度变化（增删行/搜索过滤）也会改变“能否滚动/是否贴边”，需跟踪尺寸
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(refresh);
          resizeObserver.observe(current);
        }
      }
      refresh();
    },
    { immediate: true }
  );

  onBeforeUnmount(() => {
    current?.removeEventListener('scroll', handleScroll);
    resizeObserver?.disconnect();
  });

  /** 规范化滚动行为：仅接受 'auto' | 'instant'，传入 Event 或未知值时一律安全回退到 'smooth' */
  const resolveBehavior = (val?: unknown): ScrollBehavior => (val === 'auto' || val === 'instant' ? val : 'smooth');

  /** 平滑滚动至指定边（如容器已卸载则静默返回） */
  const scrollToEdge = (edge: ScrollEdge, behavior?: ScrollBehavior | unknown) => {
    const el = toValue(target);
    if (!el) return;
    const scrollBehavior = resolveBehavior(behavior);
    if (typeof el.scrollTo === 'function') {
      switch (edge) {
        case 'bottom':
          el.scrollTo({ top: el.scrollHeight, behavior: scrollBehavior });
          break;
        case 'top':
          el.scrollTo({ top: 0, behavior: scrollBehavior });
          break;
        case 'right':
          el.scrollTo({ left: el.scrollWidth, behavior: scrollBehavior });
          break;
        case 'left':
          el.scrollTo({ left: 0, behavior: scrollBehavior });
          break;
      }
    } else {
      switch (edge) {
        case 'bottom':
          el.scrollTop = el.scrollHeight;
          break;
        case 'top':
          el.scrollTop = 0;
          break;
        case 'right':
          el.scrollLeft = el.scrollWidth;
          break;
        case 'left':
          el.scrollLeft = 0;
          break;
      }
    }
  };

  return {
    visible,
    /** 由调用方在“仅内容高度变化、无滚动事件”后主动刷新各边状态（如切歌后 DOM 落定） */
    refresh,
    scrollToTop: (behavior?: ScrollBehavior | unknown) => scrollToEdge('top', behavior),
    scrollToBottom: (behavior?: ScrollBehavior | unknown) => scrollToEdge('bottom', behavior),
    scrollToLeft: (behavior?: ScrollBehavior | unknown) => scrollToEdge('left', behavior),
    scrollToRight: (behavior?: ScrollBehavior | unknown) => scrollToEdge('right', behavior),
    scrollToEdge,
  };
};
