// src/stores/chordEditorStore.ts
import { STORAGE_KEYS } from '@/utils/constants';
import { useChordStore } from '@/stores/chordStore';
import type { Chord, GuitarStringEntity, GuitarStringsModel } from '@/types';
import { cloneDeep } from '@/utils/common';
import { createString, DEFAULT_TUNING_MAPPING, Tuning, TUNING_PRESETS } from '@/utils/musicTheory';
import { debounceFilter, useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, toRaw, watch } from 'vue';

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
  const legacyStrings = draft.strings as unknown[];
  if (draft.strings.length === 6 && legacyStrings.some(value => !Array.isArray(value))) {
    draft.strings = legacyStrings.map(value => {
      const legacy = value as { fret?: unknown; preferFlat?: unknown };
      return [typeof legacy?.fret === 'number' ? legacy.fret : -1, Boolean(legacy?.preferFlat)] as GuitarStringEntity;
    }) as GuitarStringsModel;
  }
  // 旧草稿每根弦各自维护 isRoot -> 单点 rootStringIndex
  if (draft.rootStringIndex === undefined || draft.rootStringIndex === null) {
    const legacyRootIdx = (draft.strings as unknown as { isRoot?: boolean; fret: number }[]).findIndex(
      value => value.isRoot === true && typeof value.fret === 'number' && value.fret >= 0
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

export const useChordEditorStore = defineStore('editor', () => {
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

  /** 数据层兜底：主音绝不指向禁用的弦。
   *  任何写入路径（右键设根、设弦状态、缩品位、加载和弦等）只要把 rootStringIndex 落到
   *  静音弦（fret < 0）上，立刻清空。这样数据里永远不存在“禁用的弦=主音”的垃圾状态，
   *  渲染层只需做相等判断，无需再在视图里掩盖不一致。 */
  watch(
    () => [draftChord.value.rootStringIndex, draftChord.value.strings.map(s => s[0])] as const,
    () => {
      const idx = draftChord.value.rootStringIndex;
      if (idx !== null && (draftChord.value.strings[idx]?.[0] ?? -1) < 0) {
        draftChord.value.rootStringIndex = null;
      }
    },
    { deep: true }
  );

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
        (draftChord.value.strings[draftChord.value.rootStringIndex]?.[0] ?? -1) < 0
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
    draftChord.value = { ...draftChord.value, id: '' };
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
