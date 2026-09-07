/**
 * UI store：全局 Toast 队列（含定时销毁）、侧栏开合状态与复制中标记等界面瞬时状态。
 */
import { ref } from 'vue';

import { useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';

import { ToastType } from '@/platform/types';
import { STORAGE_KEYS, TOAST_DEFAULT_DURATION_MS } from '@/platform/utils/constants';

import type { SyncProviderKind, Toast, ToastOptions } from '@/platform/types';

export const useUiStore = defineStore('ui', () => {
  const toasts = ref<Toast[]>([]);
  const isCopying = ref(false);
  const isLeftOpen = useStorage(STORAGE_KEYS.UI_LEFT_OPEN, true);
  /** 同步弹窗上次选中的提供商（UI 瞬时偏好，跨会话保留） */
  const syncModalProvider = useStorage<SyncProviderKind>(STORAGE_KEYS.SYNC_MODAL_PROVIDER, 'gitee');
  const timersMap = new Map<number, ReturnType<typeof setTimeout>>();

  /** 清除所有带操作按钮（onAction）的 Toast，避免旧的行动入口叠加显示。 */
  const clearActionToasts = () => {
    toasts.value = toasts.value.filter(t => !t.onAction);
  };

  /** 按 id 移除指定 Toast，并清理其对应的自动销毁定时器。 */
  const removeToast = (id: number) => {
    toasts.value = toasts.value.filter(t => t.id !== id);
    if (timersMap.has(id)) {
      clearTimeout(timersMap.get(id));
      timersMap.delete(id);
    }
  };

  const remainingMap = new Map<number, number>();
  const startedAtMap = new Map<number, number>();

  /** 为 Toast 安排延时销毁定时器，并记录起始时间与剩余时长以支持暂停/恢复。 */
  const scheduleToastRemoval = (id: number, delay: number) => {
    if (timersMap.has(id)) clearTimeout(timersMap.get(id));
    startedAtMap.set(id, Date.now());
    remainingMap.set(id, delay);
    const timer = setTimeout(() => removeToast(id), delay);
    timersMap.set(id, timer);
  };

  /** 暂停所有 Toast 的销毁倒计时（如弹窗打开时），按已流逝时间折算剩余时长。 */
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

  /** 是否常驻型 Toast（不自动销毁）：LOADING（转圈加载）与 NEUTRAL（中性引导），
   *  二者都需在 create 时不排定自动销毁、resume 时不重新调度 */
  const isPersistentToast = (type: ToastType): boolean => type === ToastType.LOADING || type === ToastType.NEUTRAL;

  /** 恢复所有 Toast 的销毁倒计时（常驻型 Toast 除外）。 */
  const resumeAllTimers = () => {
    toasts.value.forEach(toast => {
      if (!isPersistentToast(toast.type)) {
        scheduleToastRemoval(toast.id, remainingMap.get(toast.id) ?? toast.duration ?? TOAST_DEFAULT_DURATION_MS);
      }
    });
  };

  let toastIdCounter = 0;

  /** 创建 Toast 入队：常驻型（LOADING/NEUTRAL）不自动销毁，其余按时长自动销毁；带操作按钮的会先清掉同类。 */
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
      // LOADING 型默认转圈，spinner:false 时退化为中性静态图标；NEUTRAL 型恒无转圈
      spinner: options.spinner ?? type === ToastType.LOADING,
    });

    if (!isPersistentToast(type)) {
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
    /** 常驻中性提示：不自动销毁、无转圈（交互引导等「过程进行中但非后台任务」的场景） */
    neutral: (msg: string, options?: ToastOptions) => createToast(msg, ToastType.NEUTRAL, options),
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
    syncModalProvider,
    isCopying,
    toasts,
    toast,
    removeToast,
    pauseAllTimers,
    resumeAllTimers,
  };
});
