import { STORAGE_KEYS } from '@/constants';
import type { Chord, Group, GuitarStringsModel } from '@/types';
import type { TuningType } from '@/utils/musicTheory';
import { createString, extractRootNote, isOpen, TUNING_PRESETS } from '@/utils/musicTheory';
import { debounceFilter, useDark, useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, ref, toRaw, watch } from 'vue';

export type { Chord, Group };

export const useChordLabStore = defineStore('chordLab', () => {
  const isDarkMode = useDark({ attribute: 'class', valueDark: 'dark', valueLight: '' });

  const savedChordsList = useStorage<Chord[]>(STORAGE_KEYS.CHORD_LIST, [], localStorage);
  const groups = useStorage<Group[]>(STORAGE_KEYS.GROUPS, [], localStorage);

  const defaultStrings: GuitarStringsModel = [
    createString(),
    createString(),
    createString(),
    createString(),
    createString(),
    createString(),
  ];

  const strings = useStorage<GuitarStringsModel>(STORAGE_KEYS.CURR_STRINGS, defaultStrings, localStorage, {
    eventFilter: debounceFilter(300),
  });

  const currentChordName = useStorage(STORAGE_KEYS.CURR_NAME, '', localStorage, { eventFilter: debounceFilter(300) });
  const currentTuning = useStorage<TuningType>('CHORD_LAB_CURR_TUNING_V1', 'STANDARD', localStorage);
  const editingId = useStorage<string | null>(STORAGE_KEYS.EDITING_ID, null);
  const selectedGroupId = useStorage<string | null>(STORAGE_KEYS.CURR_GROUP_ID, null);

  const isDraggingFinger = ref(false);
  const lastPos = ref('');
  const fretCount = useStorage<Chord['fretCount']>(STORAGE_KEYS.CURR_FCOUNT, 3);
  const capo = useStorage(STORAGE_KEYS.CURR_CAPO, 0);

  const activeBaseStrings = computed(() => {
    return TUNING_PRESETS[currentTuning.value]?.mapping || [40, 45, 50, 55, 59, 64];
  });

  const isFretBoardEmpty = computed(() => strings.value.every(s => s.fret < 0));
  const currentRootNote = computed(() => extractRootNote(currentChordName.value));

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

  watch(fretCount, (newVal, oldVal) => {
    if (newVal < oldVal) {
      strings.value.forEach(str => {
        if (str.fret > newVal) {
          str.fret = -1;
          str.isRoot = false;
        }
      });
    }
  });

  if (editingId.value) {
    const original = savedChordsList.value.find(c => c.id === editingId.value);
    if (original) {
      currentChordName.value = original.chordName || '';
      strings.value = structuredClone(toRaw(original.strings));
      fretCount.value = original.fretCount ?? 3;
      capo.value = original.capo ?? 0;
      currentTuning.value = original.tuning || 'STANDARD';
    } else {
      editingId.value = null;
    }
  }

  const resetEditor = () => {
    editingId.value = null;

    strings.value.forEach(s => {
      s.fret = -1;
      s.isRoot = false;
      s.preferFlat = false;
    });

    currentChordName.value = '';
    capo.value = 0;
    fretCount.value = 3;
    currentTuning.value = 'STANDARD';
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
    } else if (isOpen(str)) {
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
    resetEditor,
    overwriteChords,
    overwriteGroups,
    toggleOpenString,
  };
});
