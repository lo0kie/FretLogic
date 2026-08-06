import { computed, shallowRef, watch, type Ref } from 'vue';

export function useLineSelection(totalLines: Ref<number>, activeSongId: Ref<unknown>) {
  const selectedLineSet = shallowRef<Set<number>>(new Set());

  const isAllSelected = computed(() => totalLines.value > 0 && selectedLineSet.value.size === totalLines.value);
  const sortedSelectedIndices = computed(() => Array.from(selectedLineSet.value).sort((a, b) => a - b));

  const handleRemoveLineIndex = (lineIdx: number) => {
    const updated = new Set(selectedLineSet.value);
    updated.delete(lineIdx);
    selectedLineSet.value = updated;
  };

  const handleLineClick = (idx: number) => {
    const updated = new Set(selectedLineSet.value);
    if (updated.has(idx)) {
      updated.delete(idx);
    } else {
      updated.add(idx);
    }
    selectedLineSet.value = updated;
  };

  const handleToggleSelectAll = () => {
    if (isAllSelected.value) {
      clearSelection();
    } else {
      const all = new Set<number>();
      for (let i = 0; i < totalLines.value; i++) {
        all.add(i);
      }
      selectedLineSet.value = all;
    }
  };

  const clearSelection = () => {
    selectedLineSet.value = new Set();
  };

  watch(activeSongId, clearSelection);

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

  return {
    selectedLineSet,
    isAllSelected,
    sortedSelectedIndices,
    handleRemoveLineIndex,
    handleLineClick,
    handleToggleSelectAll,
    clearSelection,
  };
}
