// src/stores/chordEditorStore.ts
import { STORAGE_KEYS } from '@/constants';
import { useChordStore } from '@/stores/chordStore';
import type { Chord, GuitarStringsModel } from '@/types';
import { cloneDeep } from '@/utils/cloneDeep';
import { createString, DEFAULT_TUNING_MAPPING, Tuning, TUNING_PRESETS } from '@/utils/musicTheory';
import { debounceFilter, useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, toRaw } from 'vue';

const createDefaultChord = (): Chord => ({
  id: '',
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
  tuning: Tuning.STANDARD,
  groupId: '',
  rootStringIndex: null,
});

export const useEditorStore = defineStore('editor', () => {
  const chordStore = useChordStore();

  const draftChord = useStorage<Chord>(STORAGE_KEYS.EDITING_DRAFT, createDefaultChord(), localStorage, {
    eventFilter: debounceFilter(300),
  });
  // 迁移：旧草稿每根弦各自维护 isRoot，统一为单点 rootStringIndex
  if (draftChord.value.rootStringIndex === undefined || draftChord.value.rootStringIndex === null) {
    const legacyRootIdx = (draftChord.value.strings as unknown as { isRoot?: boolean; fret: number }[]).findIndex(
      s => s.isRoot && s.fret >= 0
    );
    draftChord.value.rootStringIndex = legacyRootIdx >= 0 ? legacyRootIdx : null;
  }
  // 清理旧字段：每弦 isRoot/label/isAccidental，和弦级 isInverted/fingerprint
  (draftChord.value.strings as unknown as { isRoot?: boolean; label?: string; isAccidental?: boolean }[]).forEach(s => {
    delete s.isRoot;
    delete s.label;
    delete s.isAccidental;
  });
  const legacyDraft = draftChord.value as unknown as { isInverted?: boolean; fingerprint?: string };
  delete legacyDraft.isInverted;
  delete legacyDraft.fingerprint;
  const isEditing = useStorage(STORAGE_KEYS.IS_EDITING, false);
  const isCreating = useStorage(STORAGE_KEYS.IS_CREATING, false);

  const isFretBoardEmpty = computed(() => draftChord.value.strings.every(s => s.fret < 0));
  const activeBaseStrings = computed(() => TUNING_PRESETS[draftChord.value.tuning]?.mapping || DEFAULT_TUNING_MAPPING);

  /** 多指法：只查 chordStore，nameKey 规则不在这里重复 */
  const currentMultiFingering = computed(() => {
    const chord = draftChord.value;
    if (!chord.id || !chord.groupId || !chord.chordName) return null;
    return chordStore.getMultiFingering(chord.groupId, chord.chordName);
  });

  const isMultiFingering = computed(() => currentMultiFingering.value?.hasVariants ?? false);
  const currentMultiFingeringChords = computed<Chord[]>(() => currentMultiFingering.value?.variants ?? []);
  const currentMultiFingeringIndex = computed(() => {
    if (!isMultiFingering.value) return 0;
    const index = currentMultiFingeringChords.value.findIndex(c => c.id === draftChord.value.id);
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
        }
      });
      // 根音所在弦被清除时，根标记一并失效
      if (
        draftChord.value.rootStringIndex !== null &&
        draftChord.value.strings[draftChord.value.rootStringIndex].fret < 0
      ) {
        draftChord.value.rootStringIndex = null;
      }
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
