import { computed, ref, watch, type Ref } from 'vue';

export function useLineSelection(totalLines: Ref<number>, activeSongId: Ref<unknown>) {
  const selectedLineSet = ref<Set<number>>(new Set());

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

  // 🌟 单击行切换选中状态
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
    handleLineClick,
    handleToggleSelectAll,
  };
}
