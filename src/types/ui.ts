export type ModalActionType = 'createGroup' | 'renameGroup' | 'deleteGroup' | 'moveChord' | '';

export type ToastType = 'info' | 'success' | 'error' | 'loading';

export interface Toast {
  id: number;
  msg: string;
  type: ToastType;
  canUndo?: boolean;
}
