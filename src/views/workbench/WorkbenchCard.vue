<template>
  <div
    ref="cardRef"
    class="workbench-card"
    :style="{
      height: dynamicHeight,
      width: `${CANVAS_CONFIG.BOARD_WIDTH + 64}px`,
    }"
  >
    <div class="fretboard-render-zone">
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
import Fretboard from '@/components/Fretboard.vue';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { globalDarkMode, isGlobalEditable } from '@/stores/globalState';
import { useUiStore } from '@/stores/uiStore';
import type { ChordNameSegments, GuitarStringsModel } from '@/types';
import { CANVAS_CONFIG, FRETBOARD_SCALE_MAP, WORKBENCH_LAYOUT } from '@/utils/constants';
import { nameToSegments } from '@/utils/musicTheory';
import { computed, onActivated, onDeactivated, useTemplateRef } from 'vue';

const editorStore = useChordEditorStore();
const uiStore = useUiStore();
const cardRef = useTemplateRef<HTMLElement>('cardRef');

const handleCapoUpdate = (capo: number) => {
  editorStore.draftChord.capo = capo;

  if (!editorStore.isEditing) editorStore.isCreating = true;
};

const handleStringsChange = (strings: GuitarStringsModel) => {
  strings.forEach((str, i) => {
    editorStore.draftChord.strings[i] = [str[0], str[1]];
  });

  if (!editorStore.isEditing) editorStore.isCreating = true;
};

const handleRootStringChange = (index: number | null) => {
  // 禁用的弦不允许标记为主音：写入前校验，指向静音弦一律视为未指定根音
  const validIndex = index !== null && (editorStore.draftChord.strings[index]?.[0] ?? -1) >= 0 ? index : null;
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
  // Fretboard 内部布局已计入和弦名区高度（extraTopHeight），这里不重复加
  const rawCanvasHeight =
    CANVAS_CONFIG.OFFSET_Y_TOP +
    editorStore.draftChord.fretCount * CANVAS_CONFIG.FRET_HEIGHT +
    CANVAS_CONFIG.OFFSET_Y_BOTTOM;
  const currentScale = FRETBOARD_SCALE_MAP[editorStore.draftChord.fretCount] || 1.0;
  const realBoardHeight = rawCanvasHeight * currentScale;
  return `${baseVerticalSpace + realBoardHeight}px`;
});

onActivated(() => {
  uiStore.activeExportTarget = cardRef.value ?? null;
});

onDeactivated(() => {
  if (uiStore.activeExportTarget === cardRef.value) uiStore.activeExportTarget = null;
});
</script>

<style scoped lang="scss">
.workbench-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-evenly;
  pointer-events: auto;
  background-color: var(--bg-panel);
  backdrop-filter: var(--blur-lg);
  -webkit-backdrop-filter: var(--blur-lg);
  border: 1px solid var(--glass-border);
  border-radius: $radius-md;
  box-shadow: $shadow-panel;
  position: relative;
  padding: 0 $space-sm;
  flex-shrink: 0;

  transition:
    height $duration-slow $bezier-sidebar,
    background-color $duration-base,
    border-color $duration-base,
    box-shadow $duration-base;
}

.workbench-card:hover {
  border-color: color-mix(in srgb, var(--border-base), transparent 12%);
  box-shadow: $shadow-lg;
}

.fretboard-render-zone {
  display: flex;
  justify-content: center;
  position: relative;
  width: 100%;
  z-index: var(--z-base);
  flex-shrink: 0;
}
</style>
