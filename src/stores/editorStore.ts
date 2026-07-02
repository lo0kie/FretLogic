import { STORAGE_KEYS } from '@/constants';
import { useChordStore } from '@/stores/chordStore';
import type { Chord, GuitarStringsModel } from '@/types';
import { createString, extractRootNote, isOpen, TUNING_PRESETS, TuningEnum } from '@/utils/musicTheory';
import { debounceFilter, useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, ref, toRaw, watch } from 'vue';

export const useEditorStore = defineStore('editor', () => {
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
  const currentTuning = useStorage<TuningEnum>('CHORD_LAB_CURR_TUNING_V1', TuningEnum.STANDARD, localStorage);
  const editingId = useStorage<string | null>(STORAGE_KEYS.EDITING_ID, null);

  const isDraggingFinger = ref(false);
  const lastPos = ref('');
  const fretCount = useStorage<Chord['fretCount']>(STORAGE_KEYS.CURR_FCOUNT, 3);
  const capo = useStorage(STORAGE_KEYS.CURR_CAPO, 0);

  const activeBaseStrings = computed(() => {
    return TUNING_PRESETS[currentTuning.value]?.mapping || [40, 45, 50, 55, 59, 64];
  });

  const isFretBoardEmpty = computed(() => strings.value.every(s => s.fret < 0));
  const currentRootNote = computed(() => extractRootNote(currentChordName.value));

  // 物理品位越界熔断
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

  // 恢复历史和弦时的底层反序列化安全机制
  const chordStore = useChordStore();
  if (editingId.value) {
    const original = chordStore.savedChordsList.find(c => c.id === editingId.value);
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
    currentTuning.value = TuningEnum.STANDARD;
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
    strings,
    currentChordName,
    currentTuning,
    editingId,
    isDraggingFinger,
    lastPos,
    fretCount,
    capo,
    activeBaseStrings,
    isFretBoardEmpty,
    currentRootNote,
    resetEditor,
    toggleOpenString,
  };
});
