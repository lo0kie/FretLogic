// src/stores/editorStore.ts
import { STORAGE_KEYS } from '@/constants';
import { useChordStore } from '@/stores/chordStore';
import type { Chord, GuitarStringsModel } from '@/types'; // 💡 完美：只作为编译期类型导入
import { cloneDeep } from '@/utils/dataParser';
import { createString, DEFAULT_TUNING_MAPPING, isOpen, TUNING_PRESETS, TuningEnum } from '@/utils/musicTheory';
import { debounceFilter, useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, toRaw, watch } from 'vue';

export const useEditorStore = defineStore('editor', () => {
  const defaultStrings: GuitarStringsModel = [
    createString(),
    createString(),
    createString(),
    createString(),
    createString(),
    createString(),
  ];

  // 🎯 核心修复：彻底拿掉底层的 serializer 选项，交由 VueUse 自行解析
  const strings = useStorage<GuitarStringsModel>(STORAGE_KEYS.CURR_STRINGS, defaultStrings, localStorage, {
    eventFilter: debounceFilter(300),
  });

  const currentChordName = useStorage(STORAGE_KEYS.CURR_NAME, '', localStorage, { eventFilter: debounceFilter(300) });

  const currentTuning = useStorage<TuningEnum>(STORAGE_KEYS.CURR_TUNING, TuningEnum.STANDARD, localStorage);

  const editingId = useStorage<string | null>(STORAGE_KEYS.EDITING_ID, null, localStorage);

  const fretCount = useStorage<Chord['fretCount']>(STORAGE_KEYS.CURR_FCOUNT, 3);
  const capo = useStorage(STORAGE_KEYS.CURR_CAPO, 0);

  const activeBaseStrings = computed(() => {
    return TUNING_PRESETS[currentTuning.value]?.mapping || DEFAULT_TUNING_MAPPING;
  });

  const isFretBoardEmpty = computed(() => strings.value.every(s => s.fret < 0));

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

  const chordStore = useChordStore();
  if (editingId.value) {
    const original = chordStore.savedChordsList.find(c => c.id === editingId.value);
    if (original) {
      currentChordName.value = original.chordName || '';
      strings.value = cloneDeep(toRaw(original.strings));
      fretCount.value = original.fretCount ?? 3;
      capo.value = original.capo ?? 0;
      currentTuning.value = original.tuning || TuningEnum.STANDARD;
    } else {
      editingId.value = null;
    }
  }

  const resetEditor = () => {
    editingId.value = null;
    strings.value = cloneDeep(defaultStrings);
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
    fretCount,
    capo,
    activeBaseStrings,
    isFretBoardEmpty,
    resetEditor,
    toggleOpenString,
  };
});
