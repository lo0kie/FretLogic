import { useChordActions } from '@/domains/chord/library/composables/useChordActions';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { getGroupSortKey } from '@/domains/chord/theory/entityFactories';
import { getChordName } from '@/domains/chord/theory/theory';
import { GroupSortRule } from '@/domains/chord/types';
import { useUiStore } from '@/platform/store/uiStore';
import { useModalController } from '@/platform/store/useModalController';

import type { Chord, Group, GroupedChordCard } from '@/domains/chord/types';

const DEFAULT_GROUP_SORT_RULE = 'ROOT_PITCH' as const;
const DEFAULT_SORT_KEY = 'C';
const MESSAGES = {
  SUCCESS_OPERATION: '操作成功完成',
} as const;

/** 和弦分组弹窗的模块级共享状态：保证任意组件取用的都是同一份开关与弹窗数据（与 useBackupModals 一致）。
 * 若放在函数体内，每次调用都会生成脱节副本——非容器组件调用 open 时弹窗容器收不到信号。 */
const { modals, modalData, open, close } = useModalController(
  {
    create: false,
    rename: false,
    delete: false,
    move: false,
    sort: false,
    chordVariantsDelete: false,
    chordReferences: false,
  },
  {
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
  }
);

/** 和弦分组相关弹窗的状态与动作集合：创建/重命名/删除/移动/排序/批量删指法/引用反查 */
export function useChordGroupModals() {
  const chordStore = useChordStore();
  const editorStore = useChordEditorStore();
  const uiStore = useUiStore();
  const chordActions = useChordActions();

  /** 打开新建分组弹窗，清空上次输入 */
  const openCreate = () => {
    open('create', { inputValue: '' });
  };

  /** 确认创建分组：校验非空与重名后写入 chordStore */
  const handleCreateGroup = () => {
    const val = modalData.inputValue.trim();
    if (!val) {
      uiStore.message.error('确认失败：请输入有效内容');
      return;
    }
    if (chordStore.groups.some(g => g.name === val)) {
      uiStore.message.warning('创建失败：该分组名称已存在');
      return;
    }
    chordStore.addGroup(val);
    close('create');
    uiStore.message.success(MESSAGES.SUCCESS_OPERATION);
  };

  /** 打开重命名弹窗并预填当前分组名 */
  const openRename = (group: Group) => {
    open('rename', { activeGroup: group, inputValue: group.name });
  };

  /** 确认重命名分组 */
  const handleRenameGroup = () => {
    const val = modalData.inputValue.trim();
    if (!val) {
      uiStore.message.error('确认失败：请输入有效内容');
      return;
    }
    const target = modalData.activeGroup;
    if (!target) {
      // 分组对象丢失（正常流程不会发生）：明确告警而非谎报成功
      uiStore.message.warning('重命名失败：未找到目标分组');
      close('rename');
      return;
    }
    if (val === target.name) {
      // 名称未变化：renameGroup 会静默 no-op，直接关窗即可，不发成功提示
      close('rename');
      return;
    }
    chordStore.renameGroup(target.id, val);
    close('rename');
    uiStore.message.success(MESSAGES.SUCCESS_OPERATION);
  };

  /** 打开删除分组确认弹窗 */
  const openDelete = (group: Group) => {
    open('delete', { activeGroup: group });
  };

  /** 确认删除分组：联动编辑器复位与歌曲解绑（删除/撤销事件经应用层桥接），message 提供 4 秒撤销 */
  const handleDeleteGroup = () => {
    if (!modalData.activeGroup) return;
    const targetGid = modalData.activeGroup.id;
    const groupName = modalData.activeGroup.name;
    // 记录精确删除快照（分组 + 原下标 + 名下和弦各自的原下标）：
    // 撤销时按原位插回——不走整表分组快照覆盖（删除后新建的分组不被抹掉）、
    // 不弹撤销历史栈顶（删除与撤销之间夹着的其它操作不受影响）；
    // 歌曲槽位解绑与撤销回填由 chordStore 删除/恢复事件经应用层桥接完成
    const deletion = chordStore.deleteGroup(targetGid);
    if (!deletion) return;

    if (editorStore.isEditing && editorStore.draftChord.groupId === targetGid) editorStore.resetEditor();

    close('delete');
    // 通知而非常驻 Message：撤销入口随 toast 飘走就没了，用户必须能回看并补做
    uiStore.notice.info({
      title: `已删除分组 "${groupName}"`,
      actionText: '撤销',
      onAction: () => {
        chordStore.restoreGroupDeletion(deletion);
        uiStore.message.success(`已恢复分组 "${groupName}"`);
      },
    });
  };

  /** 打开移动和弦弹窗，重置目标分组选择 */
  const openMove = (chord: Chord) => {
    open('move', { activeChord: chord, moveTargetId: '' });
  };

  /** 确认移动：按和弦名把该分组下所有变体指法移到目标分组 */
  const handleMoveChord = () => {
    if (!modalData.moveTargetId) {
      uiStore.message.error('确认失败：请选择有效分组');
      return;
    }
    const source = modalData.activeChord;
    if (!source) {
      uiStore.message.warning('移动失败：未找到源和弦');
      close('move');
      return;
    }
    if (modalData.moveTargetId === source.groupId) {
      // moveVariantsByName 对同组移动是静默 no-op，不谎报成功
      uiStore.message.warning('移动失败：目标分组与当前分组相同');
      return;
    }

    chordStore.moveVariantsByName(source.groupId, getChordName(source), modalData.moveTargetId);

    uiStore.clearActionMessages();
    close('move');
    uiStore.message.success(MESSAGES.SUCCESS_OPERATION);
  };

  /** 打开排序配置弹窗，回填分组当前的排序规则 */
  const openSort = (group: Group) => {
    open('sort', {
      activeGroup: group,
      sortRule: group.sortRule || DEFAULT_GROUP_SORT_RULE,
      sortKey: getGroupSortKey(group) || DEFAULT_SORT_KEY,
    });
  };

  /** 确认保存排序配置 */
  const handleSaveSort = () => {
    const target = modalData.activeGroup;
    if (!target) {
      // 分组对象丢失：明确告警而非谎报成功
      uiStore.message.warning('保存失败：未找到目标分组');
      close('sort');
      return;
    }
    const sortUnchanged =
      target.sortRule === modalData.sortRule &&
      (modalData.sortRule !== GroupSortRule.KEY_DEGREE ||
        (getGroupSortKey(target) || DEFAULT_SORT_KEY) === modalData.sortKey);
    if (sortUnchanged) {
      // 与 updateGroupSort 的静默 no-op 分支保持一致：值未变直接关窗，不发成功提示
      close('sort');
      return;
    }
    chordStore.updateGroupSort(target.id, modalData.sortRule, modalData.sortKey);
    close('sort');
    uiStore.message.success('排序配置已更新');
  };

  /** 打开批量删除指法弹窗，清空上次的勾选。
   *  referenceChordName 必须一并写入：modalData 是所有弹窗共用的单份对象，标题读它却不在 patch 里
   *  就会显示上一个弹窗残留的和弦名（弹窗常驻不卸载，表现为「名字不更新」） */
  const openChordVariantsDelete = (cardData: GroupedChordCard) => {
    open('chordVariantsDelete', {
      activeGroupCard: cardData,
      selectedVariantIds: new Set<string>(),
      referenceChordName: getChordName(cardData.mainChord),
    });
  };

  /** 勾选/取消勾选一个待删除的变体指法 */
  const toggleVariantSelection = (chordId: string) => {
    const set = modalData.selectedVariantIds;
    if (set.has(chordId)) set.delete(chordId);
    else set.add(chordId);
  };

  /** 确认删除勾选的指法（走统一删除流程，可撤销） */
  const handleDeleteSelectedVariants = () => {
    if (!modalData.activeGroupCard || modalData.selectedVariantIds.size === 0) {
      uiStore.message.warning('请至少选择一个要删除的指法');
      return;
    }
    const chordsToDelete = modalData.activeGroupCard.variants.filter(v => modalData.selectedVariantIds.has(v.id));
    chordActions.triggerDeleteChords(chordsToDelete);
    close('chordVariantsDelete');
  };

  /** 确认删除该分组卡片的全部指法 */
  const handleDeleteAllVariants = () => {
    if (!modalData.activeGroupCard) return;
    chordActions.triggerDeleteChords(modalData.activeGroupCard.variants);
    close('chordVariantsDelete');
  };

  /** 打开和弦引用反查弹窗：准备和弦名与全部变体 id，供展示被哪些歌曲槽位引用 */
  const openChordReferences = (cardData: GroupedChordCard) => {
    const ids = Array.from(new Set(cardData.variants.map(v => v.id)));
    open('chordReferences', { referenceChordIds: ids, referenceChordName: getChordName(cardData.mainChord) });
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
    openSort,
    handleSaveSort,
    openChordVariantsDelete,
    toggleVariantSelection,
    handleDeleteSelectedVariants,
    handleDeleteAllVariants,
    openChordReferences,
  };
}
