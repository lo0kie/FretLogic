import type { DirectiveBinding, DirectiveHook, ObjectDirective } from 'vue';

export type ScrollCacheBinding = string | undefined;

export interface ScrollCacheDirective extends ObjectDirective<HTMLElement, ScrollCacheBinding> {
  activated?: DirectiveHook<HTMLElement, null, ScrollCacheBinding>;
  deactivated?: DirectiveHook<HTMLElement, null, ScrollCacheBinding>;
}

const scrollPositions = new Map<string, number>();
const elKeys = new WeakMap<HTMLElement, string>();
const elIds = new WeakMap<HTMLElement, string>();
const elHandlers = new WeakMap<HTMLElement, () => void>();
let autoId = 0;

const resolveKey = (el: HTMLElement, binding: DirectiveBinding<ScrollCacheBinding>): string => {
  if (typeof binding.value === 'string' && binding.value) return binding.value;
  let id = elIds.get(el);
  if (!id) {
    id = `el:${++autoId}`;
    elIds.set(el, id);
  }
  return id;
};

const save = (el: HTMLElement) => {
  if (!el.isConnected) return;
  const key = elKeys.get(el);
  if (key !== undefined) {
    scrollPositions.set(key, el.scrollTop);
  }
};

const restoreScroll = (el: HTMLElement, savedTop: number) => {
  if (!savedTop) {
    el.scrollTop = 0;
    return;
  }
  const MAX_DURATION = 1200;
  const startTime = performance.now();
  let resizeObserver: ResizeObserver | null = null;

  const start = () => {
    el.scrollTop = savedTop;

    resizeObserver = new ResizeObserver(() => {
      const isTimeout = performance.now() - startTime > MAX_DURATION;
      const isReached = Math.abs(el.scrollTop - savedTop) < 2;

      if (isTimeout || (isReached && el.scrollHeight > el.clientHeight)) {
        resizeObserver?.disconnect();
        resizeObserver = null;
        return;
      }
      el.scrollTop = savedTop;
    });

    resizeObserver.observe(el);

    setTimeout(() => {
      resizeObserver?.disconnect();
      resizeObserver = null;
    }, MAX_DURATION + 200);
  };

  if (!el.isConnected) {
    const wait = () => {
      if (el.isConnected) {
        start();
      } else if (performance.now() - startTime < MAX_DURATION) {
        requestAnimationFrame(wait);
      }
    };
    requestAnimationFrame(wait);
  } else {
    start();
  }
};

const restore = (el: HTMLElement, binding: DirectiveBinding<ScrollCacheBinding>) => {
  const key = resolveKey(el, binding);
  elKeys.set(el, key);
  const savedTop = scrollPositions.get(key);
  if (savedTop !== undefined) {
    requestAnimationFrame(() => {
      restoreScroll(el, savedTop);
    });
  }
};

export const vScrollCache: ScrollCacheDirective = {
  mounted(el, binding) {
    restore(el, binding);
    const onScroll = () => save(el);
    elHandlers.set(el, onScroll);
    el.addEventListener('scroll', onScroll, { passive: true });
  },
  activated(el, binding) {
    restore(el, binding);
  },
  deactivated(el) {
    save(el);
  },
  beforeUpdate(el, binding) {
    if (binding.value !== binding.oldValue) {
      // 关键：在子内容被 v-if 卸载冲掉高度前，保存旧 key 滚动位置
      save(el);
    }
  },
  updated(el, binding) {
    if (binding.value !== binding.oldValue) {
      // 切换新 key 并恢复
      restore(el, binding);
    }
  },
  unmounted(el) {
    const onScroll = elHandlers.get(el);
    if (onScroll) {
      el.removeEventListener('scroll', onScroll);
      elHandlers.delete(el);
    }
    save(el);
    elKeys.delete(el);
    elIds.delete(el);
  },
};
