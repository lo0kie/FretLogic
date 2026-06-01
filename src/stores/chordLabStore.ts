import { STORAGE_KEYS } from '@/constants';
import type { Chord, Group, GuitarStringsModel } from '@/types/chord';
import type { TuningType } from '@/utils/musicTheory';
import { extractRootNote, TUNING_PRESETS } from '@/utils/musicTheory';
import { debounceFilter, useDark, useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, ref, toRaw, watch } from 'vue';

export type { Chord, Group };

export const useChordLabStore = defineStore('chordLab', () => {
  const isDarkMode = useDark({ attribute: 'class', valueDark: 'dark', valueLight: '' });

  // 1. 核心持久化响应层（回归纯状态：只负责本地缓存的高效存取与同步）
  const savedChordsList = useStorage<Chord[]>(STORAGE_KEYS.CHORD_LIST, [], localStorage);
  const groups = useStorage<Group[]>(STORAGE_KEYS.GROUPS, [], localStorage);

  // 2. 当前编辑器沙盒隔离的工作流高内聚纯状态
  const defaultStrings: GuitarStringsModel = [
    { fret: -1, isRoot: false, preferFlat: false },
    { fret: -1, isRoot: false, preferFlat: false },
    { fret: -1, isRoot: false, preferFlat: false },
    { fret: -1, isRoot: false, preferFlat: false },
    { fret: -1, isRoot: false, preferFlat: false },
    { fret: -1, isRoot: false, preferFlat: false },
  ];

  // 🚀 核心三合一实体：完全平替掉原先的三维散落数组
  const strings = useStorage<GuitarStringsModel>(STORAGE_KEYS.CURR_STRINGS, defaultStrings, localStorage, {
    eventFilter: debounceFilter(300),
  });

  const currentChordName = useStorage(STORAGE_KEYS.CURR_NAME, '', localStorage, { eventFilter: debounceFilter(300) });
  const currentTuning = useStorage<TuningType>('CHORD_LAB_CURR_TUNING_V1', 'STANDARD', localStorage);
  const editingId = useStorage<number | string | null>(STORAGE_KEYS.EDITING_ID, null);
  const selectedGroupId = useStorage<string | null>(STORAGE_KEYS.CURR_GROUP_ID, null);
  const barreFret = useStorage<number>('CHORD_LAB_CURR_BARRE_FRET_V1', 0, localStorage, {
    eventFilter: debounceFilter(300),
  });

  const isDraggingFinger = ref(false);
  const lastPos = ref('');
  const fretCount = useStorage(STORAGE_KEYS.CURR_FCOUNT, 3);
  const capo = useStorage(STORAGE_KEYS.CURR_CAPO, 0);

  // 3. 动态核心高内聚计算依赖
  const activeBaseStrings = computed(() => {
    return TUNING_PRESETS[currentTuning.value]?.mapping || [40, 45, 50, 55, 59, 64];
  });

  const isFretBoardEmpty = computed(() => strings.value.every(s => s.fret < 0));
  const currentRootNote = computed(() => extractRootNote(currentChordName.value));

  // 馃専 性能拦截防线：在 Store 中集中维护一次和弦映射字典，直接干掉 $O(N \times M)$ 渲染扫描
  const groupChordMap = computed(() => {
    const map = new Map<string, Chord[]>();
    groups.value.forEach(g => map.set(g.id, []));
    savedChordsList.value.forEach(chord => {
      const list = map.get(chord.groupId);
      if (list) {
        list.push(chord);
      } else {
        map.set(chord.groupId, [chord]);
      }
    });
    return map;
  });

  // 品位缩减时的实体物理安全防御
  watch(fretCount, (newVal, oldVal) => {
    if (newVal < oldVal) {
      strings.value.forEach(str => {
        if (str.fret > newVal) {
          str.fret = -1;
          str.isRoot = false;
        }
      });
      if (barreFret.value > newVal) barreFret.value = 0;
    }
  });

  // 恢复历史和弦时的底层反序列化安全机制
  if (editingId.value) {
    const original = savedChordsList.value.find(c => c.id === editingId.value);
    if (original) {
      currentChordName.value = original.chordName || '';
      strings.value = structuredClone(toRaw(original.strings));
      fretCount.value = original.fretCount ?? 3;
      capo.value = original.capo ?? 0;
      currentTuning.value = original.tuning || 'STANDARD';
      barreFret.value = original.barreFret || 0;
    } else {
      editingId.value = null;
    }
  }

  // 纯状态沙盒原子级重置
  const resetEditor = () => {
    editingId.value = null;
    strings.value = structuredClone(toRaw(defaultStrings));
    currentChordName.value = '';
    capo.value = 0;
    fretCount.value = 3;
    currentTuning.value = 'STANDARD';
    barreFret.value = 0;
  };

  const overwriteChords = (newChords: Chord[]) => {
    savedChordsList.value = [...newChords];
  };
  const overwriteGroups = (newGroups: Group[]) => {
    groups.value = [...newGroups];
  };

  const toggleOpenString = (sIdx: number) => {
    const str = strings.value[sIdx];
    if (str.fret > 0) {
      str.fret = 0;
    } else if (str.fret === 0) {
      str.fret = -1;
      str.isRoot = false;
    } else {
      str.fret = 0;
    }
  };

  return {
    savedChordsList,
    groups,
    isDarkMode,
    currentChordName,
    strings,
    fretCount,
    capo,
    editingId,
    selectedGroupId,
    isDraggingFinger,
    lastPos,
    currentTuning,
    activeBaseStrings,
    isFretBoardEmpty,
    currentRootNote,
    groupChordMap,
    barreFret,
    resetEditor,
    overwriteChords,
    overwriteGroups,
    toggleOpenString,
  };
});
