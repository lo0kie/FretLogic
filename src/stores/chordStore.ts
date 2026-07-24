import { STORAGE_KEYS } from '@/constants';
import type { Chord, Group } from '@/types';
import { cloneDeep } from '@/utils/dataParser';
import { useRefHistory, useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, toRaw } from 'vue';

export const useChordStore = defineStore('chord', () => {
  const savedChordsList = useStorage<Chord[]>(STORAGE_KEYS.CHORD_LIST, [], localStorage);
  const groups = useStorage<Group[]>(STORAGE_KEYS.GROUPS, [], localStorage);
  const selectedGroupId = useStorage<string | null>(STORAGE_KEYS.CURR_GROUP_ID, null);

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
      let targetGroupId = selectedGroupId.value || groups.value[0]?.id || null;
      if (!targetGroupId) {
        targetGroupId = 'g_recovery_' + crypto.randomUUID().slice(0, 8);
        groups.value.forEach(g => {
          g.collapsed = true;
        });
        groups.value.unshift({ id: targetGroupId, name: '已恢复的和弦', collapsed: false });
        selectedGroupId.value = targetGroupId;
      }
      savedChordsList.value.forEach(c => {
        if (!validGroupIds.has(c.groupId)) c.groupId = targetGroupId as string;
      });
    }
  };

  return {
    savedChordsList,
    groups,
    selectedGroupId,
    groupChordMap,
    overwriteChords,
    overwriteGroups,
    executeUndoRestore,
  };
});
