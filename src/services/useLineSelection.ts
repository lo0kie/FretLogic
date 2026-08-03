import { useEventListener } from '@vueuse/core';
import { type Ref, computed, ref, watch } from 'vue';

export function useLineSelection(
  scoreZoneRef: Ref<HTMLElement | null>,
  totalLines: Ref<number>,
  activeSongId: Ref<unknown>
) {
  const selectedLineSet = ref<Set<number>>(new Set());
  const isDraggingSelection = ref(false);
  const dragAnchorLine = ref(-1);
  const pointerDownIdx = ref(-1);
  const isMovedDuringPointerDown = ref(false);
  const isDragSelecting = ref(true);
  const initialSelectedSnapshot = ref<Set<number>>(new Set());

  const isAllSelected = computed(() => totalLines.value > 0 && selectedLineSet.value.size === totalLines.value);
  const sortedSelectedIndices = computed(() => Array.from(selectedLineSet.value).sort((a, b) => a - b));

  watch(activeSongId, () => {
    selectedLineSet.value.clear();
  });

  watch(totalLines, newTotal => {
    if (selectedLineSet.value.size === 0) return;
    const updated = new Set<number>();
    selectedLineSet.value.forEach(idx => {
      if (idx < newTotal) {
        updated.add(idx);
      }
    });
    if (updated.size !== selectedLineSet.value.size) {
      selectedLineSet.value = updated;
    }
  });

  const handleRemoveLineIndex = (lineIdx: number) => {
    const updated = new Set(selectedLineSet.value);
    updated.delete(lineIdx);
    selectedLineSet.value = updated;
  };

  const getLineIdxFromPoint = (clientX: number, clientY: number): number | null => {
    const target = document.elementFromPoint(clientX, clientY);
    const rowEl = target?.closest('.lyrics-line') as HTMLElement;
    if (rowEl && rowEl.dataset.lineIdx !== undefined) {
      return parseInt(rowEl.dataset.lineIdx, 10);
    }
    return null;
  };

  const checkAndAutoScroll = (clientY: number) => {
    const container = scoreZoneRef.value;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const EDGE_THRESHOLD = 40;
    const SCROLL_SPEED = 12;

    if (clientY < rect.top + EDGE_THRESHOLD) {
      container.scrollTop -= SCROLL_SPEED;
    } else if (clientY > rect.bottom - EDGE_THRESHOLD) {
      container.scrollTop += SCROLL_SPEED;
    }
  };

  const handlePointerDown = (e: PointerEvent, idx: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    isDraggingSelection.value = true;
    isMovedDuringPointerDown.value = false;
    pointerDownIdx.value = idx;
    dragAnchorLine.value = idx;

    isDragSelecting.value = !selectedLineSet.value.has(idx);
    initialSelectedSnapshot.value = new Set(selectedLineSet.value);
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (!isDraggingSelection.value) return;

    checkAndAutoScroll(e.clientY);

    const idx = getLineIdxFromPoint(e.clientX, e.clientY);
    if (idx !== null) {
      if (idx !== pointerDownIdx.value) {
        isMovedDuringPointerDown.value = true;
      }

      const min = Math.min(dragAnchorLine.value, idx);
      const max = Math.max(dragAnchorLine.value, idx);
      const updated = new Set(initialSelectedSnapshot.value);

      for (let i = min; i <= max; i++) {
        if (isDragSelecting.value) {
          updated.add(i);
        } else {
          updated.delete(i);
        }
      }
      selectedLineSet.value = updated;
    }
  };

  const handlePointerUp = () => {
    if (!isDraggingSelection.value) return;

    if (!isMovedDuringPointerDown.value && pointerDownIdx.value !== -1) {
      const idx = pointerDownIdx.value;
      const updated = new Set(initialSelectedSnapshot.value);
      if (updated.has(idx)) {
        updated.delete(idx);
      } else {
        updated.add(idx);
      }
      selectedLineSet.value = updated;
    }

    isDraggingSelection.value = false;
    pointerDownIdx.value = -1;
  };

  useEventListener(window, 'pointermove', handlePointerMove);
  useEventListener(window, 'pointerup', handlePointerUp);
  useEventListener(window, 'pointercancel', handlePointerUp);

  const handleToggleSelectAll = () => {
    if (isAllSelected.value) {
      selectedLineSet.value.clear();
    } else {
      const all = new Set<number>();
      for (let i = 0; i < totalLines.value; i++) {
        all.add(i);
      }
      selectedLineSet.value = all;
    }
  };

  return {
    selectedLineSet,
    isAllSelected,
    sortedSelectedIndices,
    handleRemoveLineIndex,
    handlePointerDown,
    handleToggleSelectAll,
  };
}
