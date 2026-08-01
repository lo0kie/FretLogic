import { STORAGE_KEYS } from '@/constants';
import { useChordStore } from '@/stores/chordStore';
import type { Chord, GuitarStringsModel } from '@/types';
import { cloneDeep } from '@/utils/dataParser';
import { createString, DEFAULT_TUNING_MAPPING, TUNING_PRESETS, TuningEnum } from '@/utils/musicTheory';
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

  const strings = useStorage<GuitarStringsModel>(STORAGE_KEYS.CURR_STRINGS, defaultStrings, localStorage, {
    eventFilter: debounceFilter(300),
  });
  const currentChordName = useStorage(STORAGE_KEYS.CURR_NAME, '', localStorage, { eventFilter: debounceFilter(300) });
  const currentTuning = useStorage<TuningEnum>(STORAGE_KEYS.CURR_TUNING, TuningEnum.STANDARD, localStorage);
  const editingId = useStorage<string | null>(STORAGE_KEYS.EDITING_ID, null, localStorage);
  const fretCount = useStorage<Chord['fretCount']>(STORAGE_KEYS.CURR_FCOUNT, 3);
  const capo = useStorage(STORAGE_KEYS.CURR_CAPO, 0);

  const activeBaseStrings = computed(() => TUNING_PRESETS[currentTuning.value]?.mapping || DEFAULT_TUNING_MAPPING);
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

  // 🌟 显式初始化：如果上次退出时正在编辑某个已保存的和弦，回填数据。
  // 不在 store 创建时自动执行，必须由调用方（main.ts）显式触发一次。
  const initEditor = () => {
    if (!editingId.value) return;

    const chordStore = useChordStore();
    const original = chordStore.savedChordsList.find(c => c.id === editingId.value);

    if (original) {
      currentChordName.value = original.chordName || '';
      strings.value = cloneDeep(toRaw(original.strings));
      fretCount.value = original.fretCount ?? 3;
      capo.value = original.capo ?? 0;
      currentTuning.value = original.tuning || TuningEnum.STANDARD;
    } else {
      // 引用的和弦已被删除，清理脏的 editingId
      editingId.value = null;
    }
  };

  const resetEditor = () => {
    editingId.value = null;
    strings.value = cloneDeep(defaultStrings);
    currentChordName.value = '';
    capo.value = 0;
    fretCount.value = 3;
    currentTuning.value = TuningEnum.STANDARD;
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
    initEditor,
    resetEditor,
  };
});
