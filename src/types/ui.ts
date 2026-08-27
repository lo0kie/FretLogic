/** Toast 提示类型 */
export enum ToastType {
  INFO = 'info',
  SUCCESS = 'success',
  ERROR = 'error',
  LOADING = 'loading',
  WARNING = 'warning',
}

export interface ToastOptions {
  description?: string;
  actionText?: string;
  onAction?: () => void | Promise<void>;
  duration?: number;
  closable?: boolean;
  customClass?: string;
}

export interface Toast {
  id: number;
  msg: string;
  description?: string;
  type: ToastType;
  hasAction: boolean;
  actionText: string;
  onAction?: () => void | Promise<void>;
  duration: number;
  closable?: boolean;
  customClass?: string;
}
