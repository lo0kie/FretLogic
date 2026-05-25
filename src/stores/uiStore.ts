import { useRefHistory, useToggle } from '@vueuse/core';
import { defineStore } from 'pinia';
import { ref, toRef } from 'vue';
import { useChordLabStore, type Chord, type Group } from './chordLabStore';

export interface Toast {
  id: number;
  msg: string;
  canUndo: boolean;
}

export const useUiStore = defineStore('ui', () => {
  const chordStore = useChordLabStore();

  const savedChordsRef = toRef(chordStore, 'savedChordsList');
  // 核心历史数据回滚能力（在 UI 层做联动撤回控制中心）
  const { undo } = useRefHistory(savedChordsRef, { capacity: 10, clone: true });

  // 1. 左右侧边栏框架开合控制
  const isLeftOpen = ref(true);
  const isRightOpen = ref(true);

  // 2. Capo 独立浮层面板开关
  const isCapoOpen = ref(false);
  const toggleCapoPanel = useToggle(isCapoOpen);

  // 3. 全局独立 Toasts 提示队列管理
  const toasts = ref<Toast[]>([]);

  const showToast = (msg: string, canUndo = false) => {
    const id = Date.now();
    toasts.value.push({ id, msg, canUndo });
    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== id);
    }, 3000);
  };

  // 4. 全局模态弹窗（Modal）交互数据模型
  const modalShow = ref(false);
  const modalType = ref<'createGroup' | 'renameGroup' | 'deleteGroup' | ''>('');
  const modalTitle = ref('');
  const modalInput = ref('');
  const activeTargetGroup = ref<Group | null>(null);

  // 🌟 5. 跨组件拖拽排序临时交互变量 (补齐核心)
  const draggedGroupIdx = ref<number | null>(null);

  const openModal = (
    type: 'createGroup' | 'renameGroup' | 'deleteGroup',
    title: string,
    initVal = '',
    target: Group | null = null
  ) => {
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
      chordStore.savedChordsList = chordStore.savedChordsList.filter(c => c.groupId !== activeTargetGroup.value!.id);
      chordStore.groups = chordStore.groups.filter(g => g.id !== activeTargetGroup.value!.id);
      if (chordStore.selectedGroupId === activeTargetGroup.value.id) {
        chordStore.selectedGroupId = chordStore.groups[0]?.id || null;
      }
    }
    modalShow.value = false;
    showToast('操作成功');
  };

  // 6. 跨组件核心联动 Action：保存和弦（内部联动数据主脑）
  const triggerSaveChord = () => {
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
      chordName: chordStore.currentChordName.trim() || '未命名',
      selectedFrets: [...chordStore.selectedFrets],
      fretCount: chordStore.fretCount,
      capo: chordStore.capo,
      groupId: targetGroupId || 'default',
    };

    const idx = chordStore.savedChordsList.findIndex(c => c.id == chordStore.editingId);
    idx !== -1 ? (chordStore.savedChordsList[idx] = payload) : chordStore.savedChordsList.unshift(payload);

    chordStore.resetEditor();
    showToast('✨ 已保存');
  };

  // 7. 跨组件核心联动 Action：删除和弦并弹出带 Undo 的 Toast
  const triggerDeleteChord = (chord: Chord) => {
    chordStore.savedChordsList = chordStore.savedChordsList.filter(c => c.id !== chord.id);
    showToast(`🗑️ 已删除 "${chord.chordName}"`, true);
  };

  return {
    undo,
    isLeftOpen,
    isRightOpen,
    isCapoOpen,
    toggleCapoPanel,
    toasts,
    showToast,
    modalShow,
    modalType,
    modalTitle,
    modalInput,
    activeTargetGroup,
    openModal,
    handleModalConfirm,
    triggerSaveChord,
    triggerDeleteChord,
    // 🌟 核心修正：在这里将变量优雅地回传提供出去，这样 LeftGroupList.vue 就能正常读写了！
    draggedGroupIdx,
  };
});
