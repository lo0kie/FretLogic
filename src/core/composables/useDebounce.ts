/** 传统 setTimeout 防抖（用于输入/存储等低频场景） */
import { onScopeDispose } from 'vue';

export function useDebounce() {
  let timer: ReturnType<typeof setTimeout> | null = null;

  function schedule(fn: () => void, delay = 300) {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, delay);
  }

  function cancel() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  onScopeDispose(cancel);

  return { schedule, cancel };
}
