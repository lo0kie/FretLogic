import { useChordActions } from '@/composables/useChordActions';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { useChordStore } from '@/stores/chordStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import type { Chord, Group, GroupedChordCard, GroupSortRule } from '@/types';
import { computeChordFingerprint, getChordName } from '@/utils/musicTheory';
import { reactive } from 'vue';

const DEFAULT_GROUP_SORT_RULE = 'ROOT_PITCH' as const;
const DEFAULT_SORT_KEY = 'C';
const MESSAGES = {
  SUCCESS_OPERATION: '操作成功完成',
} as const;

export function useChordGroupModals() {
  const chordStore = useChordStore();
  const editorStore = useChordEditorStore();
  const uiStore = useUiStore();
  const chordActions = useChordActions();
  const songStore = useSongStore();

  const modals = reactive({
    create: false,
    rename: false,
    delete: false,
    move: false,
    sort: false,
    chordVariantsDelete: false,
    chordReferences: false,
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
    // 和弦引用反查弹窗数据
    referenceChordName: '',
    referenceChordIds: [] as string[],
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
    chordStore.addGroup(val);
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
    if (modalData.activeGroup) {
      chordStore.renameGroup(modalData.activeGroup.id, val);
    }
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
    const groupName = modalData.activeGroup.name;
    // 分组对象是扁平结构，浅拷贝即可作为撤销快照；和弦列表走 chordStore 自身的撤销历史；
    // 歌曲侧只记录被解绑的槽位绑定，避免全库 cloneDeep
    const groupsSnapshot = chordStore.groups.map(g => ({ ...g }));

    if (editorStore.isEditing && editorStore.draftChord.groupId === targetGid) {
      editorStore.resetEditor();
    }

    const targetChordIds = new Set(
      chordStore.savedChordsList.filter(c => c.groupId === targetGid).flatMap(c => [c.id, computeChordFingerprint(c)])
    );

    chordStore.deleteGroup(targetGid);
    const removedBindings = songStore.unbindChordIds(targetChordIds);

    modals.delete = false;
    uiStore.toast.info(`已删除分组 "${groupName}"`, {
      actionText: '撤销',
      duration: 4000,
      onAction: () => {
        chordStore.overwriteGroups(groupsSnapshot);
        chordStore.executeUndoRestore();
        songStore.restoreChordBindings(removedBindings);
        chordStore.selectedGroupId = targetGid;
        uiStore.toast.success(`已恢复分组 "${groupName}"`);
      },
    });
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

    chordStore.moveVariantsByName(
      modalData.activeChord.groupId,
      getChordName(modalData.activeChord),
      modalData.moveTargetId
    );

    uiStore.clearActionToasts();
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
      chordStore.updateGroupSort(modalData.activeGroup.id, modalData.sortRule, modalData.sortKey);
    }
    modals.sort = false;
    uiStore.toast.success('排序配置已更新');
  };

  const openChordVariantsDelete = (cardData: GroupedChordCard) => {
    modalData.activeGroupCard = cardData;
    modalData.selectedVariantIds.clear();
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
    chordActions.triggerDeleteChords(chordsToDelete);
    modals.chordVariantsDelete = false;
  };

  const handleDeleteAllVariants = () => {
    if (!modalData.activeGroupCard) return;
    chordActions.triggerDeleteChords(modalData.activeGroupCard.variants);
    modals.chordVariantsDelete = false;
  };

  const openChordReferences = (cardData: GroupedChordCard) => {
    const ids = [cardData.mainChord.id, ...cardData.variants.map(v => v.id)];
    modalData.referenceChordIds = ids;
    modalData.referenceChordName = getChordName(cardData.mainChord);
    modals.chordReferences = true;
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
    openChordReferences,
  };
}
