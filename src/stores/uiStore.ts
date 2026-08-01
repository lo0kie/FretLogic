import type { Toast, ToastOptions, ToastType } from '@/types';
import { useMediaQuery, useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useUiStore = defineStore('ui', () => {
  const toasts = ref<Toast[]>([]);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const isCopying = ref(false);
  const isLeftOpen = useStorage('CHORD_LAB_UI_LEFT_OPEN', true);
  const isPreviewEnabled = useStorage('CHORD_LAB_UI_PREVIEW_ENABLED', false);

  const timersMap = new Map<number, ReturnType<typeof setTimeout>>();

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

  const scheduleToastRemoval = (id: number, delay: number) => {
    if (timersMap.has(id)) clearTimeout(timersMap.get(id));
    const timer = setTimeout(() => {
      removeToast(id);
    }, delay);
    timersMap.set(id, timer);
  };

  const pauseAllTimers = () => {
    timersMap.forEach(timer => clearTimeout(timer));
    timersMap.clear();
  };

  const resumeAllTimers = () => {
    toasts.value.forEach(toast => {
      if (toast.type !== 'loading') {
        scheduleToastRemoval(toast.id, toast.duration || 3000);
      }
    });
  };

  const createToast = (msg: string, type: ToastType = 'info', options: ToastOptions = {}) => {
    const id = performance.now();
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
    });

    if (type !== 'loading') {
      scheduleToastRemoval(id, duration);
    }
    return id;
  };

  const toast = {
    info: (msg: string, options?: ToastOptions) => createToast(msg, 'info', options),
    success: (msg: string, options?: ToastOptions) => createToast(msg, 'success', options),
    error: (msg: string, options?: ToastOptions) => createToast(msg, 'error', options),
    warning: (msg: string, options?: ToastOptions) => createToast(msg, 'warning', options),
    loading: (msg: string, options?: ToastOptions) => createToast(msg, 'loading', options),
  };

  const scoreExportRequestToken = ref(0);
  const requestScoreExport = () => {
    scoreExportRequestToken.value++;
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
    isPreviewEnabled,
    isMobile,
    requestScoreExport,
    scoreExportRequestToken,
  };
});
