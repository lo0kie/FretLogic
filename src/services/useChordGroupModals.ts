import { DEFAULT_GROUP_SORT_RULE, DEFAULT_SORT_KEY, ID_PREFIXES, MESSAGES } from '@/constants';
import { useChordService } from '@/services/useChordActions';
import { useEditorStore } from '@/stores/chordEditorStore';
import { useChordStore } from '@/stores/chordStore';
import { useUiStore } from '@/stores/uiStore';
import type { Chord, Group, GroupedChordCard, GroupSortRule } from '@/types';
import { generateUUID } from '@/utils/validators';
import { reactive } from 'vue';

export function useChordGroupModals() {
  const chordStore = useChordStore();
  const editorStore = useEditorStore();
  const uiStore = useUiStore();
  const chordService = useChordService();

  const modals = reactive({
    create: false,
    rename: false,
    delete: false,
    move: false,
    sort: false,
    chordVariantsDelete: false,
  });

  const modalData = reactive({
    inputValue: '',
    activeGroup: null as Group | null,
    activeChord: null as Chord | null,
    activeGroupCard: null as GroupedChordCard | null,
    selectedVariantIds: new Set<string>(),
    moveTargetId: '',
    sortRule: DEFAULT_GROUP_SORT_RULE as GroupSortRule,
    sortKey: DEFAULT_SORT_KEY,
  });

  const openCreate = () => {
    modalData.inputValue = '';
    modals.create = true;
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
    const newId = ID_PREFIXES.GROUP + generateUUID().slice(0, 8);
    chordStore.groups.forEach(g => {
      g.collapsed = true;
    });

    chordStore.groups.push({ id: newId, name: val, collapsed: false, sortRule: DEFAULT_GROUP_SORT_RULE });
    chordStore.selectedGroupId = newId;
    modals.create = false;
    uiStore.toast.success(MESSAGES.SUCCESS_OPERATION);
  };

  const openRename = (group: Group) => {
    modalData.activeGroup = group;
    modalData.inputValue = group.name;
    modals.rename = true;
  };

  const handleRenameGroup = () => {
    const val = modalData.inputValue.trim();
    if (!val) {
      uiStore.toast.error('确认失败：请输入有效内容');
      return;
    }
    if (modalData.activeGroup) modalData.activeGroup.name = val;
    modals.rename = false;
    uiStore.toast.success(MESSAGES.SUCCESS_OPERATION);
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
    uiStore.toast.success(MESSAGES.SUCCESS_OPERATION);
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
    } else {
      uiStore.toast.error('移动失败：目标和弦已被删除');
    }
    modals.move = false;
    uiStore.toast.success(MESSAGES.SUCCESS_OPERATION);
  };

  const getGroupClass = (groupId: string) => {
    if (groupId === modalData.activeChord?.groupId) return 'is-disabled';
    if (modalData.moveTargetId === groupId) return 'is-selected';
    return 'is-normal';
  };

  const openSort = (group: Group) => {
    modalData.activeGroup = group;
    modalData.sortRule = group.sortRule || DEFAULT_GROUP_SORT_RULE;
    modalData.sortKey = group.sortKey || DEFAULT_SORT_KEY;
    modals.sort = true;
  };

  const handleSaveSort = () => {
    if (modalData.activeGroup) {
      modalData.activeGroup.sortRule = modalData.sortRule;
      modalData.activeGroup.sortKey = modalData.sortKey;
    }
    modals.sort = false;
    uiStore.toast.success('排序配置已更新');
  };

  const openChordVariantsDelete = (cardData: GroupedChordCard) => {
    modalData.activeGroupCard = cardData;
    modalData.selectedVariantIds = new Set<string>();
    modals.chordVariantsDelete = true;
  };

  const toggleVariantSelection = (chordId: string) => {
    const set = modalData.selectedVariantIds;
    if (set.has(chordId)) {
      set.delete(chordId);
    } else {
      set.add(chordId);
    }
  };

  const handleDeleteSelectedVariants = () => {
    if (!modalData.activeGroupCard || modalData.selectedVariantIds.size === 0) {
      uiStore.toast.warning('请至少选择一个要删除的指法');
      return;
    }
    const chordsToDelete = modalData.activeGroupCard.variants.filter(v => modalData.selectedVariantIds.has(v.id));
    chordService.triggerDeleteChords(chordsToDelete);
    modals.chordVariantsDelete = false;
  };

  const handleDeleteAllVariants = () => {
    if (!modalData.activeGroupCard) return;
    chordService.triggerDeleteChords(modalData.activeGroupCard.variants);
    modals.chordVariantsDelete = false;
  };

  return {
    modals,
    modalData,
    openCreate,
    handleCreateGroup,
    openRename,
    handleRenameGroup,
    openDelete,
    handleDeleteGroup,
    openMove,
    handleMoveChord,
    getGroupClass,
    openSort,
    handleSaveSort,
    openChordVariantsDelete,
    toggleVariantSelection,
    handleDeleteSelectedVariants,
    handleDeleteAllVariants,
  };
}
