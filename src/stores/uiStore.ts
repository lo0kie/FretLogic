import type { ModalActionType } from '@/constants';
import { useChordLabStore, type Chord, type Group } from '@/stores/chordLabStore';
import { copyElementToClipboard } from '@/utils/domExporter';
import { useRefHistory, useToggle } from '@vueuse/core';
import { defineStore } from 'pinia';
import { ref, toRef } from 'vue'; // 🌟 必须引入 toRef

export interface Toast {
  id: number;
  msg: string;
  canUndo: boolean;
}

export const useUiStore = defineStore('ui', () => {
  const chordStore = useChordLabStore();

  // 🌟 使用 toRef + deep: true 完美捕获 Pinia 数组内部的深层改变
  const savedChordsRef = toRef(chordStore, 'savedChordsList');
  const { undo } = useRefHistory(savedChordsRef, {
    capacity: 10,
    clone: true,
    deep: true,
  });

  const isLeftOpen = ref(true);
  const isRightOpen = ref(true);
  const isCopying = ref(false);

  const isCapoOpen = ref(false);
  const toggleCapoPanel = useToggle(isCapoOpen);

  const toasts = ref<Toast[]>([]);

  const showToast = (msg: string, canUndo = false) => {
    const id = Date.now();
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

  const draggedGroupIdx = ref<number | null>(null);

  const openModal = (type: Exclude<ModalActionType, ''>, title: string, initVal = '', target: Group | null = null) => {
    modalType.value = type;
    modalTitle.value = title;
    modalInput.value = initVal;
    activeTargetGroup.value = target;
    modalShow.value = true;
  };

  const handleModalConfirm = () => {
    const val = modalInput.value.trim();

    if (['createGroup', 'renameGroup'].includes(modalType.value) && !val) {
      return showToast('❌ 名称不能为空');
    }

    if (modalType.value === 'createGroup') {
      if (chordStore.groups.some(g => g.name === val)) return showToast('⚠️ 名称已存在');
      const newId = 'g_' + Date.now();
      chordStore.groups.push({ id: newId, name: val, collapsed: false });
      chordStore.selectedGroupId = newId;
    } else if (modalType.value === 'renameGroup' && activeTargetGroup.value) {
      activeTargetGroup.value.name = val;
    } else if (modalType.value === 'deleteGroup' && activeTargetGroup.value) {
      const remainingChords = chordStore.savedChordsList.filter(c => c.groupId !== activeTargetGroup.value!.id);
      chordStore.overwriteChords(remainingChords);
      const remainingGroups = chordStore.groups.filter(g => g.id !== activeTargetGroup.value!.id);
      chordStore.overwriteGroups(remainingGroups);

      if (chordStore.selectedGroupId === activeTargetGroup.value.id) {
        chordStore.selectedGroupId = chordStore.groups[0]?.id || null;
      }
    }
    modalShow.value = false;
    showToast('操作成功');
  };

  const triggerSaveChord = () => {
    const cleanName = chordStore.currentChordName.trim();
    if (!cleanName) return showToast('❌ 保存失败：请输入和弦名称（如 C, Am）');
    if (chordStore.isFretBoardEmpty) return showToast('❌ 保存失败：指板上至少需要指定一个有效音符');

    const currentActiveGroup = chordStore.groups.find(g => g.id === chordStore.selectedGroupId);
    let targetGroupId = chordStore.selectedGroupId;

    if (chordStore.editingId) {
      const originalChord = chordStore.savedChordsList.find(c => c.id == chordStore.editingId);
      if (originalChord) targetGroupId = originalChord.groupId;
    } else {
      if (!chordStore.selectedGroupId || (currentActiveGroup && currentActiveGroup.collapsed)) {
        return showToast('❌ 请先在左侧展开一个目标分组');
      }
    }

    const payload: Chord = {
      id: chordStore.editingId || Date.now(),
      chordName: cleanName,
      selectedFrets: [...chordStore.selectedFrets],
      fretCount: chordStore.fretCount,
      capo: chordStore.capo,
      groupId: targetGroupId || 'default',
      rootMark: chordStore.rootMark,
    };

    const idx = chordStore.savedChordsList.findIndex(c => c.id == chordStore.editingId);
    if (idx !== -1) chordStore.updateChord(idx, payload);
    else chordStore.addChord(payload);

    chordStore.resetEditor();
    showToast('👍 已经成功持久化保存！');
  };

  const triggerDeleteChord = (chord: Chord) => {
    const filtered = chordStore.savedChordsList.filter(c => c.id !== chord.id);
    chordStore.overwriteChords(filtered);
    showToast(`🗑️ 已删除"${chord.chordName}"`, true);
  };

  const copyFretBoardToClipboard = async (selector: string) => {
    if (isCopying.value) return;
    isCopying.value = true;
    showToast('📸 正在生成指板图片...');

    try {
      await copyElementToClipboard(selector);
      showToast('✅ 图片已成功复制到剪切板！');
    } catch (err) {
      console.error('图片转换失败:', err);
      showToast('❌ 浏览器权限拦截，复制失败');
    } finally {
      isCopying.value = false;
    }
  };

  return {
    undo,
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
    draggedGroupIdx,
    openModal,
    handleModalConfirm,
    triggerSaveChord,
    triggerDeleteChord,
    copyFretBoardToClipboard,
  };
});
