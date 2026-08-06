import { STORAGE_KEYS } from '@/constants';
import type { Chord, Group } from '@/types';
import { normalizeChord } from '@/utils/chordMap';
import { cloneDeep } from '@/utils/cloneDeep';
import { generateUUID } from '@/utils/id';
import { useRefHistory, useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, toRaw } from 'vue';

export const useChordStore = defineStore('chord', () => {
  const savedChordsList = useStorage<Chord[]>(STORAGE_KEYS.CHORD_LIST, [], localStorage);
  const groups = useStorage<Group[]>(STORAGE_KEYS.GROUPS, [], localStorage);
  const selectedGroupId = useStorage<string | null>(STORAGE_KEYS.CURR_GROUP_ID, null);

  // 🌟 启动时静默迁移与清洗：统一使用 normalizeChord 规范化数据
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
      let recoveryGroup = groups.value.find(g => g.id.startsWith('g_recovery_'));
      if (!recoveryGroup) {
        const newId = 'g_recovery_' + generateUUID().slice(0, 8);
        recoveryGroup = { id: newId, name: '已恢复的和弦', collapsed: false, sortRule: 'ROOT_PITCH' };
        groups.value.unshift(recoveryGroup);
      }
      savedChordsList.value.forEach(c => {
        if (!validGroupIds.has(c.groupId)) c.groupId = recoveryGroup!.id;
      });
    }
  };

  /** 批量校验并修复全量和弦的转位状态与指纹标识 */
  const repairFingerprints = (): number => {
    let repairedCount = 0;

    const repairedList = savedChordsList.value.map(c => {
      const { chord, changed } = normalizeChord(c);
      if (changed) repairedCount++;
      return chord;
    });

    if (repairedCount > 0) {
      overwriteChords(repairedList);
    }

    return repairedCount;
  };

  const collapseAllGroups = () => {
    groups.value.forEach(g => {
      g.collapsed = true;
    });
  };

  return {
    savedChordsList,
    groups,
    selectedGroupId,
    groupChordMap,
    overwriteChords,
    overwriteGroups,
    executeUndoRestore,
    repairFingerprints,
    collapseAllGroups,
  };
});
