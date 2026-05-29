import { useChordLabStore } from '@/stores/chordLabStore';
import { useUiStore } from '@/stores/uiStore';
import { ref } from 'vue';

export function useChordDragDrop() {
  const uiStore = useUiStore();
  const chordLabStore = useChordLabStore();

  const draggedChordInfo = ref<{ chordId: number; fromGroupId: string } | null>(null);

  const handleGroupDragStart = (idx: number, e: DragEvent) => {
    uiStore.draggedGroupIdx = idx;
    chordLabStore.groups.forEach(g => (g.collapsed = true));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  };

  const handleGroupDrop = (targetIdx: number) => {
    if (uiStore.draggedGroupIdx !== null && uiStore.draggedGroupIdx !== targetIdx) {
      const removed = chordLabStore.groups.splice(uiStore.draggedGroupIdx, 1)[0];
      chordLabStore.groups.splice(targetIdx, 0, removed);
      uiStore.showToast('↕️ 分组顺序已更新');
    }
    uiStore.draggedGroupIdx = null;
  };

  // 🌟 仅保留基础拖拽属性，砍掉冗余右键识别
  const handleChordDragStart = (chordId: number, fromGroupId: string, e: DragEvent) => {
    draggedChordInfo.value = { chordId, fromGroupId };
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  };

  const handleChordDragEnd = () => {
    draggedChordInfo.value = null;
  };

  const handleChordDropToSort = (targetChordId: number, targetGroupId: string) => {
    const info = draggedChordInfo.value;
    if (!info || info.chordId === targetChordId) {
      handleChordDragEnd();
      return;
    }

    const sourceIdx = chordLabStore.savedChordsList.findIndex(c => c.id === info.chordId);
    const targetIdx = chordLabStore.savedChordsList.findIndex(c => c.id === targetChordId);
    if (sourceIdx !== -1 && targetIdx !== -1) {
      const [movedChord] = chordLabStore.savedChordsList.splice(sourceIdx, 1);
      // 允许自然拖拽排序时更新 groupId
      if (info.fromGroupId !== targetGroupId) movedChord.groupId = targetGroupId;
      chordLabStore.savedChordsList.splice(targetIdx, 0, movedChord);

      uiStore.clearUndoToasts();
      uiStore.showToast('⚡ 和弦顺序已同步');
    }
    handleChordDragEnd();
  };

  // 返回精简后纯净接口
  return {
    handleGroupDragStart,
    handleGroupDrop,
    handleChordDragStart,
    handleChordDragEnd,
    handleChordDropToSort,
  };
}
