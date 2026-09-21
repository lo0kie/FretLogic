/**
 * UI store：全局 Message 队列（含定时销毁）、侧栏开合状态与复制中标记等界面瞬时状态。
 */
import { ref } from 'vue';

import { defineStore } from 'pinia';

import { useStorage } from '@/platform/composables/useStorage';
import { MessageType } from '@/platform/types';
import { MESSAGE_DEFAULT_DURATION_MS, STORAGE_KEYS } from '@/platform/utils/constants';

import type { Message, MessageOptions, Notice, NoticeOptions, SyncProviderKind } from '@/platform/types';

/** 通知中心队列最大保留条数：超出时丢弃最旧通知，防无界增长 */
export const NOTICE_MAX_COUNT = 50;

export const useUiStore = defineStore('ui', () => {
  const messages = ref<Message[]>([]);
  /** 通知中心持久消息队列（区别于自动消失的 message）：可查/可清/已读，不自动销毁 */
  const notices = ref<Notice[]>([]);
  let noticeIdCounter = 0;
  const isCopying = ref(false);
  const isLeftOpen = useStorage(STORAGE_KEYS.UI_LEFT_OPEN, true);
  /** 同步弹窗上次选中的提供商（UI 瞬时偏好，跨会话保留） */
  const syncModalProvider = useStorage<SyncProviderKind>(STORAGE_KEYS.SYNC_MODAL_PROVIDER, 'gitee');
  const timersMap = new Map<number, ReturnType<typeof setTimeout>>();

  /** 清除所有带操作按钮（onAction）的 Message，避免旧的行动入口叠加显示。 */
  const clearActionMessages = () => {
    messages.value = messages.value.filter(m => !m.onAction);
  };

  /** 按 id 移除指定 Message，并清理其对应的自动销毁定时器。 */
  const removeMessage = (id: number) => {
    messages.value = messages.value.filter(m => m.id !== id);
    if (timersMap.has(id)) {
      clearTimeout(timersMap.get(id));
      timersMap.delete(id);
    }
  };

  const remainingMap = new Map<number, number>();
  const startedAtMap = new Map<number, number>();

  /** 为 Message 安排延时销毁定时器，并记录起始时间与剩余时长以支持暂停/恢复。 */
  const scheduleMessageRemoval = (id: number, delay: number) => {
    if (timersMap.has(id)) clearTimeout(timersMap.get(id));
    startedAtMap.set(id, Date.now());
    remainingMap.set(id, delay);
    const timer = setTimeout(() => removeMessage(id), delay);
    timersMap.set(id, timer);
  };

  /** 暂停所有 Message 的销毁倒计时（如弹窗打开时），按已流逝时间折算剩余时长。 */
  const pauseAllTimers = () => {
    timersMap.forEach((timer, id) => {
      clearTimeout(timer);
      const startedAt = startedAtMap.get(id) ?? Date.now();
      const total = remainingMap.get(id) ?? MESSAGE_DEFAULT_DURATION_MS;
      const elapsed = Date.now() - startedAt;
      remainingMap.set(id, Math.max(0, total - elapsed));
    });
    timersMap.clear();
  };

  /** 是否常驻型 Message（不自动销毁）：LOADING（转圈加载）与 NEUTRAL（中性引导），
   *  二者都需在 create 时不排定自动销毁、resume 时不重新调度 */
  const isPersistentMessage = (type: MessageType): boolean =>
    type === MessageType.LOADING || type === MessageType.NEUTRAL;

  /** 恢复所有 Message 的销毁倒计时（常驻型 Message 除外）。 */
  const resumeAllTimers = () => {
    messages.value.forEach(message => {
      if (!isPersistentMessage(message.type))
        scheduleMessageRemoval(
          message.id,
          remainingMap.get(message.id) ?? message.duration ?? MESSAGE_DEFAULT_DURATION_MS
        );
    });
  };

  let messageIdCounter = 0;

  /** 创建 Message 入队：常驻型（LOADING/NEUTRAL）不自动销毁，其余按时长自动销毁；带操作按钮的会先清掉同类。 */
  const createMessage = (msg: string, type: MessageType = MessageType.INFO, options: MessageOptions = {}) => {
    const id = ++messageIdCounter;
    const duration = options.duration ?? MESSAGE_DEFAULT_DURATION_MS;

    if (options.onAction) clearActionMessages();

    messages.value.push({
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
      spinner: options.spinner ?? type === MessageType.LOADING,
    });

    if (!isPersistentMessage(type)) scheduleMessageRemoval(id, duration);

    return id;
  };

  const message = {
    info: (msg: string, options?: MessageOptions) => createMessage(msg, MessageType.INFO, options),
    success: (msg: string, options?: MessageOptions) => createMessage(msg, MessageType.SUCCESS, options),
    error: (msg: string, options?: MessageOptions) => createMessage(msg, MessageType.ERROR, options),
    warning: (msg: string, options?: MessageOptions) => createMessage(msg, MessageType.WARNING, options),
    loading: (msg: string, options?: MessageOptions) => createMessage(msg, MessageType.LOADING, options),
    /** 常驻中性提示：不自动销毁、无转圈（交互引导等「过程进行中但非后台任务」的场景） */
    neutral: (msg: string, options?: MessageOptions) => createMessage(msg, MessageType.NEUTRAL, options),
    clear: () => {
      messages.value.forEach(m => removeMessage(m.id));
      messages.value = [];
    },
    promise: async <T>(
      promise: Promise<T>,
      // 形参改名 texts：原名 messages 会遮蔽 store 级 messages ref（同名隐患），此处只是三阶段的文案
      texts: {
        loading: string;
        success: string | ((data: T) => string);
        error: string | ((err: unknown) => string);
      },
      options?: MessageOptions
    ): Promise<T> => {
      const id = createMessage(texts.loading, MessageType.LOADING, options);
      try {
        const res = await promise;
        removeMessage(id);
        const successMsg = typeof texts.success === 'function' ? texts.success(res) : texts.success;
        createMessage(successMsg, MessageType.SUCCESS, options);
        return res;
      } catch (err) {
        removeMessage(id);
        const errorMsg = typeof texts.error === 'function' ? texts.error(err) : texts.error;
        createMessage(errorMsg, MessageType.ERROR, options);
        throw err;
      }
    },
  };

  /** 推送持久通知入队（最新在前）；超出上限剔除最旧 */
  const addNotice = (options: NoticeOptions): number => {
    const id = ++noticeIdCounter;
    notices.value.unshift({
      id,
      type: options.type ?? 'info',
      title: options.title,
      message: options.message,
      ts: Date.now(),
      read: false,
      ...(options.actionText !== undefined ? { actionText: options.actionText } : {}),
      ...(options.onAction !== undefined ? { onAction: options.onAction } : {}),
    });
    if (notices.value.length > NOTICE_MAX_COUNT) notices.value.pop();
    return id;
  };

  /** 按 id 移除单条通知 */
  const dismissNotice = (id: number) => {
    notices.value = notices.value.filter(n => n.id !== id);
  };

  /** 清空全部通知 */
  const dismissAllNotices = () => {
    notices.value = [];
  };

  /** 标为已读（撤销“未读点”） */
  const markNoticeRead = (id: number) => {
    const found = notices.value.find(n => n.id === id);
    if (found) found.read = true;
  };

  /** 全部已读 */
  const markAllNoticesRead = () => {
    notices.value.forEach(n => {
      n.read = true;
    });
  };

  /** 通知等级快捷入口（与 message 风格一致，但持久不自动消失） */
  const notice = {
    info: (options: Omit<NoticeOptions, 'type'>) => addNotice({ ...options, type: 'info' }),
    success: (options: Omit<NoticeOptions, 'type'>) => addNotice({ ...options, type: 'success' }),
    warning: (options: Omit<NoticeOptions, 'type'>) => addNotice({ ...options, type: 'warning' }),
    error: (options: Omit<NoticeOptions, 'type'>) => addNotice({ ...options, type: 'error' }),
  };

  return {
    clearActionMessages,
    isLeftOpen,
    syncModalProvider,
    isCopying,
    messages,
    message,
    removeMessage,
    pauseAllTimers,
    resumeAllTimers,
    notices,
    notice,
    addNotice,
    dismissNotice,
    dismissAllNotices,
    markNoticeRead,
    markAllNoticesRead,
  };
});
