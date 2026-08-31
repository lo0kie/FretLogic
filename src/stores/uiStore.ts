/**
 * UI store：全局 Toast 队列（含定时销毁）、侧栏开合状态与复制中标记等界面瞬时状态。
 */
import { STORAGE_KEYS, TOAST_DEFAULT_DURATION_MS } from '@/utils/core/constants';
import type { Toast, ToastOptions } from '@/types';
import { ToastType } from '@/types';
import { useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';

export const useUiStore = defineStore('ui', () => {
  const toasts = ref<Toast[]>([]);
  const isCopying = ref(false);
  const isLeftOpen = useStorage(STORAGE_KEYS.UI_LEFT_OPEN, true);
  const timersMap = new Map<number, ReturnType<typeof setTimeout>>();
  const activeExportTarget = shallowRef<HTMLElement | null>(null);

  const clearActionToasts = () => {
    toasts.value = toasts.value.filter(t => !t.onAction);
  };

  const removeToast = (id: number) => {
    toasts.value = toasts.value.filter(t => t.id !== id);
    if (timersMap.has(id)) {
      clearTimeout(timersMap.get(id));
      timersMap.delete(id);
    }
  };

  const remainingMap = new Map<number, number>();
  const startedAtMap = new Map<number, number>();

  const scheduleToastRemoval = (id: number, delay: number) => {
    if (timersMap.has(id)) clearTimeout(timersMap.get(id));
    startedAtMap.set(id, Date.now());
    remainingMap.set(id, delay);
    const timer = setTimeout(() => removeToast(id), delay);
    timersMap.set(id, timer);
  };

  const pauseAllTimers = () => {
    timersMap.forEach((timer, id) => {
      clearTimeout(timer);
      const startedAt = startedAtMap.get(id) ?? Date.now();
      const total = remainingMap.get(id) ?? TOAST_DEFAULT_DURATION_MS;
      const elapsed = Date.now() - startedAt;
      remainingMap.set(id, Math.max(0, total - elapsed));
    });
    timersMap.clear();
  };

  const resumeAllTimers = () => {
    toasts.value.forEach(toast => {
      if (toast.type !== ToastType.LOADING) {
        scheduleToastRemoval(toast.id, remainingMap.get(toast.id) ?? toast.duration ?? TOAST_DEFAULT_DURATION_MS);
      }
    });
  };

  let toastIdCounter = 0;

  const createToast = (msg: string, type: ToastType = ToastType.INFO, options: ToastOptions = {}) => {
    const id = ++toastIdCounter;
    const duration = options.duration ?? TOAST_DEFAULT_DURATION_MS;

    if (options.onAction) clearActionToasts();

    toasts.value.push({
      id,
      msg,
      description: options.description,
      type,
      actionText: options.actionText,
      ...(options.onAction !== undefined ? { onAction: options.onAction } : {}),
      duration,
      closable: options.closable ?? true,
      customClass: options.customClass,
    });

    if (type !== ToastType.LOADING) {
      scheduleToastRemoval(id, duration);
    }
    return id;
  };

  const toast = {
    info: (msg: string, options?: ToastOptions) => createToast(msg, ToastType.INFO, options),
    success: (msg: string, options?: ToastOptions) => createToast(msg, ToastType.SUCCESS, options),
    error: (msg: string, options?: ToastOptions) => createToast(msg, ToastType.ERROR, options),
    warning: (msg: string, options?: ToastOptions) => createToast(msg, ToastType.WARNING, options),
    loading: (msg: string, options?: ToastOptions) => createToast(msg, ToastType.LOADING, options),
    clear: () => {
      toasts.value.forEach(t => removeToast(t.id));
      toasts.value = [];
    },
    promise: async <T>(
      promise: Promise<T>,
      messages: {
        loading: string;
        success: string | ((data: T) => string);
        error: string | ((err: unknown) => string);
      },
      options?: ToastOptions
    ): Promise<T> => {
      const id = createToast(messages.loading, ToastType.LOADING, options);
      try {
        const res = await promise;
        removeToast(id);
        const successMsg = typeof messages.success === 'function' ? messages.success(res) : messages.success;
        createToast(successMsg, ToastType.SUCCESS, options);
        return res;
      } catch (err) {
        removeToast(id);
        const errorMsg = typeof messages.error === 'function' ? messages.error(err) : messages.error;
        createToast(errorMsg, ToastType.ERROR, options);
        throw err;
      }
    },
  };

  return {
    clearActionToasts,
    isLeftOpen,
    isCopying,
    toasts,
    toast,
    removeToast,
    pauseAllTimers,
    resumeAllTimers,
    activeExportTarget,
  };
});
