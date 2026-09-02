import type { DirectiveBinding, DirectiveHook, ObjectDirective } from 'vue';

import { SCROLL_RESTORE_BUFFER_MS, SCROLL_RESTORE_MAX_DURATION_MS } from '@/utils/core/constants';

export interface ScrollPosition {
  top: number;
  left: number;
}

export interface ScrollCacheOptions {
  key?: string;
  /** 滚动方向：'y' 仅纵向 | 'x' 仅横向 | 'both' 双向同时记录 */
  axis?: 'x' | 'y' | 'both';
  /** 还原完成后的回调 */
  onRestored?: (pos: ScrollPosition) => void;
}

export type ScrollCacheBinding = string | ScrollCacheOptions | undefined;
export type ScrollCacheModifiers = 'x' | 'y' | 'both' | (string & Record<never, never>);

export interface ScrollCacheDirective extends ObjectDirective<HTMLElement, ScrollCacheBinding> {
  activated?: DirectiveHook<HTMLElement, null, ScrollCacheBinding>;
  deactivated?: DirectiveHook<HTMLElement, null, ScrollCacheBinding>;
}

const scrollPositions = new Map<string, ScrollPosition>();
const elKeys = new WeakMap<HTMLElement, string>();
const elHandlers = new WeakMap<HTMLElement, () => void>();

interface ActiveRestore {
  observer: ResizeObserver | null;
  timer: ReturnType<typeof setTimeout> | null;
  raf: number | null;
}
const activeRestoreMap = new WeakMap<HTMLElement, ActiveRestore>();

/**
 * 手动清理滚动缓存
 * @param key 可选。传入特定 key 清除单项，不传则清空全部缓存
 */
export const clearScrollCache = (key?: string) => {
  if (key) {
    scrollPositions.delete(key);
  } else {
    scrollPositions.clear();
  }
};

/** 归一化指令配置：缓存 key 取值顺序为绑定值 > DOM 稳定特征（id/name/data-key）> 路径+标签特征；轴方向修饰符优先。 */
const resolveOptions = (
  el: HTMLElement,
  binding: DirectiveBinding<ScrollCacheBinding>
): { key: string; axis: 'x' | 'y' | 'both'; onRestored?: (pos: ScrollPosition) => void } => {
  const val = binding.value;
  const mods = binding.modifiers;

  let key = '';
  let axis: 'x' | 'y' | 'both' = 'both';
  let onRestored: ((pos: ScrollPosition) => void) | undefined;

  if (typeof val === 'string' && val.trim()) {
    key = val.trim();
  } else if (val && typeof val === 'object') {
    if (val.key) key = val.key;
    if (val.axis) axis = val.axis;
    if (val.onRestored) onRestored = val.onRestored;
  }

  if (mods['x']) axis = 'x';
  if (mods['y']) axis = 'y';
  if (mods['both']) axis = 'both';

  if (!key) {
    // 优先使用 DOM 上的稳定特征标识（id、name、data-key、类名与层级特征）
    const domKey = el.dataset['scrollCacheKey'] || el.id || el.getAttribute('name');
    if (domKey) {
      key = `dom:${domKey}`;
    } else {
      key = `loc:${window.location.pathname}:${el.tagName}:${el.className.slice(0, 20)}`;
    }
  }

  return { key, axis, onRestored };
};

/** 取消元素上尚在进行中的滚动还原（清理观察器/定时器/动画帧）。 */
const cancelActiveRestore = (el: HTMLElement) => {
  const active = activeRestoreMap.get(el);
  if (active) {
    if (active.observer) active.observer.disconnect();
    if (active.timer) clearTimeout(active.timer);
    if (active.raf) cancelAnimationFrame(active.raf);
    activeRestoreMap.delete(el);
  }
};

/** 按轴记录元素当前滚动位置到缓存（rAF 节流调用）。 */
const save = (el: HTMLElement, axis: 'x' | 'y' | 'both' = 'both') => {
  const key = elKeys.get(el);
  if (!key) return;

  const current = scrollPositions.get(key) || { top: 0, left: 0 };
  const newPos: ScrollPosition = {
    top: axis === 'x' ? current.top : el.scrollTop,
    left: axis === 'y' ? current.left : el.scrollLeft,
  };
  scrollPositions.set(key, newPos);
};

