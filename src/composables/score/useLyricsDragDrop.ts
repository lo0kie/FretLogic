import { isGlobalEditable } from '@/stores/globalState';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import type { Chord, SlotKey } from '@/types';
import { onBeforeUnmount, onMounted, ref, type ComponentPublicInstance, type Ref } from 'vue';
import { useDragAutoScroll } from './lyrics-drag/useDragAutoScroll';
import { useDragGhost } from './lyrics-drag/useDragGhost';
import { useDragHighlight } from './lyrics-drag/useDragHighlight';

export function useLyricsDragDrop(scrollContainerRef?: Ref<HTMLElement | null>) {
  const scoreEditor = useScoreEditorStore();

  const isDragging = ref(false);
  const isSuppressingClick = ref(false);
  const draggingSlotKey = ref<string | null>(null);
  /** 当前拖拽的操作模式：swap 为换位，copy 为复制拖拽（落点后弹窗询问复制/移位） */
  const dragMoveMode = ref<'swap' | 'copy'>('swap');
  /** 复制拖拽的待决落点：拖拽结束后由弹窗选择「复制」或「移位」再落地 */
  const pendingCopyDrop = ref<{ sourceKey: SlotKey; targetKey: string } | null>(null);

  const {
    ghostChordName,
    setGhostEl: setGhostElInternal,
    scheduleGhostPos,
    flushGhostPos,
    cancelGhostPos,
    setGhostChord,
  } = useDragGhost();

  const { dragOverSlotKey, markDragSource, clearDragClasses, updateDropTarget } = useDragHighlight();

  const { checkAutoScroll, stopAutoScroll, isScrolling } = useDragAutoScroll();

  let wasDraggingInSession = false;
  let startPointer = { x: 0, y: 0, pointerId: -1, pointerType: '' };
  let currentPointerPos = { x: 0, y: 0 };
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let activeSourceKey: string | null = null;
  let activeChord: Chord | null = null;

  const DRAG_THRESHOLD = 5;
  const LONG_PRESS_DELAY = 180;

  const setGhostEl = (el: Element | ComponentPublicInstance | null) => {
    setGhostElInternal(el, currentPointerPos);
  };

  const triggerClickSuppression = () => {
    isSuppressingClick.value = true;
    setTimeout(() => {
      isSuppressingClick.value = false;
    }, 120);
  };

  const preventContextMenu = (e: MouseEvent) => {
    if (isDragging.value || wasDraggingInSession) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  };

  const startDrag = (clientX: number, clientY: number) => {
    if (!activeSourceKey || !activeChord) return;
    isDragging.value = true;
    wasDraggingInSession = true;
    draggingSlotKey.value = activeSourceKey;
    // 换位模式下虚化源和弦以提示将被移走；复制模式源和弦保留，无需虚化
    if (dragMoveMode.value === 'swap') {
      markDragSource(activeSourceKey);
    }
    setGhostChord(activeChord);
    document.body.classList.add('is-global-dragging');

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(20);
      } catch {
        /* 触觉反馈不可用则忽略 */
      }
    }

    scheduleGhostPos(clientX, clientY);
    updateDropTarget(clientX, clientY);
  };

  const handleGlobalPointerMove = (e: PointerEvent) => {
    if (activeSourceKey === null && !isDragging.value) return;
    if (
      startPointer.pointerId !== -1 &&
      startPointer.pointerId !== e.pointerId &&
      e.pointerType !== 'mouse' &&
      !isDragging.value
    ) {
      return;
    }

    currentPointerPos = { x: e.clientX, y: e.clientY };

    if (!isDragging.value) {
      const dx = e.clientX - startPointer.x;
      const dy = e.clientY - startPointer.y;
      const distance = Math.hypot(dx, dy);

      if (startPointer.pointerType === 'touch') {
        if (distance > 10 && longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      } else {
        if (distance >= DRAG_THRESHOLD) {
          startDrag(e.clientX, e.clientY);
        }
      }
      return;
    }

    e.preventDefault();
    scheduleGhostPos(e.clientX, e.clientY);
    updateDropTarget(e.clientX, e.clientY);

    if (!isScrolling()) {
      checkAutoScroll(scrollContainerRef?.value, currentPointerPos, () => {
        updateDropTarget(currentPointerPos.x, currentPointerPos.y);
      });
    }
  };

  const handleGlobalPointerUp = (e: PointerEvent) => {
    if (activeSourceKey === null && !isDragging.value) return;
    if (
      startPointer.pointerId !== -1 &&
      startPointer.pointerId !== e.pointerId &&
      e.pointerType !== 'mouse' &&
      !isDragging.value
    ) {
      return;
    }

    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    const hadDrag = isDragging.value || wasDraggingInSession;

    try {
      stopAutoScroll();
      flushGhostPos();
      updateDropTarget(e.clientX, e.clientY);

      if (
        isDragging.value &&
        draggingSlotKey.value &&
        dragOverSlotKey.value &&
        draggingSlotKey.value !== dragOverSlotKey.value &&
        scoreEditor.activeSong
      ) {
        if (dragMoveMode.value === 'copy') {
          // 复制拖拽不立即落地：记录待决落点，由弹窗选择「复制」或「移位」。
          // sourceKey 源自 data-slot-key，store 动作内会再做 isSlotKey 前缀校验
          pendingCopyDrop.value = { sourceKey: draggingSlotKey.value as SlotKey, targetKey: dragOverSlotKey.value };
        } else {
          scoreEditor.swapSlotChords(draggingSlotKey.value, dragOverSlotKey.value);
        }
      }
    } catch {
      /* 交换失败则忽略 */
    } finally {
      if (hadDrag) {
        triggerClickSuppression();
      }
      isDragging.value = false;
      draggingSlotKey.value = null;
      activeSourceKey = null;
      activeChord = null;
      startPointer = { x: 0, y: 0, pointerId: -1, pointerType: '' };
      clearDragClasses();
      document.body.classList.remove('is-global-dragging');
      window.removeEventListener('contextmenu', preventContextMenu, true);
    }
  };

  const handleGlobalPointerCancel = (e: PointerEvent) => {
    if (activeSourceKey === null && !isDragging.value) return;
    if (
      startPointer.pointerId !== -1 &&
      startPointer.pointerId !== e.pointerId &&
      e.pointerType !== 'mouse' &&
      !isDragging.value
    ) {
      return;
    }

    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    const hadDrag = isDragging.value || wasDraggingInSession;

    try {
      stopAutoScroll();
      cancelGhostPos();
    } catch {
      /* 取消失败则忽略 */
    } finally {
      if (hadDrag) {
        triggerClickSuppression();
      }
      isDragging.value = false;
      draggingSlotKey.value = null;
      activeSourceKey = null;
      activeChord = null;
      startPointer = { x: 0, y: 0, pointerId: -1, pointerType: '' };
      clearDragClasses();
      document.body.classList.remove('is-global-dragging');
      window.removeEventListener('contextmenu', preventContextMenu, true);
    }
  };

  const handleWindowBlur = () => {
    if (isDragging.value || activeSourceKey !== null) {
      handleGlobalPointerCancel(new PointerEvent('pointercancel'));
    }
  };

  /** 弹窗选择「复制」：源槽位保留，目标槽位插入副本 */
  const resolveCopyDropAsCopy = () => {
    const pending = pendingCopyDrop.value;
    if (!pending) return;
    scoreEditor.copySlotChord(pending.sourceKey, pending.targetKey);
    pendingCopyDrop.value = null;
  };

  /** 弹窗选择「移位」：源槽位和弦移动到目标槽位（单条撤销记录） */
  const resolveCopyDropAsMove = () => {
    const pending = pendingCopyDrop.value;
    if (!pending) return;
    scoreEditor.moveSlotChord(pending.sourceKey, pending.targetKey);
    pendingCopyDrop.value = null;
  };

  /** 取消待决落点（弹窗关闭） */
  const cancelCopyDrop = () => {
    pendingCopyDrop.value = null;
  };

  const handlePointerDown = (e: PointerEvent, slotKey: string, chord: Chord, mode: 'swap' | 'copy' = 'swap') => {
    if (!isGlobalEditable.value) return;
    if (activeSourceKey !== null) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const target = e.target as HTMLElement;
    if (target.closest('.remove-chord-btn')) return;

    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    wasDraggingInSession = false;
    dragMoveMode.value = mode;
    startPointer = {
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
    };
    currentPointerPos = { x: e.clientX, y: e.clientY };
    activeSourceKey = slotKey;
    activeChord = chord;

    window.getSelection()?.removeAllRanges();
    window.addEventListener('contextmenu', preventContextMenu, true);

    if (e.pointerType === 'touch') {
      longPressTimer = setTimeout(() => {
        startDrag(currentPointerPos.x, currentPointerPos.y);
        longPressTimer = null;
      }, LONG_PRESS_DELAY);
    }
  };

  onMounted(() => {
    window.addEventListener('pointermove', handleGlobalPointerMove, { passive: false });
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerCancel);
    window.addEventListener('blur', handleWindowBlur);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('pointermove', handleGlobalPointerMove);
    window.removeEventListener('pointerup', handleGlobalPointerUp);
    window.removeEventListener('pointercancel', handleGlobalPointerCancel);
    window.removeEventListener('blur', handleWindowBlur);
    window.removeEventListener('contextmenu', preventContextMenu, true);
    if (longPressTimer) clearTimeout(longPressTimer);
    stopAutoScroll();
    cancelGhostPos();
    clearDragClasses();
    document.body.classList.remove('is-global-dragging');
  });

  return {
    isDragging,
    isSuppressingClick,
    draggingSlotKey,
    dragOverSlotKey,
    dragMoveMode,
    pendingCopyDrop,
    resolveCopyDropAsCopy,
    resolveCopyDropAsMove,
    cancelCopyDrop,
    ghostChordName,
    setGhostEl,
    handlePointerDown,
  };
}
