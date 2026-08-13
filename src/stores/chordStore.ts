import { STORAGE_KEYS } from '@/constants';
import type { Chord, Group, GroupedChordCard, GroupSortRule } from '@/types';
import { normalizeChord } from '@/utils/chordMap';
import { cloneDeep, cloneGuitarStrings } from '@/utils/cloneDeep';
import { generateUUID } from '@/utils/id';
import { computeChordFingerprint, computeIsInverted, sortChordsByRule } from '@/utils/musicTheory';
import { debounceFilter, useEventListener, useRefHistory, useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, toRaw } from 'vue';

const DEFAULT_SORT_RULE: GroupSortRule = 'ROOT_PITCH';

export type ChordValidationResult =
  | { ok: true; payload: Chord; cleanName: string }
  | {
      ok: false;
      reason: 'EMPTY_NAME' | 'NO_GROUPS' | 'NO_SELECTED_GROUP' | 'DUPLICATE_FINGERPRINT' | 'UNCHANGED';
      cleanName?: string;
    };

function nameKeyOf(chordName: string): string {
  return chordName.trim().toLowerCase();
}

function sortVariants(variants: Chord[]): Chord[] {
  return [...variants].sort((a, b) => {
    const aInv = a.isInverted ?? false;
    const bInv = b.isInverted ?? false;
    if (aInv !== bInv) return aInv ? 1 : -1;
    return (a.capo ?? 0) - (b.capo ?? 0);
  });
}

function toGroupedCard(variants: Chord[]): GroupedChordCard {
  const sorted = variants.length > 1 ? sortVariants(variants) : variants;
  return {
    mainChord: sorted[0],
    variants: sorted,
    hasVariants: sorted.length > 1,
    variantCount: sorted.length,
  };
}

