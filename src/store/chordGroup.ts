import type { ChordData, ChordGroup } from '@/types/chord';
import { defineStore, type StoreDefinition } from 'pinia';
import { ref } from 'vue';

const useChordGroupStore: StoreDefinition<
  'chordGroup',
  {
    groups: ChordGroup[];
    currentGroupId: string;
  },
  {},
  {
    createGroup: (name: string) => void;
    deleteGroup: (id: string) => void;
    updateGroupName: (id: string, newName: string) => void;
    addChordToGroup: (groupId: string, chord: ChordData) => void;
    removeChordFromGroup: (groupId: string, chord: ChordData) => void;
    updateGroupsOrder: (newGroups: ChordGroup[]) => void;
    updateChordOrder: (groupId: string, newChords: ChordData[]) => void;
  }
> = defineStore(
  'chordGroup',
  () => {
    // 初始状态
    const groups = ref<ChordGroup[]>([{ id: 'all', name: '全部和弦', chords: [] }]);

    const currentGroupId = ref<string>('all');

    // --- 增 (Create) ---
    const createGroup = (name: string) => {
      groups.value.push({
        id: `group_${Date.now()}`,
        name,
        chords: [],
      });
    };

    const addChordToGroup = (groupId: string, chord: ChordData) => {
      const group = groups.value.find(g => g.id === groupId);

      if (group && !group.chords.find(({ _localId }) => _localId === chord._localId)) {
        group.chords.push(chord);
      }
    };

    // --- 删 (Delete) ---
    const deleteGroup = (id: string) => {
      // 默认分组不允许删除
      const index = groups.value.findIndex(g => g.id === id);

      if (index !== -1) {
        groups.value.splice(index, 1);
        // 如果删除的是当前选中的分组，则切回默认分组
        if (currentGroupId.value === id) {
          currentGroupId.value = 'all';
        }
      }
    };

    const removeChordFromGroup = (groupId: string, chord: ChordData) => {
      const group = groups.value.find(g => g.id === groupId);

      if (group) {
        group.chords = group.chords.filter(_chord => _chord._localId !== chord._localId);
      }
    };

    // --- 改 (Update) ---
    const updateGroupName = (id: string, newName: string) => {
      const group = groups.value.find(g => g.id === id);
      if (group) {
        group.name = newName;
      }
    };

    const updateGroupsOrder = (newGroups: ChordGroup[]) => {
      groups.value = newGroups;
    };

    const updateChordOrder = (groupId: string, newChords: ChordData[]) => {
      const group = groups.value.find(g => g.id === groupId);

      if (group) {
        group.chords = newChords;
      }
    };

    return {
      groups,
      currentGroupId,
      createGroup,
      deleteGroup,
      updateGroupName,
      addChordToGroup,
      removeChordFromGroup,
      updateGroupsOrder,
      updateChordOrder,
    };
  },
  { persist: true }
);

export default useChordGroupStore;
