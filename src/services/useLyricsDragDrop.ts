import { isGlobalEditable } from '@/stores/globalState';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import type { Chord } from '@/types';
import { onBeforeUnmount, ref, type ComponentPublicInstance, type Ref } from 'vue';

export function useLyricsDragDrop(scrollContainerRef?: Ref<HTMLElement | null>) {
  const scoreEditor = useScoreEditorStore();
  const draggingSlotKey = ref<string | null>(null);
  const dragOverSlotKey = ref<string | null>(null);
  const isDragging = ref(false);
  const ghostChordName = ref('');
  let wasDraggingInSession = false;

  let startPointer = { x: 0, y: 0, pointerId: -1, pointerType: '' };
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let activeSourceKey: string | null = null;
  let activeChord: Chord | null = null;
  let autoScrollRafId: number | null = null;
  let currentPointerPos = { x: 0, y: 0 };
  let ghostEl: HTMLElement | null = null;
  let dragUpdateRafId = 0;
  let pendingDragPos: { x: number; y: number } | null = null;

  const DRAG_THRESHOLD = 5;
  const LONG_PRESS_DELAY = 180;
  const SCROLL_THRESHOLD = 50;
  const MAX_SCROLL_SPEED = 14;

  const suppressNextClick = () => {
    const preventClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      window.removeEventListener('click', preventClick, true);
    };
    window.addEventListener('click', preventClick, true);
    setTimeout(() => {
      window.removeEventListener('click', preventClick, true);
    }, 300);
  };

  const preventContextMenu = (e: MouseEvent) => {
    if (isDragging.value || wasDraggingInSession) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  };

  const stopAutoScroll = () => {
    if (autoScrollRafId !== null) {
      cancelAnimationFrame(autoScrollRafId);
      autoScrollRafId = null;
    }
  };

  const checkAutoScroll = () => {
    const container = scrollContainerRef?.value;
    if (!container || !isDragging.value) {
      stopAutoScroll();
      return;
    }

    const rect = container.getBoundingClientRect();
    const { y, x } = currentPointerPos;

    let scrollDeltaY = 0;
    let scrollDeltaX = 0;

    if (y < rect.top + SCROLL_THRESHOLD && y > rect.top - 20) {
      const intensity = (rect.top + SCROLL_THRESHOLD - y) / SCROLL_THRESHOLD;
      scrollDeltaY = -Math.min(MAX_SCROLL_SPEED, Math.max(2, intensity * MAX_SCROLL_SPEED));
    } else if (y > rect.bottom - SCROLL_THRESHOLD && y < rect.bottom + 20) {
      const intensity = (y - (rect.bottom - SCROLL_THRESHOLD)) / SCROLL_THRESHOLD;
      scrollDeltaY = Math.min(MAX_SCROLL_SPEED, Math.max(2, intensity * MAX_SCROLL_SPEED));
    }

    if (x < rect.left + SCROLL_THRESHOLD && x > rect.left - 20) {
      const intensity = (rect.left + SCROLL_THRESHOLD - x) / SCROLL_THRESHOLD;
      scrollDeltaX = -Math.min(MAX_SCROLL_SPEED, Math.max(2, intensity * MAX_SCROLL_SPEED));
    } else if (x > rect.right - SCROLL_THRESHOLD && x < rect.right + 20) {
      const intensity = (x - (rect.right - SCROLL_THRESHOLD)) / SCROLL_THRESHOLD;
      scrollDeltaX = Math.min(MAX_SCROLL_SPEED, Math.max(2, intensity * MAX_SCROLL_SPEED));
    }

    if (scrollDeltaY !== 0 || scrollDeltaX !== 0) {
      container.scrollTop += scrollDeltaY;
      container.scrollLeft += scrollDeltaX;
      autoScrollRafId = requestAnimationFrame(checkAutoScroll);
    } else {
      stopAutoScroll();
    }
  };

  const updateDropTarget = (clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) {
      dragOverSlotKey.value = null;
      applyDropHighlight(null);
      return;
    }
    const slotEl = el.closest('[data-slot-key]');
    if (slotEl instanceof HTMLElement) {
      const key = slotEl.dataset.slotKey;
      dragOverSlotKey.value = key ?? null;
      applyDropHighlight(dragOverSlotKey.value);
    } else {
      dragOverSlotKey.value = null;
      applyDropHighlight(null);
    }
  };

  // ---- 拖拽高亮走原生 class 切换 ----
  // dragOverSlotKey/draggingSlotKey 已从行级 v-memo 依赖中移除，
  // 跨槽位边界时若走 Vue 渲染会让所有行重渲染；直接操作 DOM 零渲染开销
  let currentDropKey: string | null = null;
  let sourceKey: string | null = null;

  const findSlotEls = (key: string) => document.querySelectorAll<HTMLElement>(`[data-slot-key="${CSS.escape(key)}"]`);

  const applyDropHighlight = (key: string | null) => {
    if (key === currentDropKey) return;
    if (currentDropKey !== null) {
      findSlotEls(currentDropKey).forEach(el => el.classList.remove('is-drop-target'));
    }
    currentDropKey = key;
    if (key !== null) {
      findSlotEls(key).forEach(el => el.classList.add('is-drop-target'));
    }
  };

  const markDragSource = (key: string) => {
    sourceKey = key;
    findSlotEls(key).forEach(el => el.classList.add('is-dragging-source'));
  };

  const clearDragClasses = () => {
    applyDropHighlight(null);
    if (sourceKey !== null) {
      findSlotEls(sourceKey).forEach(el => el.classList.remove('is-dragging-source'));
      sourceKey = null;
    }
  };

  const setGhostEl = (el: Element | ComponentPublicInstance | null) => {
    ghostEl = el instanceof HTMLElement ? el : null;
  };

  const applyDragUpdate = () => {
    dragUpdateRafId = 0;
    const pos = pendingDragPos;
    pendingDragPos = null;
    if (!pos || !isDragging.value) return;
    if (ghostEl) {
      ghostEl.style.transform = `translate3d(${pos.x}px, ${pos.y - 20}px, 0)`;
    }
    updateDropTarget(pos.x, pos.y);
  };

  const scheduleDragUpdate = (clientX: number, clientY: number) => {
    pendingDragPos = { x: clientX, y: clientY };
    if (dragUpdateRafId) return;
    dragUpdateRafId = requestAnimationFrame(applyDragUpdate);
  };

  const flushDragUpdate = () => {
    if (dragUpdateRafId) {
      cancelAnimationFrame(dragUpdateRafId);
      applyDragUpdate();
    }
  };

  const cancelDragUpdate = () => {
    if (dragUpdateRafId) {
      cancelAnimationFrame(dragUpdateRafId);
      dragUpdateRafId = 0;
    }
    pendingDragPos = null;
  };

  const startDrag = (clientX: number, clientY: number) => {
    if (!activeSourceKey || !activeChord) return;
    isDragging.value = true;
    wasDraggingInSession = true;
    draggingSlotKey.value = activeSourceKey;
    markDragSource(activeSourceKey);
    ghostChordName.value = activeChord.chordName;
    document.body.classList.add('is-global-dragging');
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(20);
      } catch {}
    }
    scheduleDragUpdate(clientX, clientY);
  };

  const handleGlobalPointerMove = (e: PointerEvent) => {
    if (startPointer.pointerId !== e.pointerId) return;

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
    scheduleDragUpdate(e.clientX, e.clientY);

    if (autoScrollRafId === null) {
      checkAutoScroll();
    }
  };

  const cleanupListeners = () => {
    window.removeEventListener('pointermove', handleGlobalPointerMove);
    window.removeEventListener('pointerup', handleGlobalPointerUp);
    window.removeEventListener('pointercancel', handleGlobalPointerCancel);
    setTimeout(() => {
      window.removeEventListener('contextmenu', preventContextMenu, true);
    }, 100);
  };

  const handleGlobalPointerUp = (e: PointerEvent) => {
    if (startPointer.pointerId !== e.pointerId) return;

    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    stopAutoScroll();
    flushDragUpdate();
    cleanupListeners();

    const hadDrag = isDragging.value || wasDraggingInSession;

    if (isDragging.value) {
      if (
        draggingSlotKey.value &&
        dragOverSlotKey.value &&
        draggingSlotKey.value !== dragOverSlotKey.value &&
        scoreEditor.activeSong
      ) {
        scoreEditor.swapSlotChords(draggingSlotKey.value, dragOverSlotKey.value);
      }
    }

    if (hadDrag) {
      suppressNextClick();
    }

    isDragging.value = false;
    draggingSlotKey.value = null;
    dragOverSlotKey.value = null;
    activeSourceKey = null;
    activeChord = null;
    startPointer = { x: 0, y: 0, pointerId: -1, pointerType: '' };
    clearDragClasses();
    document.body.classList.remove('is-global-dragging');
  };

  const handleGlobalPointerCancel = (e: PointerEvent) => {
    if (startPointer.pointerId !== e.pointerId) return;
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    stopAutoScroll();
    cancelDragUpdate();
    cleanupListeners();
    if (isDragging.value || wasDraggingInSession) {
      suppressNextClick();
    }
    isDragging.value = false;
    draggingSlotKey.value = null;
    dragOverSlotKey.value = null;
    activeSourceKey = null;
    activeChord = null;
    startPointer = { x: 0, y: 0, pointerId: -1, pointerType: '' };
    clearDragClasses();
    document.body.classList.remove('is-global-dragging');
  };

  const handlePointerDown = (e: PointerEvent, slotKey: string, chord: Chord) => {
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
    startPointer = {
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
    };
    currentPointerPos = { x: e.clientX, y: e.clientY };
    activeSourceKey = slotKey;
    activeChord = chord;

    window.addEventListener('pointermove', handleGlobalPointerMove, {
      passive: false,
    });
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerCancel);
    window.addEventListener('contextmenu', preventContextMenu, true);

    if (e.pointerType === 'touch') {
      longPressTimer = setTimeout(() => {
        startDrag(startPointer.x, startPointer.y);
        longPressTimer = null;
      }, LONG_PRESS_DELAY);
    }
  };

  onBeforeUnmount(() => {
    if (longPressTimer) clearTimeout(longPressTimer);
    stopAutoScroll();
    cancelDragUpdate();
    cleanupListeners();
    clearDragClasses();
    document.body.classList.remove('is-global-dragging');
  });

  return {
    isDragging,
    draggingSlotKey,
    dragOverSlotKey,
    ghostChordName,
    setGhostEl,
    handlePointerDown,
  };
}
