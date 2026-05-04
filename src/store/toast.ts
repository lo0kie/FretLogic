import type { ToastItem } from '@/types/toast';
import { defineStore } from 'pinia';
import { ref } from 'vue';

const useToastStore = defineStore('toast', () => {
  const toasts = ref<ToastItem[]>([]);
  let counter = 0;

  const addToast = (item: Omit<ToastItem, 'id'>) => {
    const id = ++counter;
    const toast = { ...item, id };
    toasts.value.push(toast);

    // 自动移除
    setTimeout(() => {
      removeToast(id);
    }, item.duration || 3000);
  };

  const removeToast = (id: number) => {
    toasts.value = toasts.value.filter(t => t.id !== id);
  };

  return { toasts, addToast, removeToast };
});

export default useToastStore;
