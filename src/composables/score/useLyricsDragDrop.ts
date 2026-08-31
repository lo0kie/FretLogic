import { isGlobalEditable } from '@/stores/globalState';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import type { Chord, SlotKey } from '@/types';
import { onBeforeUnmount, onMounted, ref, type ComponentPublicInstance, type Ref } from 'vue';
import { useDragAutoScroll } from './lyrics-drag/useDragAutoScroll';
import { useDragGhost } from './lyrics-drag/useDragGhost';
import { useDragHighlight } from './lyrics-drag/useDragHighlight';
import { resolveDropAction } from './lyrics-drag/dropZone';

export function useLyricsDragDrop(scrollContainerRef?: Ref<HTMLElement | null>) {
  const scoreEditor = useScoreEditorStore();

  const isDragging = ref(false);
  const isSuppressingClick = ref(false);
  const draggingSlotKey = ref<string | null>(null);
  /** 当前拖拽的操作模式：swap 为换位，copy 为复制拖拽（仅决定拖拽源的视觉样式，落地动作由分区决定） */
  const dragMoveMode = ref<'swap' | 'copy'>('swap');

  const {
    ghostChordName,
    setGhostEl: setGhostElInternal,
    scheduleGhostPos,
    flushGhostPos,
    cancelGhostPos,
    setGhostChord,
  } = useDragGhost();

  const { dragOverSlotKey, dropZone, markDragSource, clearDragClasses, updateDropTarget } = useDragHighlight();

  // 落点命中节流：与 ghost 位置一样合并进 rAF，避免每帧同步执行 elementFromPoint 命中测试
  let pendingDropPos: { x: number; y: number } | null = null;
  let dropUpdateRafId = 0;
  const scheduleDropTargetUpdate = (x: number, y: number) => {
    pendingDropPos = { x, y };
    if (dropUpdateRafId) return;
    dropUpdateRafId = requestAnimationFrame(() => {
      dropUpdateRafId = 0;
      const pos = pendingDropPos;
      pendingDropPos = null;
      if (pos) updateDropTarget(pos.x, pos.y);
    });
  };
  const flushDropTargetUpdate = () => {
    if (dropUpdateRafId) {
      cancelAnimationFrame(dropUpdateRafId);
      dropUpdateRafId = 0;
    }
    const pos = pendingDropPos;
    pendingDropPos = null;
    if (pos) updateDropTarget(pos.x, pos.y);
  };
  const cancelDropTargetUpdate = () => {
    if (dropUpdateRafId) {
      cancelAnimationFrame(dropUpdateRafId);
      dropUpdateRafId = 0;
    }
    pendingDropPos = null;
  };

  const { checkAutoScroll, stopAutoScroll, isScrolling } = useDragAutoScroll();

  let wasDraggingInSession = false;
  let startPointer = { x: 0, y: 0, pointerId: -1, pointerType: '' };
  let currentPointerPos = { x: 0, y: 0 };
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let activeSourceKey: string | null = null;
  let activeChord: Chord | null = null;

  const DRAG_THRESHOLD = 5;
  const LONG_PRESS_DELAY = 280;

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
    // 拖拽中右键：退出本次拖拽（先取消，再按拖拽会话屏蔽菜单）
    if (isDragging.value) {
      handleGlobalPointerCancel(new PointerEvent('pointercancel'));
    }
    if (isDragging.value || wasDraggingInSession) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  };

  /** 触摸长按等待期的按压反馈：在源槽位上加 is-press-arming 类（渐进提示即将进入拖拽） */
  const setPressArming = (arming: boolean) => {
    if (!activeSourceKey) return;
    document
      .querySelectorAll(`[data-slot-key="${CSS.escape(activeSourceKey)}"]`)
      .forEach(el => el.classList.toggle('is-press-arming', arming));
  };

  /** 拖拽/长按结束的统一收尾：重置状态与 DOM 副作用（pointerup / pointercancel / blur 共用） */
  const resetDragState = () => {
    setPressArming(false);
    isDragging.value = false;
    draggingSlotKey.value = null;
    activeSourceKey = null;
    activeChord = null;
    startPointer = { x: 0, y: 0, pointerId: -1, pointerType: '' };
    clearDragClasses();
    document.body.classList.remove('is-global-dragging');
    window.removeEventListener('contextmenu', preventContextMenu, true);
  };

  const startDrag = (clientX: number, clientY: number) => {
    if (!activeSourceKey || !activeChord) return;
    setPressArming(false);
    isDragging.value = true;
    wasDraggingInSession = true;
    draggingSlotKey.value = activeSourceKey;
    // 换位模式：源和弦虚化提示将被移走；复制模式：源和弦保留原位，仅以聚焦描边标记拖拽起点。
    // 两种模式的拖拽源在拖动过程中都保持聚焦描边样式
    if (dragMoveMode.value === 'swap') {
      markDragSource(activeSourceKey, 'is-dragging-source');
    } else {
      markDragSource(activeSourceKey, 'is-dragging-copy-source');
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
          setPressArming(false);
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
    scheduleDropTargetUpdate(e.clientX, e.clientY);

    if (!isScrolling()) {
      checkAutoScroll(scrollContainerRef?.value, currentPointerPos, () => {
        scheduleDropTargetUpdate(currentPointerPos.x, currentPointerPos.y);
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
      flushDropTargetUpdate();

      // 分区落地：松手所在分区直接决定动作（交换/替换/复制/移位），无有效目标则取消
      if (
        isDragging.value &&
        draggingSlotKey.value &&
        dragOverSlotKey.value &&
        dropZone.value &&
        draggingSlotKey.value !== dragOverSlotKey.value &&
        scoreEditor.activeSong
      ) {
        const targetKey = dragOverSlotKey.value;
        const occupied = !!scoreEditor.activeSong.chordMap.get(targetKey as SlotKey);
        // sourceKey 源自 data-slot-key，store 动作内会再做 isSlotKey 前缀校验
        switch (resolveDropAction(dropZone.value, occupied)) {
          case 'swap':
            scoreEditor.swapSlotChords(draggingSlotKey.value, targetKey);
            break;
          case 'copy':
            scoreEditor.copySlotChord(draggingSlotKey.value as SlotKey, targetKey as SlotKey);
            break;
          case 'replace':
          case 'move':
            scoreEditor.moveSlotChord(draggingSlotKey.value as SlotKey, targetKey as SlotKey);
            break;
        }
      }
    } catch {
      /* 落地失败则忽略（可手动撤销兜底） */
    } finally {
      if (hadDrag) {
        triggerClickSuppression();
      }
      cancelDropTargetUpdate();
      resetDragState();
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
      cancelDropTargetUpdate();
    } catch {
      /* 取消失败则忽略 */
    } finally {
      if (hadDrag) {
        triggerClickSuppression();
      }
      resetDragState();
    }
  };

  const handleWindowBlur = () => {
    if (isDragging.value || activeSourceKey !== null) {
      handleGlobalPointerCancel(new PointerEvent('pointercancel'));
    }
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
      // 长按等待期给出按压反馈（is-press-arming），提示即将进入拖拽
      setPressArming(true);
      longPressTimer = setTimeout(() => {
        setPressArming(false);
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
    cancelDropTargetUpdate();
    setPressArming(false);
    clearDragClasses();
    document.body.classList.remove('is-global-dragging');
  });

  return {
    isDragging,
    isSuppressingClick,
    draggingSlotKey,
    dragOverSlotKey,
    dropZone,
    dragMoveMode,
    ghostChordName,
    setGhostEl,
    handlePointerDown,
  };
}
