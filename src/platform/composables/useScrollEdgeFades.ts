import { getCurrentInstance, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';

import { useRafThrottle } from '../utils/useRafThrottle.ts';

export interface UseScrollEdgeFadesOptions {
  /** 判定处于边缘的容差阈值（像素），默认 1 */
  threshold?: number;
}

/**
 * 滚动边缘渐隐检测：
 * 用于在可滚动容器顶部/底部展示渐隐遮罩（Scroll Fade / Shadows），
 * - 顶部未滚动（scrollTop <= threshold）或容器无法滚动时，顶部渐隐隐藏（!atTop 为 false）；
 *   向下滚动后顶部渐隐显示，柔化顶边溢出切口；
 * - 容器未滚到底（scrollTop + clientHeight < scrollHeight - threshold）时，底部渐隐显示；
 *   滚到底部或容器无法滚动时，底部渐隐隐藏（!atBottom 为 false），确保末尾元素不被遮挡。
 *
 * 自动支持：
 * 1. 容器自身尺寸变化（ResizeObserver 监听容器）
 * 2. 子元素内容尺寸变化（ResizeObserver 监听直接子元素，如手风琴折叠展开）
 * 3. 子元素动态增删（MutationObserver 动态追踪新子节点，如切路由或搜索过滤）
 * 4. rAF 节流防抖与卸载自动清理，无内存泄漏
 */
export function useScrollEdgeFades(scrollRef: Ref<HTMLElement | null>, options: UseScrollEdgeFadesOptions = {}) {
  const { threshold = 1 } = options;

  const atTop = ref(true);
  const atBottom = ref(true);

  const syncEdgeFades = () => {
    const el = scrollRef.value;
    if (!el) return;

    const isScrollable = el.scrollHeight > el.clientHeight + threshold;
    if (!isScrollable) {
      atTop.value = true;
      atBottom.value = true;
      return;
    }

    atTop.value = el.scrollTop <= threshold;
    atBottom.value = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
  };

  const { schedule: scheduleSync, cancel: cancelSync } = useRafThrottle(syncEdgeFades);

  let sizeObserver: ResizeObserver | null = null;
  let mutationObserver: MutationObserver | null = null;
  const observedElements = new Set<Element>();

  const updateObservedElements = (el: HTMLElement) => {
    if (typeof ResizeObserver === 'undefined') return;
    if (!sizeObserver) {
      sizeObserver = new ResizeObserver(() => scheduleSync());
    }

    // 观察容器自身
    if (!observedElements.has(el)) {
      sizeObserver.observe(el);
      observedElements.add(el);
    }

    // 观察当前所有直接子节点
    const currentChildren = new Set(Array.from(el.children));
    for (const observed of Array.from(observedElements)) {
      if (observed !== el && !currentChildren.has(observed)) {
        sizeObserver.unobserve(observed);
        observedElements.delete(observed);
      }
    }
    for (const child of currentChildren) {
      if (!observedElements.has(child)) {
        sizeObserver.observe(child);
        observedElements.add(child);
      }
    }
  };

  const cleanup = () => {
    cancelSync();
    sizeObserver?.disconnect();
    sizeObserver = null;
    observedElements.clear();
    mutationObserver?.disconnect();
    mutationObserver = null;
  };

  const attach = (el: HTMLElement | null) => {
    cleanup();
    if (!el) return;

    el.addEventListener('scroll', syncEdgeFades, { passive: true });

    syncEdgeFades();
    updateObservedElements(el);

    if (typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver(() => {
        if (scrollRef.value) {
          updateObservedElements(scrollRef.value);
          scheduleSync();
        }
      });
      mutationObserver.observe(el, { childList: true, subtree: false });
    }
  };

  if (scrollRef.value) {
    attach(scrollRef.value);
  }

  if (getCurrentInstance()) {
    onMounted(() => {
      if (scrollRef.value) {
        attach(scrollRef.value);
      }
    });

    watch(scrollRef, (newEl, oldEl) => {
      if (oldEl) {
        oldEl.removeEventListener('scroll', syncEdgeFades);
      }
      attach(newEl);
    });

    onBeforeUnmount(() => {
      if (scrollRef.value) {
        scrollRef.value.removeEventListener('scroll', syncEdgeFades);
      }
      cleanup();
    });
  }

  return {
    atTop,
    atBottom,
    syncEdgeFades,
  };
}
