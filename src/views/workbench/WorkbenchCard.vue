<template>
  <div
    v-element-size="onResize"
    class="workbench-card"
    ref="cardRef"
    :style="{
      height: uiStore.isMobile ? 'auto' : dynamicHeight,
      width: uiStore.isMobile ? '100%' : `${CANVAS_CONFIG.BOARD_WIDTH + 64}px`,
    }"
  >
    <div class="fretboard-render-zone">
      <Fretboard
        :chord="editorStore.draftChord"
        :is-dark-mode="globalDarkMode"
        :scale="uiStore.isMobile ? cardMobileScale : 1.0"
        :interactive="isGlobalEditable"
        chord-name-editable
        @update:capo="handleCapoUpdate"
        @update:strings="handleStringsChange"
        @update:root-string-index="handleRootStringChange"
        @update:chord-name="handleChordNameChange"
        chord-name-font-size="lg"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import Fretboard from '@/components/Fretboard.vue';
import { CANVAS_CONFIG, FRETBOARD_SCALE_MAP, WORKBENCH_LAYOUT } from '@/constants';
import { useEditorStore } from '@/stores/chordEditorStore';
import { globalDarkMode, isGlobalEditable } from '@/stores/globalState';
import { useUiStore } from '@/stores/uiStore';
import { GuitarStringsModel } from '@/types';
import { vElementSize } from '@vueuse/components';
import { computed, onActivated, onDeactivated, ref, useTemplateRef } from 'vue';

const editorStore = useEditorStore();
const uiStore = useUiStore();
const cardRef = useTemplateRef<HTMLElement>('cardRef');

const cardWidth = ref(0);

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
  editorStore.draftChord.rootStringIndex = index;
  if (!editorStore.isEditing) editorStore.isCreating = true;
};

const handleChordNameChange = (name: string) => {
  editorStore.draftChord.chordName = name;
  if (!editorStore.isEditing) editorStore.isCreating = true;
};

const onResize = ({ width }: { width: number; height: number }) => {
  cardWidth.value = width;
};

const cardMobileScale = computed(() => {
  if (cardWidth.value <= 0) return 1.0;
  const targetWidth = cardWidth.value - 32;
  const baseWidth = CANVAS_CONFIG.BOARD_WIDTH;
  return Math.min(1.0, Math.max(0.65, targetWidth / baseWidth));
});

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

<style scoped lang="less">
@import '@/assets/tokens.module';

.workbench-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-evenly;
  pointer-events: auto;
  background-color: var(--bg-panel);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid var(--glass-border);
  border-radius: @radius-md;
  box-shadow: @shadow-floating;
  position: relative;
  padding: 0 0.5rem;
  flex-shrink: 0;

  transition:
    height @duration-slow @bezier-sidebar,
    background-color @duration-base,
    border-color @duration-base,
    box-shadow @duration-base;
}

.fretboard-render-zone {
  display: flex;
  justify-content: center;
  position: relative;
  width: 100%;
  z-index: 0;
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .workbench-card {
    padding: 1rem 0.25rem;
    width: 100% !important;
  }

  .fretboard-render-zone {
    display: flex;
    justify-content: center;
    width: 100%;
  }
}
</style>
