import { DEFAULT_CHORD_NAME, STORAGE_KEYS } from '@/constants';
import { extractRootNote } from '@/utils/musicTheory';
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
  useFlat?: boolean[]; // 🌟 新增：每根弦是否使用降号(b)
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

  // 🌟 新增：记录当前指板 6 根弦的升降号状态
  const useFlat = useStorage<boolean[]>(
    STORAGE_KEYS.CURR_USE_FLAT,
    [false, false, false, false, false, false],
    localStorage,
    {
      eventFilter: debounceFilter(300),
    }
  );

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
    // 🌟 恢复该和弦的等音名配置（向下兼容老数据）
    useFlat.value = chord.useFlat ? [...chord.useFlat] : [false, false, false, false, false, false];
  };

  const resetEditor = () => {
    editingId.value = null;
    selectedFrets.value = [-1, -1, -1, -1, -1, -1];
    currentChordName.value = '';
    capo.value = 0;
    fretCount.value = 3;
    rootMark.value = -1;
    useFlat.value = [false, false, false, false, false, false]; // 🌟 重置偏好
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
          document.getElementById(`group-${gid}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    useFlat,
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
