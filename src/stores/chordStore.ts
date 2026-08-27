import { createChordRepository } from '@/services/repositories';
import type { Chord, Group, GroupedChordCard } from '@/types';
import { GroupSortRule } from '@/types';
import { cloneDeep, cloneGuitarStrings, generateUUID } from '@/utils/core/common';
import { STORAGE_KEYS } from '@/utils/core/constants';
import { normalizeChord } from '@/utils/music/chord-fretboard';
import { createChord, createGroup } from '@/utils/music/entityFactories';
import {
  type ChordOrName,
  computeChordFingerprint,
  computeIsInverted,
  getChordName,
  isValidChordName,
  matchChordSearch,
  segmentsToString,
  sortChordsByRule,
  validateBassConsistency,
} from '@/utils/music/musicTheory';
import { useRefHistory, useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, toRaw } from 'vue';

const DEFAULT_SORT_RULE: GroupSortRule = GroupSortRule.ROOT_PITCH;

type ChordValidationResult =
  | { ok: true; payload: Chord; cleanName: string; warn?: string | null }
  | {
      ok: false;
      reason:
        | 'EMPTY_NAME'
        | 'INVALID_CHORD_SYNTAX'
        | 'NO_GROUPS'
        | 'NO_SELECTED_GROUP'
        | 'DUPLICATE_FINGERPRINT'
        | 'UNCHANGED';
      cleanName?: string;
    };

function nameKeyOf(chordOrName: string | ChordOrName): string {
  if (typeof chordOrName === 'string') return chordOrName.trim().toLowerCase();
  return getChordName(chordOrName).trim().toLowerCase();
}

function sortVariants(variants: Chord[]): Chord[] {
  return [...variants].sort((a, b) => {
    const aInv = computeIsInverted(a.strings, a.capo, a.tuning, a, a.rootStringIndex);
    const bInv = computeIsInverted(b.strings, b.capo, b.tuning, b, b.rootStringIndex);
    if (aInv !== bInv) return aInv ? 1 : -1;
    return (a.capo ?? 0) - (b.capo ?? 0);
  });
}

function toGroupedCard(variants: Chord[]): GroupedChordCard {
  const sorted = variants.length > 1 ? sortVariants(variants) : variants;
  return {
    mainChord: sorted[0]!,
    variants: sorted,
    hasVariants: sorted.length > 1,
    variantCount: sorted.length,
  };
}

