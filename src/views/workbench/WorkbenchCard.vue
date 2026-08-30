<template>
  <div
    ref="cardRef"
    class="flex flex-col items-center justify-evenly pointer-events-auto bg-bg-panel/90 backdrop-blur-lg border border-glass-border rounded-md shadow-panel relative px-sm shrink-0 transition-all duration-slow ease-sidebar hover:border-border-base hover:shadow-lg"
    :style="{
      height: dynamicHeight,
      width: `${CANVAS_CONFIG.BOARD_WIDTH + 64}px`,
    }"
  >
    <div class="flex justify-center relative w-full z-base shrink-0">
      <Fretboard
        :chord="editorStore.draftChord"
        :is-dark-mode="globalDarkMode"
        :scale="1.0"
        :interactive="isGlobalEditable"
        chord-name-editable
        chord-name-font-size="lg"
        @update:capo="handleCapoUpdate"
        @update:strings="handleStringsChange"
        @update:root-string-index="handleRootStringChange"
        @update:chord-name="handleChordNameChange"
        @update:name-segments="handleNameSegmentsChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import Fretboard from '@/components/fretboard/Fretboard.vue';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { globalDarkMode, isGlobalEditable } from '@/stores/globalState';
import { useUiStore } from '@/stores/uiStore';
import type { ChordNameSegments, GuitarStringsModel, StringIndex } from '@/types';
import { CANVAS_CONFIG, FRETBOARD_SCALE_MAP, WORKBENCH_LAYOUT } from '@/utils/core/constants';
import { toCapo, toStringIndex } from '@/utils/music/chord-fretboard';
import { nameToSegments } from '@/utils/music/musicTheory';
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, useTemplateRef, watch } from 'vue';

const editorStore = useChordEditorStore();
const uiStore = useUiStore();
const cardRef = useTemplateRef<HTMLElement>('cardRef');

watch(
  cardRef,
  el => {
    if (el) uiStore.activeExportTarget = el;
  },
  { immediate: true }
);

onMounted(() => {
  if (cardRef.value) {
    uiStore.activeExportTarget = cardRef.value;
  }
});

onActivated(() => {
  if (cardRef.value) {
    uiStore.activeExportTarget = cardRef.value;
  }
});

onDeactivated(() => {
  if (uiStore.activeExportTarget === cardRef.value) uiStore.activeExportTarget = null;
});

onBeforeUnmount(() => {
  if (uiStore.activeExportTarget === cardRef.value) uiStore.activeExportTarget = null;
});

const handleCapoUpdate = (capo: number) => {
  editorStore.draftChord.capo = toCapo(capo);
  if (!editorStore.isEditing) editorStore.isCreating = true;
};

const handleStringsChange = (strings: GuitarStringsModel) => {
  strings.forEach((str, i) => {
    editorStore.draftChord.strings[i] = [str[0], str[1]];
  });
  if (!editorStore.isEditing) editorStore.isCreating = true;
};

const handleRootStringChange = (index: number | null) => {
  const validIndex: StringIndex | null =
    index !== null && (editorStore.draftChord.strings[index]?.[0] ?? -1) >= 0 ? toStringIndex(index) : null;
  editorStore.draftChord.rootStringIndex = validIndex;
  if (!editorStore.isEditing) editorStore.isCreating = true;
};

const handleChordNameChange = (name: string) => {
  const segs = name ? nameToSegments(name) : null;
  editorStore.draftChord.nameSegments = segs;
  if (!editorStore.isEditing) editorStore.isCreating = true;
};

const handleNameSegmentsChange = (segments: ChordNameSegments | null) => {
  editorStore.draftChord.nameSegments = segments;
  if (!editorStore.isEditing) editorStore.isCreating = true;
};

const dynamicHeight = computed(() => {
  const baseVerticalSpace = WORKBENCH_LAYOUT.BASE_VERTICAL_PADDING;
  const rawCanvasHeight =
    CANVAS_CONFIG.OFFSET_Y_TOP +
    editorStore.draftChord.fretCount * CANVAS_CONFIG.FRET_HEIGHT +
    CANVAS_CONFIG.OFFSET_Y_BOTTOM;
  const currentScale = FRETBOARD_SCALE_MAP[editorStore.draftChord.fretCount] || 1.0;
  const realBoardHeight = rawCanvasHeight * currentScale;
  return `${baseVerticalSpace + realBoardHeight}px`;
});
</script>
