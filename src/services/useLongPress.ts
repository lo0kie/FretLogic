import { onBeforeUnmount, ref } from 'vue';

export interface UseLongPressOptions {
  delay?: number;
  vibrate?: boolean;
}

/**
 * 移动端长按手势 Composable
 * @param onLongPress 长按触发回调
 * @param options 配置选项（响应延迟时间与震动）
 */
export function useLongPress(onLongPress: (e: TouchEvent) => void, options: UseLongPressOptions = {}) {
  const { delay = 350, vibrate = true } = options;

  const timer = ref<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressHandled = ref(false);

  const clearTimer = () => {
    if (timer.value) {
      clearTimeout(timer.value);
      timer.value = null;
    }
  };

  const handleTouchStart = (e: TouchEvent) => {
    isLongPressHandled.value = false;
    clearTimer();

    timer.value = setTimeout(() => {
      isLongPressHandled.value = true;
      if (vibrate && typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(30);
      }
      onLongPress(e);
    }, delay);
  };

  const handleTouchEnd = () => {
    clearTimer();
  };

  // 🌟 组件卸载时自动销毁未完成的 Timer，彻底避免内存泄漏 Bug
  onBeforeUnmount(() => {
    clearTimer();
  });

  return {
    isLongPressHandled,
    handleTouchStart,
    handleTouchEnd,
    handleTouchCancel: handleTouchEnd,
  };
}
