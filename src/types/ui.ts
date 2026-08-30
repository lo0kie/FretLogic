/** Toast 提示类型 */
export enum ToastType {
  INFO = 'info',
  SUCCESS = 'success',
  ERROR = 'error',
  LOADING = 'loading',
  WARNING = 'warning',
}

export interface Toast {
  id: number;
  msg: string;
  type: ToastType;
  description?: string;
  /** 操作按钮回调；存在即渲染按钮（取代原先冗余的 hasAction 布尔标记） */
  onAction?: () => void | Promise<void>;
  /** 操作按钮文案；缺省由展示层兜底 */
  actionText?: string;
  duration: number;
  closable?: boolean;
  customClass?: string;
}

/** 创建 toast 的入参：id / msg / type 由 store 生成，duration 可缺省 */
export type ToastOptions = Omit<Toast, 'id' | 'msg' | 'type' | 'duration'> & { duration?: number };
