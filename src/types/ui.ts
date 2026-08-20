/** Toast 提示类型 */
export enum ToastType {
  INFO = 'info',
  SUCCESS = 'success',
  ERROR = 'error',
  LOADING = 'loading',
  WARNING = 'warning',
}

export interface ToastOptions {
  actionText?: string;
  onAction?: () => void;
  duration?: number;
  closable?: boolean;
}

export interface Toast {
  id: number;
  msg: string;
  type: ToastType;
  hasAction: boolean;
  actionText: string;
  onAction?: () => void;
  duration: number;
  closable?: boolean;
}