/** 执行滚动还原：内容异步加载导致高度变化时由 ResizeObserver 持续校正，超时或到位后结束并派发事件。 */
const restoreScroll = (
  el: HTMLElement,
  savedPos: ScrollPosition,
  axis: 'x' | 'y' | 'both',
  onRestored?: (pos: ScrollPosition) => void
) => {
  cancelActiveRestore(el);

  const shouldRestoreY = axis !== 'x';
  const shouldRestoreX = axis !== 'y';

  if (!savedPos.top && !savedPos.left) {
    if (shouldRestoreY) el.scrollTop = 0;
    if (shouldRestoreX) el.scrollLeft = 0;
    return;
  }

  const MAX_DURATION = SCROLL_RESTORE_MAX_DURATION_MS;
  const startTime = performance.now();
  let resizeObserver: ResizeObserver | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let raf: number | null = null;

  const finish = () => {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    activeRestoreMap.delete(el);

    const detail: ScrollPosition = { top: el.scrollTop, left: el.scrollLeft };
    el.dispatchEvent(new CustomEvent('scroll-restored', { detail, bubbles: false }));
    onRestored?.(detail);
  };

  const start = () => {
    if (shouldRestoreY) el.scrollTop = savedPos.top;
    if (shouldRestoreX) el.scrollLeft = savedPos.left;

    resizeObserver = new ResizeObserver(() => {
      const isTimeout = performance.now() - startTime > MAX_DURATION;
      const isReachedY = !shouldRestoreY || Math.abs(el.scrollTop - savedPos.top) < 2;
      const isReachedX = !shouldRestoreX || Math.abs(el.scrollLeft - savedPos.left) < 2;

      if (isTimeout || (isReachedY && isReachedX && el.scrollHeight > el.clientHeight)) {
        finish();
        return;
      }
      if (shouldRestoreY) el.scrollTop = savedPos.top;
      if (shouldRestoreX) el.scrollLeft = savedPos.left;
    });

    resizeObserver.observe(el);

    timer = setTimeout(() => {
      finish();
    }, MAX_DURATION + SCROLL_RESTORE_BUFFER_MS);

    activeRestoreMap.set(el, { observer: resizeObserver, timer, raf });
  };

  if (!el.isConnected) {
    const wait = () => {
      if (el.isConnected) {
        start();
      } else if (performance.now() - startTime < MAX_DURATION) {
        raf = requestAnimationFrame(wait);
        activeRestoreMap.set(el, { observer: null, timer: null, raf });
      }
    };
    raf = requestAnimationFrame(wait);
    activeRestoreMap.set(el, { observer: null, timer: null, raf });
  } else {
    start();
  }
};

/** 缓存命中时调度一次滚动还原（下一帧执行）。 */
const restore = (el: HTMLElement, binding: DirectiveBinding<ScrollCacheBinding>) => {
  const { key, axis, onRestored } = resolveOptions(el, binding);
  elKeys.set(el, key);
  const savedPos = scrollPositions.get(key);
  if (savedPos !== undefined) {
    requestAnimationFrame(() => {
      restoreScroll(el, savedPos, axis, onRestored);
    });
  }
};

export const vScrollCache: ScrollCacheDirective = {
  mounted(el, binding) {
    const { axis } = resolveOptions(el, binding);
    restore(el, binding);

    let saveRaf: number | null = null;
    const onScroll = () => {
      if (saveRaf !== null) return;
      saveRaf = requestAnimationFrame(() => {
        save(el, axis);
        saveRaf = null;
      });
    };

    elHandlers.set(el, onScroll);
    el.addEventListener('scroll', onScroll, { passive: true });
  },
  activated(el, binding) {
    restore(el, binding);
  },
  deactivated(el, binding) {
    const { axis } = resolveOptions(el, binding);
    save(el, axis);
    cancelActiveRestore(el);
  },
  beforeUpdate(el, binding) {
    if (binding.value !== binding.oldValue) {
      const { axis } = resolveOptions(el, binding);
      save(el, axis);
    }
  },
  updated(el, binding) {
    if (binding.value !== binding.oldValue) {
      restore(el, binding);
    }
  },
  beforeUnmount(el, binding) {
    // 关键：在节点脱离 DOM 树（isConnected 变 false）前提前保存最终滚动位置
    const { axis } = resolveOptions(el, binding);
    save(el, axis);
    cancelActiveRestore(el);
  },
  unmounted(el) {
    const onScroll = elHandlers.get(el);
    if (onScroll) {
      el.removeEventListener('scroll', onScroll);
      elHandlers.delete(el);
    }
    cancelActiveRestore(el);
    elKeys.delete(el);
  },
};
