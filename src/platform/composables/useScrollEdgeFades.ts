import { computed, defineComponent, h, ref, watchEffect, type CSSProperties, type Ref } from 'vue';

import { useRafThrottle } from '../utils/useRafThrottle.ts';

export interface UseScrollEdgeFadesOptions {
  /** 判定处于边缘的容差阈值（像素），默认 3，避免高分屏缩放与子像素舍入导致边缘判定失效 */
  threshold?: number;
  /** 滚动方向：'vertical'（默认，检测上下边缘）| 'horizontal'（检测左右边缘） */
  direction?: 'vertical' | 'horizontal';
  /** 渐隐遮罩尺寸（像素数值或 CSS 长度字符串，默认 20） */
  fadeSize?: number | string;
  /** 渐变基色（供 overlay 样式使用，如 'var(--bg-panel)' 或 'var(--bg-elevated)'，默认 'var(--bg-panel)'） */
  color?: string;
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
  const { threshold = 3, direction = 'vertical', fadeSize = 20, color = 'var(--bg-panel)' } = options;

  const atTop = ref(true);
  const atBottom = ref(true);
  const atLeft = ref(true);
  const atRight = ref(true);

  const sizeStr = typeof fadeSize === 'number' ? `${fadeSize}px` : fadeSize;

  const maskStyle = computed<CSSProperties>(() => {
    if (direction === 'horizontal') {
      if (atLeft.value && atRight.value) {
        return { maskImage: 'none', WebkitMaskImage: 'none' };
      }
      let gradient: string;
      if (!atLeft.value && !atRight.value) {
        gradient = `linear-gradient(to right, transparent, black ${sizeStr}, black calc(100% - ${sizeStr}), transparent 100%)`;
      } else if (!atLeft.value && atRight.value) {
        gradient = `linear-gradient(to right, transparent, black ${sizeStr}, black 100%)`;
      } else {
        gradient = `linear-gradient(to right, black 0%, black calc(100% - ${sizeStr}), transparent 100%)`;
      }
      return { maskImage: gradient, WebkitMaskImage: gradient };
    } else {
      if (atTop.value && atBottom.value) {
        return { maskImage: 'none', WebkitMaskImage: 'none' };
      }
      let gradient: string;
      if (!atTop.value && !atBottom.value) {
        gradient = `linear-gradient(to bottom, transparent, black ${sizeStr}, black calc(100% - ${sizeStr}), transparent 100%)`;
      } else if (!atTop.value && atBottom.value) {
        gradient = `linear-gradient(to bottom, transparent, black ${sizeStr}, black 100%)`;
      } else {
        gradient = `linear-gradient(to bottom, black 0%, black calc(100% - ${sizeStr}), transparent 100%)`;
      }
      return { maskImage: gradient, WebkitMaskImage: gradient };
    }
  });

  const topStyle = computed<CSSProperties>(() => ({
    background: `linear-gradient(to bottom, ${color}, transparent)`,
    height: sizeStr,
    opacity: atTop.value ? 0 : 1,
    pointerEvents: 'none',
    transition: 'opacity 0.2s ease',
  }));

  const bottomStyle = computed<CSSProperties>(() => ({
    background: `linear-gradient(to top, ${color}, transparent)`,
    height: sizeStr,
    opacity: atBottom.value ? 0 : 1,
    pointerEvents: 'none',
    transition: 'opacity 0.2s ease',
  }));

  const leftStyle = computed<CSSProperties>(() => ({
    background: `linear-gradient(to right, ${color}, transparent)`,
    width: sizeStr,
    opacity: atLeft.value ? 0 : 1,
    pointerEvents: 'none',
    transition: 'opacity 0.2s ease',
  }));

  const rightStyle = computed<CSSProperties>(() => ({
    background: `linear-gradient(to left, ${color}, transparent)`,
    width: sizeStr,
    opacity: atRight.value ? 0 : 1,
    pointerEvents: 'none',
    transition: 'opacity 0.2s ease',
  }));

  const startStyle = computed<CSSProperties>(() => (direction === 'horizontal' ? leftStyle.value : topStyle.value));
  const endStyle = computed<CSSProperties>(() => (direction === 'horizontal' ? rightStyle.value : bottomStyle.value));

  const createFadeComponent = (defaultClass: string, styleRef: typeof topStyle, name: string) =>
    defineComponent({
      name,
      inheritAttrs: false,
      setup(_, { attrs }) {
        return () =>
          h('div', {
            'aria-hidden': 'true',
            ...attrs,
            'class': [defaultClass, attrs['class']],
            'style': [styleRef.value, attrs['style'] as CSSProperties],
          });
      },
    });

  const topFade = createFadeComponent(
    'z-panel pointer-events-none absolute inset-x-0 top-0',
    topStyle,
    'ScrollTopFade'
  );
  const bottomFade = createFadeComponent(
    'z-panel pointer-events-none absolute inset-x-0 bottom-0',
    bottomStyle,
    'ScrollBottomFade'
  );
  const leftFade = createFadeComponent(
    'z-panel pointer-events-none absolute inset-y-0 left-0',
    leftStyle,
    'ScrollLeftFade'
  );
  const rightFade = createFadeComponent(
    'z-panel pointer-events-none absolute inset-y-0 right-0',
    rightStyle,
    'ScrollRightFade'
  );
  const startFade = direction === 'horizontal' ? leftFade : topFade;
  const endFade = direction === 'horizontal' ? rightFade : bottomFade;

  const syncEdgeFades = () => {
    const el = scrollRef.value;
    if (!el) return;

    if (direction === 'horizontal') {
      const isScrollable = el.scrollWidth > el.clientWidth + threshold;
      if (!isScrollable) {
        atLeft.value = true;
        atRight.value = true;
        atTop.value = true;
        atBottom.value = true;
        return;
      }

      atLeft.value = el.scrollLeft <= threshold;
      atRight.value = Math.ceil(el.scrollLeft + el.clientWidth) >= Math.floor(el.scrollWidth) - threshold;
      atTop.value = atLeft.value;
      atBottom.value = atRight.value;
    } else {
      const isScrollable = el.scrollHeight > el.clientHeight + threshold;
      if (!isScrollable) {
        atTop.value = true;
        atBottom.value = true;
        atLeft.value = true;
        atRight.value = true;
        return;
      }

      atTop.value = el.scrollTop <= threshold;
      atBottom.value = Math.ceil(el.scrollTop + el.clientHeight) >= Math.floor(el.scrollHeight) - threshold;
      atLeft.value = atTop.value;
      atRight.value = atBottom.value;
    }
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

  const detach = (el: HTMLElement | null) => {
    if (el) {
      el.removeEventListener('scroll', syncEdgeFades);
    }
    cleanup();
  };

  const attach = (el: HTMLElement) => {
    cleanup();
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

  watchEffect(onCleanup => {
    const el = scrollRef.value;
    if (!el) return;
    attach(el);
    onCleanup(() => detach(el));
  });

  return {
    atTop,
    atBottom,
    atLeft,
    atRight,
    atStart: direction === 'horizontal' ? atLeft : atTop,
    atEnd: direction === 'horizontal' ? atRight : atBottom,
    maskStyle,
    topStyle,
    bottomStyle,
    leftStyle,
    rightStyle,
    startStyle,
    endStyle,
    topFade,
    bottomFade,
    leftFade,
    rightFade,
    startFade,
    endFade,
    TopFade: topFade,
    BottomFade: bottomFade,
    LeftFade: leftFade,
    RightFade: rightFade,
    StartFade: startFade,
    EndFade: endFade,
    syncEdgeFades,
  };
}
