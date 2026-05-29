import { DEFAULT_CHORD_NAME, STORAGE_KEYS } from '@/constants';
import { calcNoteLabel, extractRootNote } from '@/utils/musicTheory';
import { debounceFilter, useDark, useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export interface Chord {
  id: number;
  chordName: string;
  selectedFrets: number[];
  fretCount: number;
  capo: number;
  groupId: string;
  rootMark: number;
}

export interface Group {
  id: string;
  name: string;
  collapsed: boolean;
}

export const useChordLabStore = defineStore('chordLab', () => {
  const isDarkMode = useDark({ attribute: 'class', valueDark: 'dark', valueLight: '' });

  // 🌟 性能极客优化：给极其沉重的海量长列表挂载防抖。鼠标无论怎么疯狂拖拽排序，只有停歇 500ms 后才一次性打包装盘落盘
  const savedChordsList = useStorage<Chord[]>(STORAGE_KEYS.CHORD_LIST, [], localStorage, {
    eventFilter: debounceFilter(500),
  });
  const groups = useStorage<Group[]>(STORAGE_KEYS.GROUPS, [], localStorage, { eventFilter: debounceFilter(500) });

  const currentChordName = useStorage(STORAGE_KEYS.CURR_NAME, '', localStorage, { eventFilter: debounceFilter(300) });
  const selectedFrets = useStorage<number[]>(STORAGE_KEYS.CURR_FRETS, [-1, -1, -1, -1, -1, -1], localStorage, {
    eventFilter: debounceFilter(300),
  });
  const rootMark = useStorage<number>(STORAGE_KEYS.CURR_ROOT_MARK, -1, localStorage, {
    eventFilter: debounceFilter(300),
  });

  const fretCount = useStorage(STORAGE_KEYS.CURR_FCOUNT, 3);
  const capo = useStorage(STORAGE_KEYS.CURR_CAPO, 0);

  const editingId = useStorage<number | null>(STORAGE_KEYS.EDITING_ID, null);
  const selectedGroupId = useStorage<string | null>(STORAGE_KEYS.CURR_GROUP_ID, null);

  const isDraggingFinger = ref(false);
  const lastPos = ref('');

  const overwriteChords = (newChords: Chord[]) => {
    savedChordsList.value.length = 0;
    savedChordsList.value.push(...newChords);
  };

  const overwriteGroups = (newGroups: Group[]) => {
    groups.value.length = 0;
    groups.value.push(...newGroups);
  };

  const addChord = (chord: Chord) => savedChordsList.value.unshift(chord);
  const updateChord = (idx: number, chord: Chord) => (savedChordsList.value[idx] = chord);

  const getGroupChords = (gid: string): Chord[] => {
    return savedChordsList.value.filter(chord => chord.groupId === gid);
  };

  const isFretBoardEmpty = computed(() => selectedFrets.value.every(fret => (fret ?? -1) < 0));

  const currentRootNote = computed(() => extractRootNote(currentChordName.value));

  const openStringsUIState = computed(() => {
    const currentRoot = currentRootNote.value;
    return selectedFrets.value.map((fretVal, sIdx) => {
      const calcFret = fretVal === -1 ? 0 : fretVal;
      const noteLabel = calcNoteLabel(sIdx, calcFret, capo.value);
      const hasManualRoot =
        rootMark.value !== null && rootMark.value !== undefined && rootMark.value >= 0 && rootMark.value <= 5;
      let isRoot = hasManualRoot
        ? rootMark.value === sIdx
        : !!(currentRoot && calcNoteLabel(sIdx, 0, capo.value).toUpperCase() === currentRoot);

      let type: 'muted' | 'root' | 'open' | 'normal' = 'normal';
      if (fretVal === -1) type = 'muted';
      else if (fretVal === 0) type = isRoot ? 'root' : 'open';

      return { fretVal, noteLabel, type };
    });
  });

  const handleChordClick = (chord: Chord) => {
    editingId.value = chord.id;
    currentChordName.value = chord.chordName === DEFAULT_CHORD_NAME ? '' : chord.chordName;
    selectedFrets.value = [...chord.selectedFrets];
    fretCount.value = chord.fretCount ?? 3;
    capo.value = chord.capo ?? 0;
    rootMark.value = chord.rootMark !== undefined ? chord.rootMark : -1;
  };

  const resetEditor = () => {
    editingId.value = null;
    selectedFrets.value = [-1, -1, -1, -1, -1, -1];
    currentChordName.value = '';
    capo.value = 0;
    fretCount.value = 3;
    rootMark.value = -1;
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
    } else {
      editingId.value = null;
    }
  }

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
    isFretBoardEmpty,
    currentRootNote,
    openStringsUIState,
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
