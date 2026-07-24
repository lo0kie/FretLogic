export type ToastType = 'info' | 'success' | 'error' | 'loading' | 'warning';

export interface ToastOptions {
  actionText?: string;
  onAction?: () => void;
  duration?: number;
}

export interface Toast {
  id: number;
  msg: string;
  type: ToastType;
  hasAction: boolean;
  actionText: string;
  onAction?: () => void;
  duration: number;
}