export const useChordStore = defineStore('chord', () => {
  const chordRepository = createChordRepository(localStorage);
  // 不启用防抖：任何变更（保存/删除/排序/换组）立即写入 localStorage，
  // 避免刷新时落入防抖窗口导致数据回退
  const savedChordsList = useStorage<Chord[]>(STORAGE_KEYS.CHORD_LIST, [], localStorage);
  const groups = useStorage<Group[]>(STORAGE_KEYS.GROUPS, [], localStorage);
  const selectedGroupId = useStorage<string | null>(STORAGE_KEYS.CURR_GROUP_ID, null);
  // 只允许同时展开一个分组：单一展开状态持久化，刷新后恢复
  const expandedGroupId = useStorage<string | null>(STORAGE_KEYS.EXPANDED_GROUP_ID, null);
  const isGroupCollapsed = (groupId: string): boolean => expandedGroupId.value !== groupId;
  const isAnyGroupExpanded = computed(() => expandedGroupId.value !== null);

  // 数据通过 useStorage 自动持久化，无需手动 flush（原空实现移除）

  {
    const sanitized = chordRepository.load();
    if (JSON.stringify(sanitized.groups) !== JSON.stringify(groups.value)) groups.value = sanitized.groups;
    if (JSON.stringify(sanitized.chords) !== JSON.stringify(savedChordsList.value))
      savedChordsList.value = sanitized.chords;
  }

  // 每次提交都会克隆整个和弦列表，容量控制在 8 份以限制内存驻留
  const { undo: rawUndo } = useRefHistory(savedChordsList, {
    capacity: 8,
    deep: true,
    flush: 'post',
    clone: v => cloneDeep(toRaw(v)),
  });

  const groupChordMap = computed(() => {
    const map = new Map<string, Chord[]>();
    savedChordsList.value.forEach(chord => {
      const list = map.get(chord.groupId);
      if (list) list.push(chord);
      else map.set(chord.groupId, [chord]);
    });
    return map;
  });

  const multiFingeringData = computed(() => {
    const byGroup = new Map<string, Map<string, Chord[]>>();
    savedChordsList.value.forEach(chord => {
      const key = nameKeyOf(chord);
      let nameMap = byGroup.get(chord.groupId);
      if (!nameMap) {
        nameMap = new Map();
        byGroup.set(chord.groupId, nameMap);
      }
      const list = nameMap.get(key);
      if (list) list.push(chord);
      else nameMap.set(key, [chord]);
    });

    const result = new Map<string, Map<string, GroupedChordCard>>();
    byGroup.forEach((nameMap, groupId) => {
      const multiMap = new Map<string, GroupedChordCard>();
      nameMap.forEach((variants, key) => {
        if (variants.length <= 1) return;
        multiMap.set(key, toGroupedCard(variants));
      });
      if (multiMap.size > 0) result.set(groupId, multiMap);
    });
    return result;
  });

  const getMultiFingering = (groupId: string, chordName: string): GroupedChordCard | null => {
    if (!groupId || !chordName) return null;
    return multiFingeringData.value.get(groupId)?.get(nameKeyOf(chordName)) ?? null;
  };

  const groupedChordMap = computed(() => {
    const result = new Map<string, GroupedChordCard[]>();
    groups.value.forEach(group => {
      const chords = groupChordMap.value.get(group.id) ?? [];
      const multi = multiFingeringData.value.get(group.id);
      const visited = new Set<string>();
      const cards: GroupedChordCard[] = [];

      chords.forEach(chord => {
        const key = nameKeyOf(chord);
        if (visited.has(key)) return;
        visited.add(key);
        cards.push(multi?.get(key) ?? toGroupedCard([chord]));
      });

      const sortedMains = sortChordsByRule(
        cards.map(c => c.mainChord),
        group.sortRule ?? DEFAULT_SORT_RULE,
        group.sortKey ?? 'C'
      );
      const byMainId = new Map(cards.map(c => [c.mainChord.id, c]));
      result.set(group.id, sortedMains.map(m => byMainId.get(m.id)!).filter(Boolean));
    });
    return result;
  });

  const getGroupedCards = (groupId: string, searchQuery = ''): GroupedChordCard[] => {
    const cards = groupedChordMap.value.get(groupId) ?? [];
    const q = searchQuery.trim();
    if (!q) return cards;
    return cards.filter(card => matchChordSearch(card.mainChord, q));
  };

  const getFilteredChords = (
    groupId: string,
    options: {
      searchQuery?: string;
      sortRule?: GroupSortRule;
      sortKey?: string;
    } = {}
  ): Chord[] => {
    const { searchQuery = '', sortRule, sortKey } = options;
    const q = searchQuery.trim();

    if (groupId !== 'ALL') {
      const group = groups.value.find(g => g.id === groupId);
      const effectiveRule = sortRule ?? group?.sortRule ?? DEFAULT_SORT_RULE;
      const effectiveKey = sortKey ?? group?.sortKey ?? 'C';
      const cards = getGroupedCards(groupId, q);
      const chords = cards.flatMap(card => card.variants);
      return sortChordsByRule(chords, effectiveRule, effectiveKey);
    }

    let list = savedChordsList.value;
    if (q) {
      list = list.filter(c => matchChordSearch(c, q));
    }
    const effectiveRule = sortRule ?? DEFAULT_SORT_RULE;
    const effectiveKey = sortKey ?? 'C';
    return sortChordsByRule(list, effectiveRule, effectiveKey);
  };

  const overwriteChords = (newChords: Chord[]) => {
    savedChordsList.value = [...newChords];
  };

  const overwriteGroups = (newGroups: Group[]) => {
    groups.value = [...newGroups];
  };

  const setSelectedGroupId = (id: string | null) => {
    selectedGroupId.value = id;
  };

  const collapseAllGroups = () => {
    expandedGroupId.value = null;
  };

  const selectAndExpandGroup = (id: string | null) => {
    if (!id) {
      collapseAllGroups();
      selectedGroupId.value = null;
      return;
    }
    expandedGroupId.value = id;
    selectedGroupId.value = id;
  };

  const toggleGroupCollapsed = (groupId: string) => {
    const g = groups.value.find(x => x.id === groupId);
    if (!g) return;
    if (expandedGroupId.value === groupId) {
      // 折叠当前展开的分组
      expandedGroupId.value = null;
      if (selectedGroupId.value === groupId) selectedGroupId.value = null;
    } else {
      // 展开该分组（同时只展开这一个，其余自动折叠）
      expandedGroupId.value = groupId;
      selectedGroupId.value = groupId;
    }
  };

  const addGroup = (name: string, sortRule: GroupSortRule = DEFAULT_SORT_RULE): Group => {
    const group = createGroup(name, sortRule);
    expandedGroupId.value = group.id;
    groups.value = [...groups.value, group];
    selectedGroupId.value = group.id;
    return group;
  };

  const renameGroup = (groupId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const g = groups.value.find(x => x.id === groupId);
    if (!g || g.name === trimmed) return;
    groups.value = groups.value.map(item => (item.id === groupId ? { ...item, name: trimmed } : item));
  };

  const updateGroupSort = (groupId: string, sortRule: GroupSortRule, sortKey?: string) => {
    const g = groups.value.find(x => x.id === groupId);
    if (!g) return;
    if (sortRule === GroupSortRule.KEY_DEGREE) {
      const targetKey = sortKey || g.sortKey || 'C';
      if (g.sortRule === sortRule && g.sortKey === targetKey) return;
      groups.value = groups.value.map(item => (item.id === groupId ? { ...item, sortRule, sortKey: targetKey } : item));
    } else {
      if (g.sortRule === sortRule && g.sortKey === undefined) return;
      groups.value = groups.value.map(item => {
        if (item.id === groupId) {
          const updated = { ...item, sortRule };
          delete updated.sortKey;
          return updated;
        }
        return item;
      });
    }
  };

  const deleteGroup = (groupId: string) => {
    savedChordsList.value = savedChordsList.value.filter(c => c.groupId !== groupId);
    groups.value = groups.value.filter(g => g.id !== groupId);
    if (expandedGroupId.value === groupId) expandedGroupId.value = null;
    if (selectedGroupId.value === groupId) {
      selectedGroupId.value = null;
    }
  };

  const replaceAllData = (
    data: { groups: Group[]; chords: Chord[] },
    options: { collapseAll?: boolean; clearSelection?: boolean } = {}
  ) => {
    const { collapseAll = true, clearSelection = true } = options;
    groups.value = [...data.groups];
    expandedGroupId.value = collapseAll ? null : (data.groups[0]?.id ?? null);
    savedChordsList.value = [...data.chords];
    if (clearSelection) selectedGroupId.value = null;
  };

  const addChord = (chord: Chord) => {
    savedChordsList.value = [chord, ...savedChordsList.value];
  };

  const updateChord = (chord: Chord) => {
    const idx = savedChordsList.value.findIndex(c => c.id === chord.id);
    if (idx < 0) return;
    const next = [...savedChordsList.value];
    next[idx] = chord;
    savedChordsList.value = next;
  };

  /**
   * 立即将和弦列表写入 localStorage（绕过 useStorage 的 400ms 防抖）。
   * 供保存动作成功后调用，避免用户保存后立刻刷新时横按等数据尚未落盘而丢失。
   */
  const flushChordsToStorage = () => {
    try {
      localStorage.setItem(STORAGE_KEYS.CHORD_LIST, JSON.stringify(toRaw(savedChordsList.value)));
    } catch {
      // 存储失败静默忽略（与 useStorage 行为一致）
    }
  };

  const removeChordsByIds = (ids: string[]) => {
    if (ids.length === 0) return;
    const set = new Set(ids);
    savedChordsList.value = savedChordsList.value.filter(c => !set.has(c.id));
  };

  const moveChordsToGroup = (chordIds: string[], targetGroupId: string) => {
    if (!groups.value.some(g => g.id === targetGroupId)) return;
    const set = new Set(chordIds);
    savedChordsList.value = savedChordsList.value.map(c => (set.has(c.id) ? { ...c, groupId: targetGroupId } : c));
  };

  const moveVariantsByName = (sourceGroupId: string, chordName: string, targetGroupId: string) => {
    if (!groups.value.some(g => g.id === targetGroupId)) return;
    const targetName = nameKeyOf(chordName);
    savedChordsList.value = savedChordsList.value.map(c => {
      if (c.groupId === sourceGroupId && nameKeyOf(c) === targetName) {
        return { ...c, groupId: targetGroupId };
      }
      return c;
    });
  };

  const reorderGroupChords = (groupId: string, oldIndex: number, newIndex: number) => {
    const groupChords = savedChordsList.value.filter(c => c.groupId === groupId);
    if (oldIndex < 0 || oldIndex >= groupChords.length || newIndex < 0 || newIndex >= groupChords.length) return;
    const [moved] = groupChords.splice(oldIndex, 1);
    if (moved === undefined) return;
    groupChords.splice(newIndex, 0, moved);
    const otherGroupsChords = savedChordsList.value.filter(c => c.groupId !== groupId);
    savedChordsList.value = [...otherGroupsChords, ...groupChords];
  };

  const executeUndoRestore = () => {
    rawUndo();
    const validGroupIds = new Set(groups.value.map(g => g.id));
    let hasOrphans = false;
    savedChordsList.value.forEach(chord => {
      if (!validGroupIds.has(chord.groupId)) hasOrphans = true;
    });
    if (!hasOrphans) return;

    let recoveryGroup = groups.value.find(g => g.id.startsWith('g_recovery_'));
    if (!recoveryGroup) {
      recoveryGroup = {
        id: 'g_recovery_' + generateUUID().slice(0, 8),
        name: '已恢复的和弦',
        sortRule: DEFAULT_SORT_RULE,
      };
      groups.value = [recoveryGroup, ...groups.value];
    }
    savedChordsList.value.forEach(chord => {
      if (!validGroupIds.has(chord.groupId)) chord.groupId = recoveryGroup!.id;
    });
  };

  const repairData = (): number => {
    let repairedCount = 0;
    const repairedList = savedChordsList.value.map(c => {
      const { chord, changed } = normalizeChord(c);
      if (changed) repairedCount++;
      return chord;
    });
    if (repairedCount > 0) overwriteChords(repairedList);
    return repairedCount;
  };

  /**
   * 按 id 精确删除指定和弦列表。
   *
   * 注意：此函数被 triggerDeleteChords（UI 删除选中项）调用，
   * 必须严格按 id 匹配，不使用指纹兜底——避免两个指法相同但 id 不同的和弦
   * 在用户只删其一时被连带误删。
   * 返回被删除的 id 集合，供调用方同步解绑歌曲中的引用。
   */
  const removeChords = (chords: Chord[]): Set<string> => {
    const targetIds = new Set<string>();
    chords.forEach(c => {
      if (c.id) targetIds.add(c.id);
    });
    if (targetIds.size === 0) return targetIds;
    savedChordsList.value = savedChordsList.value.filter(c => !targetIds.has(c.id));
    return targetIds;
  };

  const removeVariantsByName = (groupId: string, chordName: string): string[] => {
    const targetName = nameKeyOf(chordName);
    const matchedIds = savedChordsList.value
      .filter(c => c.groupId === groupId && nameKeyOf(c) === targetName)
      .map(c => c.id);
    if (matchedIds.length === 0) return matchedIds;
    const idSet = new Set(matchedIds);
    savedChordsList.value = savedChordsList.value.filter(c => !idSet.has(c.id));
    return matchedIds;
  };

  const buildChordForSave = (draft: Chord, isEditing: boolean): ChordValidationResult => {
    const nameSegments = draft.nameSegments;
    const cleanName = nameSegments ? segmentsToString(nameSegments) : '';
    const isFretBoardEmpty = draft.strings.every(s => s[0] < 0);
    if (!cleanName || isFretBoardEmpty) {
      return { ok: false, reason: 'EMPTY_NAME' };
    }
    if (!nameSegments || !isValidChordName(cleanName)) {
      return { ok: false, reason: 'INVALID_CHORD_SYNTAX', cleanName };
    }
    if (groups.value.length === 0) {
      return { ok: false, reason: 'NO_GROUPS' };
    }
    if (!selectedGroupId.value) {
      return { ok: false, reason: 'NO_SELECTED_GROUP' };
    }

    const id = isEditing ? draft.id : null;
    const targetGroupId = isEditing
      ? savedChordsList.value.find(c => c.id === id)?.groupId || selectedGroupId.value
      : selectedGroupId.value;

    const currentStrings = cloneGuitarStrings(draft.strings);
    // 根音标记须指向有效且已按音的弦，否则按未指定处理
    const rootStringIndex =
      draft.rootStringIndex !== null &&
      draft.rootStringIndex !== undefined &&
      draft.rootStringIndex >= 0 &&
      draft.rootStringIndex < currentStrings.length &&
      (currentStrings[draft.rootStringIndex]?.[0] ?? -1) >= 0
        ? draft.rootStringIndex
        : null;

    const payload = createChord({
      id,
      nameSegments,
      strings: currentStrings,
      fretCount: draft.fretCount,
      capo: draft.capo,
      groupId: targetGroupId,
      tuning: draft.tuning,
      rootStringIndex,
      barres: draft.barres,
    });
    const fingerprint = computeChordFingerprint(payload);

    if (isEditing) {
      const original = savedChordsList.value.find(c => c.id === id);
      // 指纹不含 barres，因此"仅修改横按"时指纹不变；需同时比较 barres 才能识别真正的无修改
      const sameBarres = JSON.stringify(original?.barres ?? undefined) === JSON.stringify(payload.barres ?? undefined);
      if (original && computeChordFingerprint(original) === fingerprint && sameBarres) {
        return { ok: false, reason: 'UNCHANGED' };
      }
    }

    const isDuplicate = savedChordsList.value.some(
      existing =>
        existing.id !== id && existing.groupId === payload.groupId && computeChordFingerprint(existing) === fingerprint
    );
    if (isDuplicate) {
      return { ok: false, reason: 'DUPLICATE_FINGERPRINT', cleanName };
    }

    const bassWarn = validateBassConsistency(payload.strings, payload.capo, payload.tuning, payload);
    return { ok: true, payload, cleanName, warn: bassWarn };
  };

  return {
    savedChordsList,
    groups,
    selectedGroupId,
    groupChordMap,
    multiFingeringData,
    groupedChordMap,
    getMultiFingering,
    getGroupedCards,
    getFilteredChords,
    overwriteChords,
    overwriteGroups,
    isGroupCollapsed,
    isAnyGroupExpanded,
    setSelectedGroupId,
    selectAndExpandGroup,
    toggleGroupCollapsed,
    collapseAllGroups,
    addGroup,
    renameGroup,
    updateGroupSort,
    deleteGroup,
    addChord,
    updateChord,
    flushChordsToStorage,
    removeChordsByIds,
    moveChordsToGroup,
    moveVariantsByName,
    executeUndoRestore,
    repairData,
    reorderGroupChords,
    removeChords,
    removeVariantsByName,
    buildChordForSave,
    replaceAllData,
  };
});
