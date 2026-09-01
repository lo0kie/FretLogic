import type { Song } from '@/types';
import { computed, shallowRef, watch, type Ref } from 'vue';

/** 歌词行多选状态（供行级导出等场景使用）：切歌自动清空，总行数变化时裁剪越界的选中项 */
export function useLineSelection(totalLines: Ref<number>, activeSong: Ref<Song | null>) {
  const selectedLineSet = shallowRef<Set<number>>(new Set());

  const isAllSelected = computed(() => totalLines.value > 0 && selectedLineSet.value.size === totalLines.value);
  const sortedSelectedIndices = computed(() => Array.from(selectedLineSet.value).sort((a, b) => a - b));

  /** 从选中集合中移除一行（行被删除时同步选中态） */
  const handleRemoveLineIndex = (lineIdx: number) => {
    const updated = new Set(selectedLineSet.value);
    updated.delete(lineIdx);
    selectedLineSet.value = updated;
  };

  /** 点击行切换选中态（整体替换 Set 以触发 shallowRef 更新） */
  const handleLineClick = (idx: number) => {
    const updated = new Set(selectedLineSet.value);
    if (updated.has(idx)) {
      updated.delete(idx);
    } else {
      updated.add(idx);
    }
    selectedLineSet.value = updated;
  };

  /** 全选/取消全选 */
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

  /** 清空选中 */
  const clearSelection = () => {
    selectedLineSet.value = new Set();
  };

  watch(activeSong, clearSelection);

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
