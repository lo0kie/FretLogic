// src/stores/chordStore.ts
import { STORAGE_KEYS } from '@/constants';
import type { Chord, Group, GroupedChordCard } from '@/types';
import { normalizeChord } from '@/utils/chordMap';
import { cloneDeep } from '@/utils/cloneDeep';
import { generateUUID } from '@/utils/id';
import { debounceFilter, useEventListener, useRefHistory, useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, toRaw } from 'vue';

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
    if (document.visibilityState === 'hidden') {
      flushChordsAndGroupsNow();
    }
  });

  let needUpdate = false;
  const alignedChords = savedChordsList.value.map(c => {
    const { chord, changed } = normalizeChord(c);
    if (changed) needUpdate = true;
    return chord;
  });
  if (needUpdate) {
    savedChordsList.value = alignedChords;
  }

  const { undo: rawUndo } = useRefHistory(savedChordsList, {
    capacity: 15,
    deep: true,
    flush: 'post',
    clone: v => cloneDeep(toRaw(v)),
  });

  const groupChordMap = computed(() => {
    const map = new Map<string, Chord[]>();
    groups.value.forEach(group => map.set(group.id, []));
    savedChordsList.value.forEach(chord => {
      const list = map.get(chord.groupId);
      if (list) list.push(chord);
      else map.set(chord.groupId, [chord]);
    });
    return map;
  });

  /**
   * 🌟 集中维护的多指法数据映射表：
   * 结构：groupId -> (chordName.toLowerCase() -> GroupedChordCard)
   */
  const multiFingeringData = computed<Map<string, Map<string, GroupedChordCard>>>(() => {
    const chordGroups = new Map<string, Map<string, Chord[]>>();

    savedChordsList.value.forEach(chord => {
      const nameKey = chord.chordName.trim().toLowerCase();
      let groupMap = chordGroups.get(chord.groupId);
      if (!groupMap) {
        groupMap = new Map<string, Chord[]>();
        chordGroups.set(chord.groupId, groupMap);
      }
      const variants = groupMap.get(nameKey);
      if (variants) variants.push(chord);
      else groupMap.set(nameKey, [chord]);
    });

    const result = new Map<string, Map<string, GroupedChordCard>>();

    chordGroups.forEach((groupMap, groupId) => {
      const multiMap = new Map<string, GroupedChordCard>();

      groupMap.forEach((variants, nameKey) => {
        if (variants.length <= 1) return;

        const sortedVariants = [...variants].sort((a, b) => {
          const aInv = a.isInverted ?? false;
          const bInv = b.isInverted ?? false;
          if (aInv !== bInv) return aInv ? 1 : -1;
          return (a.capo ?? 0) - (b.capo ?? 0);
        });

        multiMap.set(nameKey, {
          mainChord: sortedVariants[0],
          variants: sortedVariants,
          hasVariants: true,
          variantCount: sortedVariants.length,
        });
      });

      if (multiMap.size > 0) {
        result.set(groupId, multiMap);
      }
    });

    return result;
  });

  const groupedChordMap = computed<Map<string, GroupedChordCard[]>>(() => {
    const result = new Map<string, GroupedChordCard[]>();

    groups.value.forEach(group => {
      const chords = groupChordMap.value.get(group.id) ?? [];
      const grouped: GroupedChordCard[] = [];
      const visited = new Set<string>();
      const groupMultiFingering = multiFingeringData.value.get(group.id);

      chords.forEach(chord => {
        const nameKey = chord.chordName.trim().toLowerCase();
        if (visited.has(nameKey)) return;
        visited.add(nameKey);

        const multiFingering = groupMultiFingering?.get(nameKey);
        if (multiFingering) {
          grouped.push(multiFingering);
        } else {
          grouped.push({
            mainChord: chord,
            variants: [chord],
            hasVariants: false,
            variantCount: 1,
          });
        }
      });

      result.set(group.id, grouped);
    });

    return result;
  });

  const overwriteChords = (newChords: Chord[]) => {
    savedChordsList.value = [...newChords];
  };

  const overwriteGroups = (newGroups: Group[]) => {
    groups.value = [...newGroups];
  };

  const executeUndoRestore = () => {
    rawUndo();
    const validGroupIds = new Set(groups.value.map(g => g.id));
    let hasOrphans = false;
    savedChordsList.value.forEach(chord => {
      if (!validGroupIds.has(chord.groupId)) hasOrphans = true;
    });
    if (hasOrphans) {
      let recoveryGroup = groups.value.find(g => g.id.startsWith('g_recovery_'));
      if (!recoveryGroup) {
        const newId = 'g_recovery_' + generateUUID().slice(0, 8);
        recoveryGroup = { id: newId, name: '已恢复的和弦', collapsed: false, sortRule: 'ROOT_PITCH' };
        groups.value.unshift(recoveryGroup);
      }
      savedChordsList.value.forEach(chord => {
        if (!validGroupIds.has(chord.groupId)) chord.groupId = recoveryGroup!.id;
      });
    }
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

  const collapseAllGroups = () => {
    groups.value.forEach(group => {
      group.collapsed = true;
    });
  };

  return {
    savedChordsList,
    groups,
    selectedGroupId,
    groupChordMap,
    multiFingeringData,
    groupedChordMap,
    overwriteChords,
    overwriteGroups,
    executeUndoRestore,
    repairFingerprints,
    collapseAllGroups,
  };
});
