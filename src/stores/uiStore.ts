import type { Toast, ToastType } from '@/types';
import { useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useUiStore = defineStore('ui', () => {
  const toasts = ref<Toast[]>([]);
  const isCopying = ref(false);
  const isLeftOpen = useStorage('CHORD_LAB_UI_LEFT_OPEN', true);
  const isRightOpen = useStorage('CHORD_LAB_UI_RIGHT_OPEN', true);
  const isPreviewEnabled = useStorage('CHORD_LAB_UI_PREVIEW_ENABLED', false);

  const clearUndoToasts = () => {
    toasts.value = toasts.value.filter(t => !t.canUndo);
  };

  const showToast = (msg: string, canUndo = false, type: ToastType = 'info') => {
    const id = performance.now();
    if (canUndo) clearUndoToasts();
    toasts.value.push({ id, msg, type, canUndo });
    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== id);
    }, 3000);
  };

  const promiseToast = async <T>(
    promise: Promise<T>,
    messages: { loading: string; success: string; error: string }
  ): Promise<T> => {
    const id = performance.now();
    toasts.value.push({ id, msg: messages.loading, type: 'loading' });

    try {
      const res = await promise;
      const target = toasts.value.find(t => t.id === id);
      if (target) {
        target.msg = messages.success;
        target.type = 'success';
      }
      setTimeout(() => {
        toasts.value = toasts.value.filter(x => x.id !== id);
      }, 3000);
      return res;
    } catch (err) {
      const target = toasts.value.find(t => t.id === id);
      if (target) {
        target.msg = messages.error;
        target.type = 'error';
      }
      setTimeout(() => {
        toasts.value = toasts.value.filter(x => x.id !== id);
      }, 3500);
      throw err;
    }
  };

  return {
    clearUndoToasts,
    isLeftOpen,
    isRightOpen,
    isCopying,
    toasts,
    showToast,
    promiseToast,
    isPreviewEnabled,
  };
});
