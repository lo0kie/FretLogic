/**
 * @Author likan
 * @Date 2026-05-04 11:09:30
 * @Filepath guitar-chord-lab\src\types\toast.ts
 */

export interface ToastItem {
  id: number;
  msg: string;
  canUndo?: boolean;
  targetId?: string | number;
  duration?: number;
}
