/**
 * 通知中心类型：与临时 message/toast 区分——通知是**持久、可查、可清**的消息，
 * 由通知中心组件集中展示，不自动消失。
 */

/** 通知等级 */
export type NoticeType = 'info' | 'success' | 'warning' | 'error';

/** 通知中心单条消息 */
export interface Notice {
  id: number;
  type: NoticeType;
  title: string;
  message?: string;
  /** 产生时间戳（毫秒） */
  ts: number;
  /** 是否已读 */
  read: boolean;
  /** 操作按钮文案；存在即渲染按钮 */
  actionText?: string;
  /** 操作回调（成功后自动移除该通知，失败保留便于重试） */
  onAction?: () => void | Promise<void>;
}

/** 推送通知的入参：id / ts / read 由 store 生成，type 可缺省 */
export type NoticeOptions = Omit<Notice, 'id' | 'ts' | 'read' | 'type'> & { type?: NoticeType };
