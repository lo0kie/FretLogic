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

/** 迁移：把旧草稿（对象数组 / isRoot 散列）升级为二维数组 + 单点根音 */
const normalizeDraftStrings = (draft: Chord): void => {
  // 旧对象数组 -> 二维数组
  if (draft.strings.length === 6 && draft.strings.some((s: any) => !Array.isArray(s))) {
    draft.strings = draft.strings.map((s: any) => [
      typeof s?.fret === 'number' ? s.fret : -1,
      !!s?.preferFlat,
    ]) as GuitarStringsModel;
  }
  // 旧草稿每根弦各自维护 isRoot -> 单点 rootStringIndex
  if (draft.rootStringIndex === undefined || draft.rootStringIndex === null) {
    const legacyRootIdx = (draft.strings as unknown as { isRoot?: boolean; fret: number }[]).findIndex(
      s => (s as any).isRoot && s.fret >= 0
    );
    draft.rootStringIndex = legacyRootIdx >= 0 ? legacyRootIdx : null;
  }
  // 清理旧字段：每弦 isRoot/label/isAccidental，和弦级 isInverted/fingerprint
  (draft.strings as unknown as { isRoot?: boolean; label?: string; isAccidental?: boolean }[]).forEach(s => {
    if (s && typeof s === 'object' && !Array.isArray(s)) {
      delete s.isRoot;
      delete s.label;
      delete s.isAccidental;
    }
  });
  const legacyDraft = draft as unknown as { isInverted?: boolean; fingerprint?: string };
  delete legacyDraft.isInverted;
  delete legacyDraft.fingerprint;
};

export const useEditorStore = defineStore('editor', () => {
  const chordStore = useChordStore();

  const draftChord = useStorage<Chord>(STORAGE_KEYS.EDITING_DRAFT, createDefaultChord(), localStorage, {
    eventFilter: debounceFilter(300),
  });
  // 迁移：旧草稿（对象数组 / isRoot 散列）升级为二维数组 + 单点根音
  normalizeDraftStrings(draftChord.value);
  const isEditing = useStorage(STORAGE_KEYS.IS_EDITING, false);
  const isCreating = useStorage(STORAGE_KEYS.IS_CREATING, false);

  const isFretBoardEmpty = computed(() => draftChord.value.strings.every(s => s[0] < 0));
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
        if (str[0] > newVal) {
          str[0] = -1;
        }
      });
      // 根音所在弦被清除时，根标记一并失效
      if (
        draftChord.value.rootStringIndex !== null &&
        draftChord.value.strings[draftChord.value.rootStringIndex][0] < 0
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
