/**
 * RAF 驱动的合并调用器：高频触发场景下，合并为每帧最多一次调用。
 * 适合滚动、拖拽、指针移动等场景，替代 setTimeout 防抖以减少延迟。
 */
import { onScopeDispose } from 'vue';

export function useRafDebounce() {
  let rafId: number | null = null;
  let pending: (() => void) | null = null;

  function schedule(fn: () => void) {
    pending = fn;
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      const task = pending;
      pending = null;
      if (task) task();
    });
  }

  function cancel() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    pending = null;
  }

  onScopeDispose(cancel);

  return { schedule, cancel };
}
