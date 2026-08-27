// src/stores/chordEditorStore.ts
import { useChordStore } from '@/stores/chordStore';
import type { Chord, GuitarStringsModel } from '@/types';
import { normalizeChord } from '@/utils/music/chord-fretboard';
import { cloneDeep } from '@/utils/core/common';
import { STORAGE_KEYS } from '@/utils/core/constants';
import { createString, DEFAULT_TUNING_MAPPING, getChordName, Tuning, TUNING_PRESETS } from '@/utils/music/musicTheory';
import { debounceFilter, useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, toRaw, watch } from 'vue';

const createDefaultChord = (): Chord => ({
  id: '',
  nameSegments: null,
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

/** 规范化草稿：复用统一的 normalizeChord 并在空白草稿时清理残留 C 分片 */
const normalizeDraftChord = (draft: Chord): Chord => {
  const { chord } = normalizeChord(draft);
  if (!chord.id && Array.isArray(chord.strings) && chord.strings.every(s => Array.isArray(s) && s[0] < 0)) {
    if (
      chord.nameSegments &&
      chord.nameSegments.root?.[0] === 'C' &&
      chord.nameSegments.root?.[1] === 0 &&
      !chord.nameSegments.quality &&
      !chord.nameSegments.extensions &&
      !chord.nameSegments.bass
    ) {
      chord.nameSegments = null;
    }
  }
  return chord;
};

export const useChordEditorStore = defineStore('editor', () => {
  const chordStore = useChordStore();

  const draftChord = useStorage<Chord>(STORAGE_KEYS.EDITING_DRAFT, createDefaultChord(), localStorage, {
    eventFilter: debounceFilter(300),
  });
  draftChord.value = normalizeDraftChord(draftChord.value);
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
    const name = getChordName(chord);
    if (!chord.id || !chord.groupId || !name) return null;
    return chordStore.getMultiFingering(chord.groupId, name);
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
