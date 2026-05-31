import { STORAGE_KEYS } from '@/constants';
import type { BoolTuple, Chord, FretTuple, Group } from '@/stores/types'; // 馃専 挂载全新元组约束
import type { TuningType } from '@/utils/musicTheory';
import { extractRootNote, TUNING_PRESETS } from '@/utils/musicTheory';
import { debounceFilter, useDark, useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

export const useChordLabStore = defineStore('chordLab', () => {
  const isDarkMode = useDark({ attribute: 'class', valueDark: 'dark', valueLight: '' });

  // 1. 核心持久化响应层（回归纯状态：只负责本地缓存的高效存取与同步）
  const savedChordsList = useStorage<Chord[]>(STORAGE_KEYS.CHORD_LIST, [], localStorage);
  const groups = useStorage<Group[]>(STORAGE_KEYS.GROUPS, [], localStorage);

  // 2. 当前编辑器沙盒隔离的工作流纯状态
  const currentChordName = useStorage(STORAGE_KEYS.CURR_NAME, '', localStorage, { eventFilter: debounceFilter(300) });
  const selectedFrets = useStorage<FretTuple>(STORAGE_KEYS.CURR_FRETS, [-1, -1, -1, -1, -1, -1], localStorage, {
    eventFilter: debounceFilter(300),
  });
  const rootMark = useStorage<number>(STORAGE_KEYS.CURR_ROOT_MARK, -1, localStorage, {
    eventFilter: debounceFilter(300),
  });
  const useFlat = useStorage<BoolTuple>(
    STORAGE_KEYS.CURR_USE_FLAT,
    [false, false, false, false, false, false],
    localStorage,
    { eventFilter: debounceFilter(300) }
  );
  const currentTuning = useStorage<TuningType>('CHORD_LAB_CURR_TUNING_V1', 'STANDARD', localStorage);
  const editingId = useStorage<number | string | null>(STORAGE_KEYS.EDITING_ID, null);
  const selectedGroupId = useStorage<string | null>(STORAGE_KEYS.CURR_GROUP_ID, null);

  const isDraggingFinger = ref(false);
  const lastPos = ref('');

  const fretCount = useStorage(STORAGE_KEYS.CURR_FCOUNT, 3);
  const capo = useStorage(STORAGE_KEYS.CURR_CAPO, 0);

  // 3. 动态高内聚计算依赖（收拢原本散落在各处的重复 filter 行为）
  const activeBaseStrings = computed(() => {
    return TUNING_PRESETS[currentTuning.value]?.mapping || [40, 45, 50, 55, 59, 64];
  });

  const isFretBoardEmpty = computed(() => selectedFrets.value.every(fret => (fret ?? -1) < 0));
  const currentRootNote = computed(() => extractRootNote(currentChordName.value));

  // 馃専 性能优化：在 Store 中集中维护一次和弦映射字典，避免大列表下各个组件反复执行大量的 filter 过滤
  const groupChordMap = computed(() => {
    const map = new Map<string, Chord[]>();
    groups.value.forEach(g => map.set(g.id, []));
    savedChordsList.value.forEach(chord => {
      const list = map.get(chord.groupId);
      if (list) {
        list.push(chord);
      } else {
        // 防止脏数据引起的群落游离，建立兜底字典
        map.set(chord.groupId, [chord]);
      }
    });
    return map;
  });

  // 防物品位缩减时越界的安全物理防御
  watch(fretCount, (newVal, oldVal) => {
    if (newVal < oldVal) {
      const newFrets = [...selectedFrets.value] as FretTuple;
      let isModified = false;
      newFrets.forEach((fret, idx) => {
        if (fret > newVal) {
          newFrets[idx] = -1;
          isModified = true;
          if (rootMark.value === idx) rootMark.value = -1;
        }
      });
      if (isModified) selectedFrets.value = newFrets;
    }
  });

  // 恢复历史和弦时的底层初始化安全机制
  if (editingId.value) {
    const original = savedChordsList.value.find(c => c.id == editingId.value);
    if (original) {
      currentChordName.value = original.chordName || '';
      selectedFrets.value = [...original.selectedFrets] as FretTuple;
      fretCount.value = original.fretCount ?? 3;
      capo.value = original.capo ?? 0;
      rootMark.value = original.rootMark !== undefined ? original.rootMark : -1;
      useFlat.value = original.useFlat
        ? ([...original.useFlat] as BoolTuple)
        : [false, false, false, false, false, false];
      currentTuning.value = original.tuning || 'STANDARD';
    } else {
      editingId.value = null;
    }
  }

  // 4. 原子级纯状态更迭函数（不掺杂任何 Toast 提示、弹窗触发等业务逻辑）
  const resetEditor = () => {
    editingId.value = null;
    selectedFrets.value = [-1, -1, -1, -1, -1, -1];
    currentChordName.value = '';
    capo.value = 0;
    fretCount.value = 3;
    rootMark.value = -1;
    useFlat.value = [false, false, false, false, false, false];
    currentTuning.value = 'STANDARD';
  };

  const overwriteChords = (newChords: Chord[]) => {
    savedChordsList.value = [...newChords];
  };
  const overwriteGroups = (newGroups: Group[]) => {
    groups.value = [...newGroups];
  };

  const toggleOpenString = (sIdx: number) => {
    const currentFretVal = selectedFrets.value[sIdx];
    if (currentFretVal > 0) {
      selectedFrets.value[sIdx] = 0;
    } else if (currentFretVal === 0) {
      selectedFrets.value[sIdx] = -1;
      if (rootMark.value === sIdx) rootMark.value = -1;
    } else {
      selectedFrets.value[sIdx] = 0;
    }
  };

  return {
    savedChordsList,
    groups,
    isDarkMode,
    currentChordName,
    selectedFrets,
    fretCount,
    capo,
    editingId,
    selectedGroupId,
    isDraggingFinger,
    lastPos,
    rootMark,
    useFlat,
    currentTuning,
    activeBaseStrings,
    isFretBoardEmpty,
    currentRootNote,
    groupChordMap, // 馃専 导出高效的字典计算映射
    resetEditor,
    overwriteChords,
    overwriteGroups,
    toggleOpenString,
  };
});
