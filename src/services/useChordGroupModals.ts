import BaseInput from '@/components/BaseInput.vue';
import { useEditorStore } from '@/stores/chordEditorStore';
import { useChordStore } from '@/stores/chordStore';
import { useUiStore } from '@/stores/uiStore';
import type { Chord, Group } from '@/types';
import { generateUUID } from '@/utils/validators';
import { nextTick, reactive, ref } from 'vue';

export function useChordGroupModals() {
  const chordStore = useChordStore();
  const editorStore = useEditorStore();
  const uiStore = useUiStore();

  const modals = reactive({ create: false, rename: false, delete: false, move: false });
  const modalData = reactive({
    inputValue: '',
    activeGroup: null as Group | null,
    activeChord: null as Chord | null,
    moveTargetId: '',
  });

  const createInputRef = ref<InstanceType<typeof BaseInput> | null>(null);
  const renameInputRef = ref<InstanceType<typeof BaseInput> | null>(null);

  const openCreate = async () => {
    modalData.inputValue = '';
    modals.create = true;
    await nextTick();
    setTimeout(() => createInputRef.value?.focus(), 50);
  };

  const handleCreateGroup = () => {
    const val = modalData.inputValue.trim();
    if (!val) {
      uiStore.toast.error('确认失败：请输入有效内容');
      return;
    }
    if (chordStore.groups.some(g => g.name === val)) {
      uiStore.toast.warning('创建失败：该分组名称已存在');
      return;
    }
    const newId = 'g_' + generateUUID().slice(0, 8);
    chordStore.groups.forEach(g => {
      g.collapsed = true;
    });

    chordStore.groups.push({ id: newId, name: val, collapsed: false });
    chordStore.selectedGroupId = newId;
    modals.create = false;
    uiStore.toast.success('操作成功完成');
  };

  const openRename = async (group: Group) => {
    modalData.activeGroup = group;
    modalData.inputValue = group.name;
    modals.rename = true;
    await nextTick();
    setTimeout(() => renameInputRef.value?.focus(), 50);
  };

  const handleRenameGroup = () => {
    const val = modalData.inputValue.trim();
    if (!val) {
      uiStore.toast.error('确认失败：请输入有效内容');
      return;
    }
    if (modalData.activeGroup) modalData.activeGroup.name = val;
    modals.rename = false;
    uiStore.toast.success('操作成功完成');
  };

  const openDelete = (group: Group) => {
    modalData.activeGroup = group;
    modals.delete = true;
  };

  const handleDeleteGroup = () => {
    if (!modalData.activeGroup) return;
    const targetGid = modalData.activeGroup.id;
    if (editorStore.editingId) {
      const editingChord = chordStore.savedChordsList.find(c => c.id === editorStore.editingId);
      if (editingChord && editingChord.groupId === targetGid) editorStore.resetEditor();
    }
    chordStore.overwriteChords(chordStore.savedChordsList.filter(c => c.groupId !== targetGid));
    chordStore.overwriteGroups(chordStore.groups.filter(g => g.id !== targetGid));
    if (chordStore.selectedGroupId === targetGid) chordStore.selectedGroupId = chordStore.groups[0]?.id || null;
    uiStore.clearActionToasts();
    modals.delete = false;
    uiStore.toast.success('操作成功完成');
  };

  const openMove = (chord: Chord) => {
    modalData.activeChord = chord;
    modalData.moveTargetId = '';
    modals.move = true;
  };

  const handleMoveChord = () => {
    if (!modalData.moveTargetId) {
      uiStore.toast.error('确认失败：请选择有效分组');
      return;
    }
    if (!modalData.activeChord) return;
    const chordIdx = chordStore.savedChordsList.findIndex(c => c.id === modalData.activeChord!.id);
    if (chordIdx !== -1) {
      chordStore.savedChordsList[chordIdx].groupId = modalData.moveTargetId;
      uiStore.clearActionToasts();
    }
    modals.move = false;
    uiStore.toast.success('操作成功完成');
  };

  const getGroupClass = (groupId: string) => {
    if (groupId === modalData.activeChord?.groupId) return 'is-disabled';
    if (modalData.moveTargetId === groupId) return 'is-selected';
    return 'is-normal';
  };

  return {
    modals,
    modalData,
    createInputRef,
    renameInputRef,
    openCreate,
    handleCreateGroup,
    openRename,
    handleRenameGroup,
    openDelete,
    handleDeleteGroup,
    openMove,
    handleMoveChord,
    getGroupClass,
  };
}
