import { STORAGE_KEYS } from '@/constants';
import type { Toast, ToastOptions } from '@/types';
import { ToastType } from '@/types';
import { useMediaQuery, useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';

export const useUiStore = defineStore('ui', () => {
  const toasts = ref<Toast[]>([]);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const isCopying = ref(false);
  const isLeftOpen = useStorage(STORAGE_KEYS.UI_LEFT_OPEN, true);
  const timersMap = new Map<number, ReturnType<typeof setTimeout>>();
  const activeExportTarget = shallowRef<HTMLElement | null>(null);

  const clearActionToasts = () => {
    toasts.value = toasts.value.filter(t => !t.hasAction);
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
      const total = remainingMap.get(id) ?? 3000;
      const elapsed = Date.now() - startedAt;
      remainingMap.set(id, Math.max(0, total - elapsed));
    });
    timersMap.clear();
  };

  const resumeAllTimers = () => {
    toasts.value.forEach(toast => {
      if (toast.type !== ToastType.LOADING) {
        scheduleToastRemoval(toast.id, remainingMap.get(toast.id) ?? toast.duration ?? 3000);
      }
    });
  };

  let toastIdCounter = 0;

  const createToast = (msg: string, type: ToastType = ToastType.INFO, options: ToastOptions = {}) => {
    const id = ++toastIdCounter;
    const hasAction = Boolean(options.onAction);
    const duration = options.duration ?? 3000;

    if (hasAction) clearActionToasts();

    toasts.value.push({
      id,
      msg,
      type,
      hasAction,
      actionText: options.actionText || '确定',
      onAction: options.onAction,
      duration,
      closable: options.closable ?? true,
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
    isMobile,
    activeExportTarget,
  };
});
