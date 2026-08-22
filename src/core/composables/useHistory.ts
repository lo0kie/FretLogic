/**
 * 通用撤销/重做历史（经典双栈模型）。
 *
 * - 提交新快照：把当前状态压入 undo 栈，清空 redo 栈，状态更新为新快照。
 * - 撤销：把当前状态压入 redo 栈，从 undo 栈弹出上一个状态作为结果。
 * - 重做：把当前状态压入 undo 栈，从 redo 栈弹出下一个状态作为结果。
 *
 * 调用方负责把返回的快照回填到自身状态。
 */
import type { Ref } from 'vue';
import { ref, shallowRef, readonly } from 'vue';

export interface HistoryOptions<T> {
  /** 撤销栈容量上限（默认 20） */
  capacity?: number;
  /** 自定义相等判断，用于「是否值得记录新快照」 */
  isEqual?: (a: T, b: T) => boolean;
}

export interface History<T> {
  /** 当前（最新）快照，未做任何历史操作时等于初始值 */
  current: Readonly<Ref<T>>;
  /** 是否可撤销 */
  canUndo: Readonly<Ref<boolean>>;
  /** 是否可重做 */
  canRedo: Readonly<Ref<boolean>>;
  /** 提交新快照（清空 redo 栈） */
  commit(next: T): void;
  /** 撤销：返回历史快照并应用（由调用方写回其状态），无历史时返回 null */
  undo(): T | null;
  /** 重做：返回快照，无 redo 时返回 null */
  redo(): T | null;
  /** 清空历史 */
  clear(): void;
}

export function useHistory<T>(initial: T, options: HistoryOptions<T> = {}): History<T> {
  const capacity = options.capacity ?? 20;
  const isEqual = options.isEqual ?? ((a: T, b: T) => a === b);

  const undoStack = shallowRef<T[]>([]);
  const redoStack = shallowRef<T[]>([]);
  const current = shallowRef<T>(initial);

  const canUndo = ref(false);
  const canRedo = ref(false);

  function refreshFlags() {
    canUndo.value = undoStack.value.length > 0;
    canRedo.value = redoStack.value.length > 0;
  }

  function commit(next: T) {
    if (isEqual(current.value, next)) return;
    const undoList = undoStack.value;
    undoList.push(current.value);
    if (undoList.length > capacity) undoList.splice(0, undoList.length - capacity);
    current.value = next;
    // 新提交使 redo 分支失效
    if (redoStack.value.length > 0) redoStack.value = [];
    refreshFlags();
  }

  function undo(): T | null {
    const undoList = undoStack.value;
    if (undoList.length === 0) return null;
    const prev = undoList.pop()!;
    redoStack.value.push(current.value);
    current.value = prev;
    refreshFlags();
    return prev;
  }

  function redo(): T | null {
    const redoList = redoStack.value;
    if (redoList.length === 0) return null;
    const next = redoList.pop()!;
    undoStack.value.push(current.value);
    current.value = next;
    refreshFlags();
    return next;
  }

  function clear() {
    undoStack.value = [];
    redoStack.value = [];
    refreshFlags();
  }

  return {
    current: readonly(current) as Readonly<Ref<T>>,
    canUndo: readonly(canUndo),
    canRedo: readonly(canRedo),
    commit,
    undo,
    redo,
    clear,
  };
}
