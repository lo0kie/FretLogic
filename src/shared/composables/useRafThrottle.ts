import { getCurrentInstance, onBeforeUnmount } from 'vue';

/**
 * rAF 尾部合帧：把同一帧内的多次高频调用（pointermove / wheel / scroll / resize 等）
 * 合并为一次，只保留最后一次的载荷，在下一帧统一交给回调执行。
 *
 * 用于收敛原先散布各处的 `pending + rafId` 手写样板：由本工具统一负责排帧去重、
 * 取消与组件卸载时的帧回收，避免遗漏 cancelAnimationFrame 造成的帧回调泄漏。
 */
export function useRafThrottle<T = void>(callback: (payload: T) => void) {
  let rafId = 0;
  let pending: T | undefined;
  let hasPending = false;

  /** 执行并清空待处理载荷：rAF 回调与 flush 共用 */
  const run = () => {
    rafId = 0;
    if (!hasPending) return;
    const payload = pending as T;
    pending = undefined;
    hasPending = false;
    callback(payload);
  };

  /** 记录最新载荷并排帧；帧已排时仅替换载荷，保证每帧至多执行一次 */
  const schedule = (payload: T) => {
    pending = payload;
    hasPending = true;
    if (rafId) return;
    rafId = requestAnimationFrame(run);
  };

  /** 取消已排的帧并立即执行待处理载荷：拖拽松手等场景用于消除视觉滞后 */
  const flush = () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    run();
  };

  /** 丢弃待处理载荷并取消排帧：指针离开、弹窗关闭等场景用于终止后续处理 */
  const cancel = () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    pending = undefined;
    hasPending = false;
  };

  // 指令等非组件上下文中调用时不注册卸载钩子
  if (getCurrentInstance()) {
    onBeforeUnmount(cancel);
  }

  return { schedule, flush, cancel };
}
