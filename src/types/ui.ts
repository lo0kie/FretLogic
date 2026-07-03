export type ToastType = 'info' | 'success' | 'error' | 'loading' | 'warning';

export interface Toast {
  id: number;
  msg: string;
  type: ToastType;
  canUndo?: boolean;
}