export const useChordStore = defineStore('chord', () => {
  const savedChordsList = useStorage<Chord[]>(STORAGE_KEYS.CHORD_LIST, [], localStorage, {
    eventFilter: debounceFilter(400, { maxWait: 1500 }),
  });
  const groups = useStorage<Group[]>(STORAGE_KEYS.GROUPS, [], localStorage, {
    eventFilter: debounceFilter(400, { maxWait: 1500 }),
  });
  const selectedGroupId = useStorage<string | null>(STORAGE_KEYS.CURR_GROUP_ID, null);

  const flushChordsAndGroupsNow = () => {
    try {
      localStorage.setItem(STORAGE_KEYS.CHORD_LIST, JSON.stringify(savedChordsList.value));
      localStorage.setItem(STORAGE_KEYS.GROUPS, JSON.stringify(groups.value));
    } catch (err) {
      console.error('[chordStore] flush on unload failed:', err);
    }
  };
  useEventListener(window, 'beforeunload', flushChordsAndGroupsNow);
  useEventListener(document, 'visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushChordsAndGroupsNow();
  });

  {
    let needUpdate = false;
    const aligned = savedChordsList.value.map(c => {
      const { chord, changed } = normalizeChord(c);
      if (changed) needUpdate = true;
      return chord;
    });
    if (needUpdate) savedChordsList.value = aligned;
  }

  const { undo: rawUndo } = useRefHistory(savedChordsList, {
    capacity: 15,
    deep: true,
    flush: 'post',
    clone: v => cloneDeep(toRaw(v)),
  });

  const groupChordMap = computed(() => {
    const map = new Map<string, Chord[]>();
    groups.value.forEach(g => map.set(g.id, []));
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
      const key = nameKeyOf(chord.chordName);
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
        const key = nameKeyOf(chord.chordName);
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
    const q = searchQuery.toLowerCase().trim();
    if (!q) return cards;
    return cards.filter(c => c.mainChord.chordName.toLowerCase().includes(q));
  };

  const getFilteredChords = (
    groupId: string,
    options: { searchQuery?: string; sortRule?: GroupSortRule; sortKey?: string } = {}
  ): Chord[] => {
    const { searchQuery = '', sortRule, sortKey } = options;
    const q = searchQuery.toLowerCase().trim();

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
      list = list.filter(c => c.chordName.toLowerCase().includes(q));
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
    groups.value.forEach(g => {
      g.collapsed = true;
    });
  };

  const selectAndExpandGroup = (id: string | null) => {
    if (!id) {
      collapseAllGroups();
      selectedGroupId.value = null;
      return;
    }
    groups.value.forEach(g => {
      g.collapsed = g.id !== id;
    });
    selectedGroupId.value = id;
  };

  const toggleGroupCollapsed = (groupId: string) => {
    const g = groups.value.find(x => x.id === groupId);
    if (!g) return;
    if (g.collapsed) {
      selectAndExpandGroup(groupId);
    } else {
      g.collapsed = true;
      if (selectedGroupId.value === groupId) selectedGroupId.value = null;
    }
  };

  const addGroup = (name: string, sortRule: GroupSortRule = DEFAULT_SORT_RULE): Group => {
    const group: Group = {
      id: generateUUID(),
      name,
      collapsed: false,
      sortRule,
    };
    groups.value = [...groups.value.map(g => ({ ...g, collapsed: true })), { ...group, collapsed: false }];
    selectedGroupId.value = group.id;
    return group;
  };

  const renameGroup = (groupId: string, name: string) => {
    const g = groups.value.find(x => x.id === groupId);
    if (!g || g.name === name) return;
    g.name = name;
  };

  const updateGroupSort = (groupId: string, sortRule: GroupSortRule, sortKey?: string) => {
    const g = groups.value.find(x => x.id === groupId);
    if (!g) return;
    const targetKey = sortRule === 'KEY_DEGREE' ? sortKey || g.sortKey || 'C' : g.sortKey;
    if (g.sortRule === sortRule && g.sortKey === targetKey) return;
    g.sortRule = sortRule;
    if (sortRule === 'KEY_DEGREE') {
      g.sortKey = targetKey;
    }
  };

  const deleteGroup = (groupId: string) => {
    savedChordsList.value = savedChordsList.value.filter(c => c.groupId !== groupId);
    groups.value = groups.value.filter(g => g.id !== groupId);
    if (selectedGroupId.value === groupId) {
      const next = groups.value[0];
      if (next) selectAndExpandGroup(next.id);
      else selectedGroupId.value = null;
    }
  };

  const replaceAllData = (
    data: { groups: Group[]; chords: Chord[] },
    options: { collapseAll?: boolean; clearSelection?: boolean } = {}
  ) => {
    const { collapseAll = true, clearSelection = true } = options;
    const nextGroups = collapseAll ? data.groups.map(g => ({ ...g, collapsed: true })) : data.groups;
    groups.value = [...nextGroups];
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
      if (c.groupId === sourceGroupId && nameKeyOf(c.chordName) === targetName) {
        return { ...c, groupId: targetGroupId };
      }
      return c;
    });
  };

  const reorderGroupChords = (groupId: string, oldIndex: number, newIndex: number) => {
    const groupChords = savedChordsList.value.filter(c => c.groupId === groupId);
    if (oldIndex < 0 || oldIndex >= groupChords.length || newIndex < 0 || newIndex >= groupChords.length) return;
    const [moved] = groupChords.splice(oldIndex, 1);
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
        collapsed: false,
        sortRule: DEFAULT_SORT_RULE,
      };
      groups.value = [recoveryGroup, ...groups.value];
    }
    savedChordsList.value.forEach(chord => {
      if (!validGroupIds.has(chord.groupId)) chord.groupId = recoveryGroup!.id;
    });
  };

  const repairFingerprints = (): number => {
    let repairedCount = 0;
    const repairedList = savedChordsList.value.map(c => {
      const { chord, changed } = normalizeChord(c);
      if (changed) repairedCount++;
      return chord;
    });
    if (repairedCount > 0) overwriteChords(repairedList);
    return repairedCount;
  };

  const removeChords = (chords: Chord[]): Set<string> => {
    const targetIds = new Set<string>();
    chords.forEach(c => {
      if (c.id) targetIds.add(c.id);
      if (c.fingerprint) targetIds.add(c.fingerprint);
    });
    if (targetIds.size === 0) return targetIds;
    savedChordsList.value = savedChordsList.value.filter(c => !targetIds.has(c.id) && !targetIds.has(c.fingerprint));
    return targetIds;
  };

  const removeVariantsByName = (groupId: string, chordName: string): string[] => {
    const targetName = nameKeyOf(chordName);
    const matchedIds = savedChordsList.value
      .filter(c => c.groupId === groupId && nameKeyOf(c.chordName) === targetName)
      .map(c => c.id);
    if (matchedIds.length === 0) return matchedIds;
    const idSet = new Set(matchedIds);
    savedChordsList.value = savedChordsList.value.filter(c => !idSet.has(c.id));
    return matchedIds;
  };

  const buildChordForSave = (draft: Chord, isEditing: boolean): ChordValidationResult => {
    const cleanName = draft.chordName.trim();
    const isFretBoardEmpty = draft.strings.every(s => s.fret < 0);
    if (!cleanName || isFretBoardEmpty) {
      return { ok: false, reason: 'EMPTY_NAME' };
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
    const isInvertedState = computeIsInverted(currentStrings, draft.capo, draft.tuning, cleanName);

    const rawPayload: Omit<Chord, 'fingerprint'> = {
      id: id || 'c_' + generateUUID().slice(0, 10),
      chordName: cleanName,
      strings: currentStrings,
      fretCount: draft.fretCount,
      capo: draft.capo,
      groupId: targetGroupId,
      tuning: draft.tuning,
      isInverted: isInvertedState,
    };
    const payload: Chord = { ...rawPayload, fingerprint: computeChordFingerprint(rawPayload) };

    if (isEditing) {
      const original = savedChordsList.value.find(c => c.id === id);
      if (original && original.fingerprint === payload.fingerprint) {
        return { ok: false, reason: 'UNCHANGED' };
      }
    }

    const isDuplicate = savedChordsList.value.some(
      existing =>
        existing.id !== id && existing.groupId === payload.groupId && existing.fingerprint === payload.fingerprint
    );
    if (isDuplicate) {
      return { ok: false, reason: 'DUPLICATE_FINGERPRINT', cleanName };
    }

    return { ok: true, payload, cleanName };
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
    removeChordsByIds,
    moveChordsToGroup,
    moveVariantsByName,
    executeUndoRestore,
    repairFingerprints,
    reorderGroupChords,
    removeChords,
    removeVariantsByName,
    buildChordForSave,
    replaceAllData,
  };
});
