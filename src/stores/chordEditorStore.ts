// src/stores/chordEditorStore.ts
import { STORAGE_KEYS } from '@/constants';
import { useChordStore } from '@/stores/chordStore';
import type { Chord, GuitarStringsModel } from '@/types';
import { cloneDeep } from '@/utils/cloneDeep';
import { createString, DEFAULT_TUNING_MAPPING, TUNING_PRESETS, TuningEnum } from '@/utils/musicTheory';
import { debounceFilter, useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, toRaw } from 'vue';

const createDefaultChord = (): Chord => ({
  id: null as any,
  chordName: '',
  strings: [
    createString(),
    createString(),
    createString(),
    createString(),
    createString(),
    createString(),
  ] as GuitarStringsModel,
  fretCount: 3,
  capo: 0,
  tuning: TuningEnum.STANDARD,
  groupId: '',
  isInverted: false,
  fingerprint: '',
});

export const useEditorStore = defineStore('editor', () => {
  const chordStore = useChordStore();

  const draftChord = useStorage<Chord>(STORAGE_KEYS.EDITING_DRAFT, createDefaultChord(), localStorage, {
    eventFilter: debounceFilter(300),
  });

  const isEditing = useStorage(STORAGE_KEYS.IS_EDITING, false);
  const isCreating = useStorage(STORAGE_KEYS.IS_CREATING, false);

  const isFretBoardEmpty = computed(() => draftChord.value.strings.every(s => s.fret < 0));
  const activeBaseStrings = computed(() => TUNING_PRESETS[draftChord.value.tuning]?.mapping || DEFAULT_TUNING_MAPPING);

  // 🌟 从 chordStore 集中获取当前编辑和弦的多指法数据
  const currentMultiFingering = computed(() => {
    const chord = draftChord.value;
    if (!chord.id || !chord.groupId || !chord.chordName) return null;
    const groupData = chordStore.multiFingeringData.get(chord.groupId);
    if (!groupData) return null;
    return groupData.get(chord.chordName.trim().toLowerCase()) ?? null;
  });

  const isMultiFingering = computed(() => currentMultiFingering.value?.hasVariants ?? false);
  const currentMultiFingeringChords = computed<Chord[]>(() => currentMultiFingering.value?.variants ?? []);

  const currentMultiFingeringIndex = computed(() => {
    if (!isMultiFingering.value) return 0;
    const index = currentMultiFingeringChords.value.findIndex(chord => chord.id === draftChord.value.id);
    return index >= 0 ? index : 0;
  });

  const setMultiFingeringIndex = (index: number) => {
    const chord = currentMultiFingeringChords.value[index];
    if (!chord) return;
    draftChord.value = cloneDeep(toRaw(chord));
    isCreating.value = false;
    isEditing.value = true;
  };

  const setFretCount = (newVal: Chord['fretCount']) => {
    const oldVal = draftChord.value.fretCount;
    draftChord.value.fretCount = newVal;
    if (newVal < oldVal) {
      draftChord.value.strings.forEach(str => {
        if (str.fret > newVal) {
          str.fret = -1;
          str.isRoot = false;
        }
      });
    }
  };

  const setEditor = (chord: Chord) => {
    isCreating.value = false;
    isEditing.value = true;
    draftChord.value = cloneDeep(toRaw(chord));
  };

  const initEditor = () => {
    if (!draftChord.value.id) return;
    const original = chordStore.savedChordsList.find(c => c.id === draftChord.value.id);
    if (original) setEditor(original);
    else resetEditor();
  };

  const resetEditor = () => {
    draftChord.value = createDefaultChord();
    isCreating.value = false;
    isEditing.value = false;
  };

  const saveAsNewChord = () => {
    draftChord.value.id = null as any;
    isEditing.value = false;
    isCreating.value = true;
  };

  return {
    draftChord,
    isEditing,
    isCreating,
    isFretBoardEmpty,
    activeBaseStrings,
    isMultiFingering,
    currentMultiFingeringChords,
    currentMultiFingeringIndex,
    setFretCount,
    setEditor,
    initEditor,
    resetEditor,
    saveAsNewChord,
    setMultiFingeringIndex,
  };
});
