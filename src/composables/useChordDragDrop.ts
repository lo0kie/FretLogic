/**
 * @Author likan
 * @Date 2026-05-29 10:35:59
 * @Filepath fret-logic\src\composables\useChordDragDrop.ts
 */

import { useChordLabStore } from '@/stores/chordLabStore';
import { useUiStore } from '@/stores/uiStore';
import { ref } from 'vue';

export function useChordDragDrop() {
  const uiStore = useUiStore();
  const chordLabStore = useChordLabStore();

  const draggedChordInfo = ref<{ chordId: number; fromGroupId: string } | null>(null);
  const groupsCollapsedSnapshot = ref<Record<string, boolean>>({});

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

  // 🌟 核心：这是之前写了但忘记 return 的函数，用来支持右键/长按盲投折叠
  const handleChordPointerDown = (chordId: number, fromGroupId: string, e: PointerEvent) => {
    if (e.button === 2) {
      e.stopPropagation();
      e.preventDefault();
      draggedChordInfo.value = { chordId, fromGroupId };
      const snapshot: Record<string, boolean> = {};
      chordLabStore.groups.forEach(g => (snapshot[g.id] = g.collapsed));
      groupsCollapsedSnapshot.value = snapshot;
      chordLabStore.groups.forEach(g => (g.collapsed = true));
      uiStore.showToast('📁 已自动为您折叠分组，请直接拖拽投递');
    }
  };

  const handleChordDragStart = (chordId: number, fromGroupId: string, e: DragEvent) => {
    if (!draggedChordInfo.value) draggedChordInfo.value = { chordId, fromGroupId };
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  };

  const handleChordDragEnd = () => {
    if (Object.keys(groupsCollapsedSnapshot.value).length > 0) {
      chordLabStore.groups.forEach(g => {
        if (groupsCollapsedSnapshot.value[g.id] !== undefined) g.collapsed = groupsCollapsedSnapshot.value[g.id];
      });
    }
    draggedChordInfo.value = null;
    groupsCollapsedSnapshot.value = {};
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
      if (info.fromGroupId !== targetGroupId) movedChord.groupId = targetGroupId;
      chordLabStore.savedChordsList.splice(targetIdx, 0, movedChord);
      uiStore.showToast('⚡ 和弦卡片顺序已同步');
    }
    handleChordDragEnd();
  };

  const handleChordDropToGroup = (targetGroupId: string) => {
    const info = draggedChordInfo.value;
    if (!info || info.fromGroupId === targetGroupId) {
      handleChordDragEnd();
      return;
    }
    const sourceIdx = chordLabStore.savedChordsList.findIndex(c => c.id === info.chordId);
    if (sourceIdx !== -1) {
      const [movedChord] = chordLabStore.savedChordsList.splice(sourceIdx, 1);
      movedChord.groupId = targetGroupId;
      chordLabStore.savedChordsList.push(movedChord);
      uiStore.showToast(`🚚 已成功划归至新分组`);
    }
    handleChordDragEnd();
  };

  return {
    handleGroupDragStart,
    handleGroupDrop,
    handleChordPointerDown, // 🌟 修复方案：在这里加上它，对外彻底暴露属性
    handleChordDragStart,
    handleChordDragEnd,
    handleChordDropToSort,
    handleChordDropToGroup,
  };
}
