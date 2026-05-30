import { DEFAULT_CHORD_NAME, STORAGE_KEYS } from '@/constants';
import { extractRootNote, TUNING_PRESETS, type TuningType } from '@/utils/musicTheory';
import { debounceFilter, useDark, useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, nextTick, ref, watch } from 'vue';

export interface Chord {
  id: number;
  chordName: string;
  selectedFrets: number[];
  fretCount: number;
  capo: number;
  groupId: string;
  rootMark: number;
  useFlat: boolean[];
  tuning: TuningType;
}

export interface Group {
  id: string;
  name: string;
  collapsed: boolean;
}

export const useChordLabStore = defineStore('chordLab', () => {
  const isDarkMode = useDark({ attribute: 'class', valueDark: 'dark', valueLight: '' });

  const savedChordsList = useStorage<Chord[]>(STORAGE_KEYS.CHORD_LIST, [], localStorage);
  const groups = useStorage<Group[]>(STORAGE_KEYS.GROUPS, [], localStorage);

  const currentChordName = useStorage(STORAGE_KEYS.CURR_NAME, '', localStorage, { eventFilter: debounceFilter(300) });
  const selectedFrets = useStorage<number[]>(STORAGE_KEYS.CURR_FRETS, [-1, -1, -1, -1, -1, -1], localStorage, {
    eventFilter: debounceFilter(300),
  });
  const rootMark = useStorage<number>(STORAGE_KEYS.CURR_ROOT_MARK, -1, localStorage, {
    eventFilter: debounceFilter(300),
  });

  const useFlat = useStorage<boolean[]>(
    STORAGE_KEYS.CURR_USE_FLAT,
    [false, false, false, false, false, false],
    localStorage,
    {
      eventFilter: debounceFilter(300),
    }
  );

  // 🌟 新增：当前编辑器所选用的调音方案响应式存储
  const currentTuning = useStorage<TuningType>('CHORD_LAB_CURR_TUNING_V1', 'STANDARD', localStorage);

  // 🌟 新增：动态推导当前激活的 6 根琴弦 MIDI 音高基准阵列
  const activeBaseStrings = computed(() => {
    return TUNING_PRESETS[currentTuning.value]?.mapping || [40, 45, 50, 55, 59, 64];
  });

  const fretCount = useStorage(STORAGE_KEYS.CURR_FCOUNT, 3);
  const capo = useStorage(STORAGE_KEYS.CURR_CAPO, 0);

  watch(fretCount, (newVal, oldVal) => {
    if (newVal < oldVal) {
      let isModified = false;
      const newFrets = [...selectedFrets.value];
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

  const editingId = useStorage<number | null>(STORAGE_KEYS.EDITING_ID, null);
  const selectedGroupId = useStorage<string | null>(STORAGE_KEYS.CURR_GROUP_ID, null);

  const isDraggingFinger = ref(false);
  const lastPos = ref('');

  const overwriteChords = (newChords: Chord[]) => {
    savedChordsList.value = [...newChords];
  };
  const overwriteGroups = (newGroups: Group[]) => {
    groups.value = [...newGroups];
  };

  const addChord = (chord: Chord) => savedChordsList.value.unshift(chord);
  const updateChord = (idx: number, chord: Chord) => (savedChordsList.value[idx] = chord);

  const getGroupChords = (gid: string): Chord[] => savedChordsList.value.filter(chord => chord.groupId === gid);

  const isFretBoardEmpty = computed(() => selectedFrets.value.every(fret => (fret ?? -1) < 0));
  const currentRootNote = computed(() => extractRootNote(currentChordName.value));

  const handleChordClick = (chord: Chord) => {
    editingId.value = chord.id;
    currentChordName.value = chord.chordName === DEFAULT_CHORD_NAME ? '' : chord.chordName;
    selectedFrets.value = [...chord.selectedFrets];
    fretCount.value = chord.fretCount ?? 3;
    capo.value = chord.capo ?? 0;
    rootMark.value = chord.rootMark !== undefined ? chord.rootMark : -1;
    useFlat.value = chord.useFlat ? [...chord.useFlat] : [false, false, false, false, false, false];

    // 🌟 还原历史调音偏好
    currentTuning.value = chord.tuning || 'STANDARD';
  };

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

  const toggleOpenString = (sIdx: number) => {
    const currentFretVal = selectedFrets.value[sIdx];
    if (currentFretVal > 0) selectedFrets.value[sIdx] = 0;
    else if (currentFretVal === 0) {
      selectedFrets.value[sIdx] = -1;
      if (rootMark.value === sIdx) rootMark.value = -1;
    } else selectedFrets.value[sIdx] = 0;
  };

  const handleGroupHeaderClick = (gid: string) => {
    const target = groups.value.find(g => g.id === gid);
    if (target) {
      if (target.collapsed) {
        selectedGroupId.value = gid;
        groups.value.forEach(g => {
          if (g.id !== gid) g.collapsed = true;
        });
        nextTick(() => {
          document.getElementById(`group-${gid}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      } else if (selectedGroupId.value === gid) {
        selectedGroupId.value = null;
      }
      target.collapsed = !target.collapsed;
    }
  };

  if (editingId.value) {
    const original = savedChordsList.value.find(c => c.id == editingId.value);
    if (original) {
      currentChordName.value = original.chordName === DEFAULT_CHORD_NAME ? '' : original.chordName;
      selectedFrets.value = [...original.selectedFrets];
      fretCount.value = original.fretCount ?? 3;
      capo.value = original.capo ?? 0;
      rootMark.value = original.rootMark !== undefined ? original.rootMark : -1;
      useFlat.value = original.useFlat ? [...original.useFlat] : [false, false, false, false, false, false];
      currentTuning.value = original.tuning || 'STANDARD';
    } else {
      editingId.value = null;
    }
  }

  // 🌟 导出所有响应式属性
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
    overwriteChords,
    overwriteGroups,
    addChord,
    updateChord,
    getGroupChords,
    toggleOpenString,
    resetEditor,
    handleChordClick,
    handleGroupHeaderClick,
  };
});
