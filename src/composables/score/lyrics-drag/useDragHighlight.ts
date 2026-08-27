import { ref } from 'vue';

export function useDragHighlight() {
  const dragOverSlotKey = ref<string | null>(null);
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
    dragOverSlotKey.value = null;
  };

  const updateDropTarget = (clientX: number, clientY: number): string | null => {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) {
      if (dragOverSlotKey.value !== null) {
        console.log('[LyricsDrag:Highlight] Target: null (no element)');
      }
      dragOverSlotKey.value = null;
      applyDropHighlight(null);
      return null;
    }

    const slotEl = el.closest('[data-slot-key]');
    if (slotEl instanceof HTMLElement) {
      const key = slotEl.dataset.slotKey ?? null;
      if (dragOverSlotKey.value !== key) {
        console.log('[LyricsDrag:Highlight] Target directly hit slot:', key);
      }
      dragOverSlotKey.value = key;
      applyDropHighlight(key);
      return key;
    }

    // 如果光标落在行容器的空白边缘（如行尾或行首），智能吸附到该行首/尾的槽位
    const lineEl = el.closest<HTMLElement>('.lyrics-line, .line-row');
    if (lineEl) {
      const lineRect = lineEl.getBoundingClientRect();
      const isRightSide = clientX >= lineRect.left + lineRect.width * 0.5;
      const allSlots = Array.from(lineEl.querySelectorAll<HTMLElement>('[data-slot-key]'));
      if (allSlots.length > 0) {
        const targetSlot = isRightSide ? allSlots[allSlots.length - 1] : allSlots[0];
        if (targetSlot) {
          const key = targetSlot.dataset.slotKey ?? null;
          if (dragOverSlotKey.value !== key) {
            console.log('[LyricsDrag:Highlight] Target snap to line edge:', isRightSide ? 'end' : 'start', '->', key);
          }
          dragOverSlotKey.value = key;
          applyDropHighlight(key);
          return key;
        }
      }
    }

    if (dragOverSlotKey.value !== null) {
      console.log('[LyricsDrag:Highlight] Target: null (outside slots)');
    }
    dragOverSlotKey.value = null;
    applyDropHighlight(null);
    return null;
  };

  return {
    dragOverSlotKey,
    markDragSource,
    clearDragClasses,
    updateDropTarget,
  };
}
