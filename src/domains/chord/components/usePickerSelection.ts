import { computed, nextTick, ref, watch } from 'vue';

import { useChordStore } from '@/domains/chord/store/chordStore';
import { getGroupSortKey } from '@/domains/chord/theory/entityFactories';
import { GroupSortRule } from '@/domains/chord/types';
import { isString } from '@/platform/utils/common';

import { buildChordSections } from './ChordPickerPanel.logic';

import type { ChordPickerSection } from './ChordPickerPanel.logic';
import type { Chord } from '@/domains/chord/types';

export interface UsePickerSelectionOptions {
  /** 宿主上下文标识（如当前乐谱 / 文档 id）：其值变化即清空选择记忆 */
  contextKey: () => string | number | null | undefined;
  /** 回到列表顶部（由 usePickerVirtualList 提供） */
  resetScrollTop: () => void;
  /** 写激活分区（由 usePickerVirtualList 提供） */
  setActiveSectionId: (id: string | null) => void;
}

/**
 * 选择器的**选择状态**：分组页签 / 搜索词 / 排序规则 / 调式键，以及由它们派生的过滤结果与分区。
 *
 * 两条不变量（改动本文件前先读这两条）：
 * 1. **面板不读取宿主的任何状态**：不预选分组、不滚动定位、也不高亮「已绑定」卡片，和弦的取用只经
 *    「把卡片交给宿主」一条路径完成（拖拽 dragChordStarter / 点击 select）。
 * 2. **只记忆「用户上次用过的选择」**，不跟随宿主的当前选中；记忆在宿主上下文（contextKey）变化时清空。
 */
export function usePickerSelection({ contextKey, resetScrollTop, setActiveSectionId }: UsePickerSelectionOptions) {
  const chordStore = useChordStore();

  const selectedGroupId = ref<string>('ALL');
  const pickerSearchQuery = ref<string>('');
  const sortOverride = ref<GroupSortRule>(GroupSortRule.ROOT_PITCH);
  const tempSortKey = ref<string>('C');
  const savedUserPickerState = ref<{
    groupId: string;
    sortRule: GroupSortRule;
    sortKey: string;
  } | null>(null);

  const groupTabOptions = computed(() => {
    const totalCount = chordStore.savedChordsList.length;
    const options: { label: string; value: string; count: number }[] = [
      { label: '全部和弦', value: 'ALL', count: totalCount },
    ];
    chordStore.groups.forEach(g => {
      const count = chordStore.groupChordMap.get(g.id)?.length ?? 0;
      options.push({ label: g.name, value: g.id, count });
    });
    return options;
  });

  /* 面板不读取宿主的任何状态：不预选分组、不滚动定位、也不高亮「已绑定」卡片，
     和弦的取用只经「把卡片交给宿主」一条路径完成（拖拽 dragChordStarter / 点击 select） */

  /** 取分组的默认排序规则与调式键（"全部"固定按根音音高 + C 调） */
  const getDefaultSortForGroup = (groupId: string): { sortRule: GroupSortRule; sortKey: string } => {
    if (groupId === 'ALL') return { sortRule: GroupSortRule.ROOT_PITCH, sortKey: 'C' };
    const targetGroup = chordStore.groups.find(g => g.id === groupId);
    return {
      sortRule: targetGroup?.sortRule || GroupSortRule.ROOT_PITCH,
      sortKey: targetGroup ? getGroupSortKey(targetGroup) || 'C' : 'C',
    };
  };

  /** 记录用户当前的选择器状态（分组/排序规则/调式键），下次打开抽屉时恢复 */
  const saveUserPickerState = () => {
    savedUserPickerState.value = {
      groupId: selectedGroupId.value,
      sortRule: sortOverride.value,
      sortKey: tempSortKey.value,
    };
  };

  const groupNameMap = computed(() => new Map(chordStore.groups.map(g => [g.id, g.name])));

  const filteredChords = computed(() => {
    const activeGroup = chordStore.groups.find(g => g.id === selectedGroupId.value);
    const effectiveKey =
      sortOverride.value === GroupSortRule.KEY_DEGREE
        ? tempSortKey.value
        : activeGroup
          ? getGroupSortKey(activeGroup)
          : undefined;
    return chordStore.getFilteredChords(selectedGroupId.value, {
      searchQuery: pickerSearchQuery.value,
      sortRule: sortOverride.value,
      sortKey: effectiveKey,
    });
  });

  /** 根音类别解析与分区构建：纯逻辑见 ChordPickerPanel.logic.ts（含卡片 aria-label 的和弦名按需解析） */
  const chordSections = computed<ChordPickerSection[]>(() => buildChordSections(filteredChords.value));

  /** 取和弦所属分组的名称（"全部"视图下用于卡片左上角来源角标） */
  const getSourceGroupName = (chord: Chord) => groupNameMap.value.get(chord.groupId) ?? '';

  /** 用户切换分组页签：应用该组默认排序、记录状态并回到顶部 */
  const handleGroupTabChange = (newGid: string) => {
    selectedGroupId.value = newGid;
    const { sortRule, sortKey } = getDefaultSortForGroup(newGid);
    sortOverride.value = sortRule;
    tempSortKey.value = sortKey;
    saveUserPickerState();

    nextTick(() => {
      if (chordSections.value.length > 0) setActiveSectionId(chordSections.value[0]?.id ?? null);
    });
    resetScrollTop();
  };

  /** 用户切换排序规则：记录状态并回到顶部 */
  const handleSortRuleChange = (newRule: GroupSortRule) => {
    sortOverride.value = newRule;
    saveUserPickerState();
    resetScrollTop();
  };

  /** 用户切换调式键（仅"调内度数"排序时可用）：记录状态并回到顶部 */
  const handleSortKeyChange = (newKey: string | string[]) => {
    if (isString(newKey)) {
      tempSortKey.value = newKey;
      saveUserPickerState();
      resetScrollTop();
    }
  };

  /**
   * 面板每次打开时复位选择态：清搜索词，分组 / 排序只恢复「上次用过的选择」。
   *
   * ⚠️ 恢复前必须校验那个分组**仍然存在**：面板关闭期间用户完全可能把该分组删掉（分组管理就在
   * 同一页，不必离开面板上下文）。不校验的话会恢复到一个已不存在的页签 —— 列表空着、页签高亮着
   * 不存在的一项，用户得自己手点回「全部」才恢复。分组没了就整组回落默认，与「无记忆」同一条路。
   */
  const restoreForOpen = () => {
    pickerSearchQuery.value = '';
    const saved = savedUserPickerState.value;
    if (saved && (saved.groupId === 'ALL' || chordStore.groups.some(g => g.id === saved.groupId))) {
      selectedGroupId.value = saved.groupId;
      sortOverride.value = saved.sortRule;
      tempSortKey.value = saved.sortKey;
    } else {
      selectedGroupId.value = 'ALL';
      sortOverride.value = GroupSortRule.ROOT_PITCH;
      tempSortKey.value = 'C';
    }
  };

  /** 宿主上下文切换（如换乐谱 / 换文档）：清空选择记忆，下次打开回到默认分组与排序 */
  watch(contextKey, () => {
    savedUserPickerState.value = null;
  });

  return {
    selectedGroupId,
    pickerSearchQuery,
    sortOverride,
    tempSortKey,
    groupTabOptions,
    filteredChords,
    chordSections,
    getSourceGroupName,
    handleGroupTabChange,
    handleSortRuleChange,
    handleSortKeyChange,
    restoreForOpen,
  };
}
