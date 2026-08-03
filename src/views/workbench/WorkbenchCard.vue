<template>
  <div
    v-element-size="onResize"
    class="workbench-card"
    :style="{
      height: uiStore.isMobile ? 'auto' : dynamicHeight,
      width: uiStore.isMobile ? '100%' : `${CANVAS_CONFIG.BOARD_WIDTH + 64}px`,
    }"
  >
    <input
      v-model="editorStore.currentChordName"
      type="text"
      spellcheck="false"
      placeholder="CHORD"
      class="input-chord-name"
      :class="editorStore.currentChordName ? 'has-name' : 'is-empty'"
    />

    <div class="fretboard-render-zone">
      <Fretboard
        v-model:strings="editorStore.strings"
        v-model:capo="editorStore.capo"
        :fret-count="editorStore.fretCount"
        :active-base-strings="editorStore.activeBaseStrings"
        :is-dark-mode="settingsStore.isDarkMode"
        :scale="uiStore.isMobile ? cardMobileScale : 1.0"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import Fretboard from '@/components/Fretboard.vue';
import { CANVAS_CONFIG, FRETBOARD_SCALE_MAP, WORKBENCH_LAYOUT } from '@/constants';
import { useEditorStore } from '@/stores/chordEditorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import { vElementSize } from '@vueuse/components';
import { computed, ref } from 'vue';

const editorStore = useEditorStore();
const settingsStore = useSettingsStore();
const uiStore = useUiStore();

const cardWidth = ref(0);

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
  const rawCanvasHeight =
    CANVAS_CONFIG.OFFSET_Y_TOP + editorStore.fretCount * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.OFFSET_Y_BOTTOM;
  const currentScale = FRETBOARD_SCALE_MAP[editorStore.fretCount] || 1.0;
  const realBoardHeight = rawCanvasHeight * currentScale;
  return `${baseVerticalSpace + realBoardHeight}px`;
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
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--glass-border);
  border-radius: @radius-md;
  box-shadow: @shadow-floating;
  position: relative;
  box-sizing: border-box;
  flex-shrink: 0;
  transition:
    height @duration-slow @bezier-sidebar,
    background-color @duration-base,
    border-color @duration-base,
    box-shadow @duration-base;
}

.input-chord-name {
  padding-left: 1rem;
  padding-right: 1rem;
  width: 100%;
  text-align: center;
  font-weight: 900;
  background-color: transparent;
  border: none;
  outline: none;
  cursor: pointer;
  user-select: none;
  caret-color: @primary;
  font-size: 3.8rem;
  line-height: 1;
  letter-spacing: -0.04em;
  box-sizing: border-box;
  transition: all 0.25s ease;

  &::placeholder {
    color: var(--text-disabled);
    opacity: 0.22;
    font-weight: 700;
  }

  &.has-name {
    color: var(--text-title);
  }

  &.is-empty {
    color: var(--text-disabled);
  }
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

  .input-chord-name {
    font-size: 2.6rem;
  }

  .fretboard-render-zone {
    display: flex;
    justify-content: center;
    width: 100%;
  }
}
</style>
