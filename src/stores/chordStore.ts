import { STORAGE_KEYS } from '@/constants';
import type { Chord, Group } from '@/types';
import { useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed } from 'vue';

export const useChordStore = defineStore('chord', () => {
  const savedChordsList = useStorage<Chord[]>(STORAGE_KEYS.CHORD_LIST, [], localStorage);
  const groups = useStorage<Group[]>(STORAGE_KEYS.GROUPS, [], localStorage);
  const selectedGroupId = useStorage<string | null>(STORAGE_KEYS.CURR_GROUP_ID, null);

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

  return {
    savedChordsList,
    groups,
    selectedGroupId,
    groupChordMap,
    overwriteChords,
    overwriteGroups,
  };
});
