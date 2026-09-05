import { onBeforeUnmount, reactive, toValue, watch, type MaybeRef } from 'vue';

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

  /** 平滑滚动至指定边（如容器已卸载则静默返回） */
  const scrollToEdge = (edge: ScrollEdge, behavior: ScrollBehavior = 'smooth') => {
    const el = toValue(target);
    if (!el) return;
    switch (edge) {
      case 'bottom':
        el.scrollTo({ top: el.scrollHeight, behavior });
        break;
      case 'top':
        el.scrollTo({ top: 0, behavior });
        break;
      case 'right':
        el.scrollTo({ left: el.scrollWidth, behavior });
        break;
      case 'left':
        el.scrollTo({ left: 0, behavior });
        break;
    }
  };

  return {
    visible,
    scrollToTop: () => scrollToEdge('top'),
    scrollToBottom: () => scrollToEdge('bottom'),
    scrollToLeft: () => scrollToEdge('left'),
    scrollToRight: () => scrollToEdge('right'),
    scrollToEdge,
  };
};
