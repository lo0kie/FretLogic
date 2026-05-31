import type { ModalActionType } from '@/constants';
import { useChordLabStore } from '@/stores/chordLabStore';
import type { Chord, Group, Toast } from '@/stores/types'; // 馃専 锁死统一元组类型引用
import { useRefHistory, useToggle } from '@vueuse/core';
import { defineStore } from 'pinia';
import { nextTick, ref, toRaw, toRef } from 'vue';

export const useUiStore = defineStore('ui', () => {
  const chordStore = useChordLabStore();
  const savedChordsRef = toRef(chordStore, 'savedChordsList');

  // 馃専 全面拥抱浏览器现代原生的 structuredClone，完美切断副作用，让撤销栈稳定度大幅度跃升
  const { undo: rawUndo } = useRefHistory(savedChordsRef, {
    capacity: 10,
    clone: v => structuredClone(toRaw(v.map(toRaw))),
    deep: true,
  });

  const toasts = ref<Toast[]>([]);
  const isLeftOpen = ref(true);
  const isRightOpen = ref(true);
  const isCopying = ref(false);
  const isCapoOpen = ref(false);
  const toggleCapoPanel = useToggle(isCapoOpen);

  // 全局弹窗控制中心
  const modalShow = ref(false);
  const modalType = ref<ModalActionType>('');
  const modalTitle = ref('');
  const modalInput = ref('');
  const activeTargetGroup = ref<Group | null>(null);
  const activeTargetChord = ref<Chord | null>(null);
  const draggedGroupIdx = ref<number | null>(null);

  const clearUndoToasts = () => {
    toasts.value = toasts.value.filter(t => !t.canUndo);
  };

  const showToast = (msg: string, canUndo = false) => {
    const id = performance.now();
    if (canUndo) clearUndoToasts();
    toasts.value.push({ id, msg, canUndo });
    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== id);
    }, 3000);
  };

  // 馃専 撤销核心动作（保留核心状态联动，方便与未来 Service 无缝对接）
  const executeUndoRestore = () => {
    rawUndo();
    const validGroupIds = new Set(chordStore.groups.map(g => g.id));
    let hasOrphans = false;

    chordStore.savedChordsList.forEach(chord => {
      if (!validGroupIds.has(chord.groupId)) hasOrphans = true;
    });

    if (hasOrphans) {
      let targetGroupId = chordStore.selectedGroupId || chordStore.groups[0]?.id || null;
      if (!targetGroupId) {
        // 使用标准的加密安全随机种子代替可能产生冲突的 Date.now()
        targetGroupId = 'g_recovery_' + crypto.randomUUID().slice(0, 8);
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

  return {
    executeUndoRestore,
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
  };
});
