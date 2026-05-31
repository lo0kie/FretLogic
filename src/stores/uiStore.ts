import type { ModalActionType } from '@/constants';
import { useChordLabStore, type Chord, type Group } from '@/stores/chordLabStore';
import { copyElementToClipboard } from '@/utils/domExporter';
import { useRefHistory, useToggle } from '@vueuse/core';
import { defineStore } from 'pinia';
import { nextTick, ref, toRef } from 'vue';

export interface Toast {
  id: number;
  msg: string;
  canUndo: boolean;
}

export const useUiStore = defineStore('ui', () => {
  const chordStore = useChordLabStore();
  const savedChordsRef = toRef(chordStore, 'savedChordsList');

  // 🌟 终极修复：放弃对宿主混杂对象敏感的 structuredClone
  // 🌟 改用最纯净的“脱水/复水”快照机制。这能 100% 剥离任何可能夹带的 Proxy 壳子或隐式宿主引用，确保撤销栈绝对安全稳固！
  const { undo: rawUndo } = useRefHistory(savedChordsRef, {
    capacity: 10,
    clone: v => JSON.parse(JSON.stringify(v)),
    deep: true,
  });

  const toasts = ref<Toast[]>([]);

  const clearUndoToasts = () => {
    toasts.value = toasts.value.filter(t => !t.canUndo);
  };

  const undo = () => {
    rawUndo();
    const validGroupIds = new Set(chordStore.groups.map(g => g.id));
    let hasOrphans = false;
    chordStore.savedChordsList.forEach(chord => {
      if (!validGroupIds.has(chord.groupId)) hasOrphans = true;
    });
    if (hasOrphans) {
      let targetGroupId = chordStore.selectedGroupId || chordStore.groups[0]?.id || null;
      if (!targetGroupId) {
        targetGroupId = 'g_recovery_' + Date.now();
        chordStore.groups.forEach(g => {
          g.collapsed = true;
        });
        chordStore.groups.unshift({ id: targetGroupId, name: '已恢复的和弦', collapsed: false });
        chordStore.selectedGroupId = targetGroupId;

        nextTick(() => {
          document.getElementById(`group-${targetGroupId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      }
      chordStore.savedChordsList.forEach(c => {
        if (!validGroupIds.has(c.groupId)) c.groupId = targetGroupId as string;
      });
    }
    clearUndoToasts();
  };

  const isLeftOpen = ref(true);
  const isRightOpen = ref(true);
  const isCopying = ref(false);
  const isCapoOpen = ref(false);
  const toggleCapoPanel = useToggle(isCapoOpen);

  const showToast = (msg: string, canUndo = false) => {
    const id = performance.now();
    if (canUndo) clearUndoToasts();
    toasts.value.push({ id, msg, canUndo });
    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== id);
    }, 3000);
  };

  const modalShow = ref(false);
  const modalType = ref<ModalActionType>('');
  const modalTitle = ref('');
  const modalInput = ref('');
  const activeTargetGroup = ref<Group | null>(null);
  const activeTargetChord = ref<Chord | null>(null);

  const draggedGroupIdx = ref<number | null>(null);

  const openModal = (
    type: Exclude<ModalActionType, ''>,
    title: string,
    initVal = '',
    targetGroup: Group | null = null,
    targetChord: Chord | null = null
  ) => {
    modalType.value = type;
    modalTitle.value = title;
    modalInput.value = initVal;
    activeTargetGroup.value = targetGroup;
    activeTargetChord.value = targetChord;
    modalShow.value = true;
  };

  const handleModalConfirm = () => {
    const val = modalInput.value.trim();
    if (['createGroup', 'renameGroup', 'moveChord'].includes(modalType.value) && !val)
      return showToast('❌ 请输入或选择有效内容');

    if (modalType.value === 'createGroup') {
      if (chordStore.groups.some(g => g.name === val)) return showToast('⚠️ 名称已存在');
      const newId = 'g_' + Date.now();

      chordStore.groups.forEach(g => {
        g.collapsed = true;
      });
      chordStore.groups.push({ id: newId, name: val, collapsed: false });
      chordStore.selectedGroupId = newId;

      nextTick(() => {
        document.getElementById(`group-${newId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    } else if (modalType.value === 'renameGroup' && activeTargetGroup.value) {
      activeTargetGroup.value.name = val;
    } else if (modalType.value === 'deleteGroup' && activeTargetGroup.value) {
      if (chordStore.editingId) {
        const editingChord = chordStore.savedChordsList.find(c => c.id === chordStore.editingId);
        if (editingChord && editingChord.groupId === activeTargetGroup.value.id) chordStore.resetEditor();
      }
      chordStore.overwriteChords(chordStore.savedChordsList.filter(c => c.groupId !== activeTargetGroup.value!.id));
      chordStore.overwriteGroups(chordStore.groups.filter(g => g.id !== activeTargetGroup.value!.id));
      if (chordStore.selectedGroupId === activeTargetGroup.value.id)
        chordStore.selectedGroupId = chordStore.groups[0]?.id || null;
      clearUndoToasts();
    } else if (modalType.value === 'moveChord' && activeTargetChord.value) {
      const chordIdx = chordStore.savedChordsList.findIndex(c => c.id === activeTargetChord.value!.id);
      if (chordIdx !== -1) {
        chordStore.savedChordsList[chordIdx].groupId = val;
        clearUndoToasts();
      }
    }

    modalShow.value = false;
    showToast('操作成功');
  };

  const triggerSaveChord = () => {
    const cleanName = chordStore.currentChordName.trim();
    if (!cleanName || chordStore.isFretBoardEmpty) return showToast('❌ 保存失败：请输入名称并指定音符');

    const targetGroupId = chordStore.editingId
      ? chordStore.savedChordsList.find(c => c.id == chordStore.editingId)?.groupId || chordStore.selectedGroupId
      : chordStore.selectedGroupId;

    const payload: Chord = {
      id: chordStore.editingId || Date.now(),
      chordName: cleanName,
      selectedFrets: [...chordStore.selectedFrets],
      fretCount: chordStore.fretCount,
      capo: chordStore.capo,
      groupId: targetGroupId || 'default',
      rootMark: chordStore.rootMark,
      useFlat: [...chordStore.useFlat],
      tuning: chordStore.currentTuning,
    };

    const idx = chordStore.savedChordsList.findIndex(c => c.id == chordStore.editingId);
    if (idx !== -1) chordStore.updateChord(idx, payload);
    else chordStore.addChord(payload);
    chordStore.resetEditor();
    showToast('👍 保存成功！');
    clearUndoToasts();
  };

  const triggerDeleteChord = (chord: Chord) => {
    chordStore.overwriteChords(chordStore.savedChordsList.filter(c => c.id !== chord.id));
    showToast(`🗑️ 已删除 "${chord.chordName}"`, true);
  };

  const copyFretBoardToClipboard = async (selector: string, isTransparent: boolean = true) => {
    if (isCopying.value) return;
    isCopying.value = true;
    showToast(isTransparent ? '📸 正在导出透明图...' : '📸 正在导出实底图...');
    try {
      await copyElementToClipboard(selector, isTransparent);
      showToast('✅ 复制成功！');
    } catch {
      showToast('❌ 复制失败');
    } finally {
      isCopying.value = false;
    }
  };

  return {
    undo,
    clearUndoToasts,
    isLeftOpen,
    isRightOpen,
    isCopying,
    isCapoOpen,
    toggleCapoPanel,
    toasts,
    showToast,
    modalShow,
    modalType,
    modalTitle,
    modalInput,
    activeTargetGroup,
    activeTargetChord,
    draggedGroupIdx,
    openModal,
    handleModalConfirm,
    triggerSaveChord,
    triggerDeleteChord,
    copyFretBoardToClipboard,
  };
});
