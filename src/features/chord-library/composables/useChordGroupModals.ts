import { useChordActions } from '@/shared/composables/useChordActions';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { useChordStore } from '@/stores/chordStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import type { Chord, Group, GroupedChordCard, GroupSortRule } from '@/types';
import { getGroupSortKey } from '@/utils/music/entityFactories';
import { computeChordFingerprint, getChordName } from '@/utils/music/musicTheory';
import { reactive } from 'vue';

const DEFAULT_GROUP_SORT_RULE = 'ROOT_PITCH' as const;
const DEFAULT_SORT_KEY = 'C';
const MESSAGES = {
  SUCCESS_OPERATION: '操作成功完成',
} as const;

/** 和弦分组相关弹窗的状态与动作集合：创建/重命名/删除/移动/排序/批量删指法/引用反查 */
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

  /** 打开新建分组弹窗，清空上次输入 */
  const openCreate = () => {
    modalData.inputValue = '';
    modals.create = true;
  };

  /** 确认创建分组：校验非空与重名后写入 chordStore */
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

  /** 打开重命名弹窗并预填当前分组名 */
  const openRename = (group: Group) => {
    modalData.activeGroup = group;
    modalData.inputValue = group.name;
    modals.rename = true;
  };

  /** 确认重命名分组 */
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

  /** 打开删除分组确认弹窗 */
  const openDelete = (group: Group) => {
    modalData.activeGroup = group;
    modals.delete = true;
  };

  /** 确认删除分组：联动编辑器复位与歌曲解绑，toast 提供 4 秒撤销（分组快照 + 和弦撤销 + 绑定恢复） */
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

  /** 打开移动和弦弹窗，重置目标分组选择 */
  const openMove = (chord: Chord) => {
    modalData.activeChord = chord;
    modalData.moveTargetId = '';
    modals.move = true;
  };

  /** 确认移动：按和弦名把该分组下所有变体指法移到目标分组 */
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

  /** 移动弹窗中目标分组的样式态：源分组禁用、已选中高亮、其余常态 */
  const getGroupClass = (groupId: string) => {
    if (groupId === modalData.activeChord?.groupId) return 'is-disabled';
    if (modalData.moveTargetId === groupId) return 'is-selected';
    return 'is-normal';
  };

  /** 打开排序配置弹窗，回填分组当前的排序规则 */
  const openSort = (group: Group) => {
    modalData.activeGroup = group;
    modalData.sortRule = group.sortRule || DEFAULT_GROUP_SORT_RULE;
    modalData.sortKey = getGroupSortKey(group) || DEFAULT_SORT_KEY;
    modals.sort = true;
  };

  /** 确认保存排序配置 */
  const handleSaveSort = () => {
    if (modalData.activeGroup) {
      chordStore.updateGroupSort(modalData.activeGroup.id, modalData.sortRule, modalData.sortKey);
    }
    modals.sort = false;
    uiStore.toast.success('排序配置已更新');
  };

  /** 打开批量删除指法弹窗，清空上次的勾选 */
  const openChordVariantsDelete = (cardData: GroupedChordCard) => {
    modalData.activeGroupCard = cardData;
    modalData.selectedVariantIds.clear();
    modals.chordVariantsDelete = true;
  };

  /** 勾选/取消勾选一个待删除的变体指法 */
  const toggleVariantSelection = (chordId: string) => {
    const set = modalData.selectedVariantIds;
    if (set.has(chordId)) {
      set.delete(chordId);
    } else {
      set.add(chordId);
    }
  };

  /** 确认删除勾选的指法（走统一删除流程，可撤销） */
  const handleDeleteSelectedVariants = () => {
    if (!modalData.activeGroupCard || modalData.selectedVariantIds.size === 0) {
      uiStore.toast.warning('请至少选择一个要删除的指法');
      return;
    }
    const chordsToDelete = modalData.activeGroupCard.variants.filter(v => modalData.selectedVariantIds.has(v.id));
    chordActions.triggerDeleteChords(chordsToDelete);
    modals.chordVariantsDelete = false;
  };

  /** 确认删除该分组卡片的全部指法 */
  const handleDeleteAllVariants = () => {
    if (!modalData.activeGroupCard) return;
    chordActions.triggerDeleteChords(modalData.activeGroupCard.variants);
    modals.chordVariantsDelete = false;
  };

  /** 打开和弦引用反查弹窗：准备和弦名与全部变体 id，供展示被哪些歌曲槽位引用 */
  const openChordReferences = (cardData: GroupedChordCard) => {
    const ids = Array.from(new Set(cardData.variants.map(v => v.id)));
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
