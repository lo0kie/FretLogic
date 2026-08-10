<template>
  <div
    class="fretboard-layout-scaler"
    :class="{ 'has-border': bordered }"
    :style="{ width: `${realScaledWidth}px`, height: `${realScaledHeight}px` }"
  >
    <div
      ref="fretBoardRef"
      class="fretboard-container"
      :class="[interactive ? 'is-interactive' : 'is-disabled', { 'is-bordered': bordered }]"
      :tabindex="interactive ? 0 : -1"
      data-focusable-outline
      :style="{
        width: `${CANVAS_CONFIG.BOARD_WIDTH}px`,
        height: `${rawHeight}px`,
        transform: `scale(${fretboardScale})`,
        transformOrigin: 'top left',
        backgroundColor: bgColor,
      }"
      @contextmenu="handleRightClickRoot"
    >
      <div class="open-strings-wrapper" :style="{ height: `${activeTopOffset}px` }">
        <template v-if="showOpenStrings">
          <button
            v-wave
            v-for="(str, sIdx) in chord.strings"
            :key="'os-' + sIdx"
            v-tooltip="getOpenStringTooltip(str)"
            tabindex="-1"
            role="button"
            :aria-label="getOpenStringAriaLabel(sIdx, str)"
            :aria-disabled="!interactive"
            :title="str.fret > 0 ? undefined : getOpenStringAriaLabel(sIdx, str)"
            @click.stop="handleLocalToggleOpenString(sIdx)"
            @dblclick.prevent.stop="handleTogglePitchName(sIdx)"
            class="open-string-btn"
            :class="[
              str.fret > 0 ? 'is-fret-pressed' : 'is-fret-available',
              getOpenStringStatusClass(str),
              interactive ? 'allow-events' : 'block-events',
              {
                'no-border': !bordered,
                'is-focused-hover': isFocused && focusPoint?.fretIndex === 0 && focusPoint?.stringIndex === sIdx,
              },
            ]"
            :style="{
              left: stringXPositions[sIdx] ? `${stringXPositions[sIdx]}px` : `${30 + sIdx * 64}px`,
              backgroundColor: bgColor,
              ...getOpenStringStyle(str, isDarkMode),
            }"
          >
            <template v-if="str.fret <= 0">
              <X v-if="isMuted(str)" class="mute-icon" stroke-width="3" aria-hidden="true" />
              <span v-else-if="isOpen(str)" class="open-note-text">
                {{ calcNoteLabel(sIdx, 0, chord.capo, str.preferFlat, getActiveBaseStrings(chord.tuning)) }}
              </span>
            </template>
          </button>
        </template>
      </div>

      <FretboardSvg
        :is-dark-mode
        :interactive
        :string-x-positions
        :hover-point
        :focus-point
        :fret-number-size
        :show-fret-numbers
        :strings="chord.strings"
        :fret-count="chord.fretCount"
        :capo="chord.capo"
        :active-base-strings="getActiveBaseStrings(chord.tuning)"
        :is-mobile="uiStore.isMobile"
        @toggle-pitch="handleTogglePitchName"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import FretboardSvg from '@/components/FretboardSvg.vue';
import { CANVAS_CONFIG } from '@/constants';
import { useFretboardInteraction } from '@/services/useFretboardInteraction';
import { useUiStore } from '@/stores/uiStore';
import type { Chord, GuitarStringEntity, GuitarStringsModel } from '@/types';
import { getOpenStringStatusClass, getOpenStringStyle } from '@/utils/fretboardVisuals';
import { calcNoteLabel, getActiveBaseStrings, isMuted, isOpen } from '@/utils/musicTheory';
import { X } from '@lucide/vue';

export interface FretboardProps {
  chord: Chord;
  isDarkMode?: boolean;
  interactive?: boolean;
  scale?: number;
  fretNumberSize?: 'sm' | 'md' | 'lg';
  showOpenStrings?: boolean;
  showFretNumbers?: boolean;
  bgColor?: string;
  bordered?: boolean;
}

const props = withDefaults(defineProps<FretboardProps>(), {
  isDarkMode: false,
  interactive: true,
  scale: 1.0,
  fretNumberSize: 'md',
  showOpenStrings: true,
  showFretNumbers: true,
  bgColor: 'transparent',
  bordered: false,
});

const emit = defineEmits<{
  (e: 'drag-status-change', isDragging: boolean): void;
  (e: 'update:strings', strings: GuitarStringsModel): void;
  (e: 'update:capo', capo: number): void;
}>();

const uiStore = useUiStore();

const {
  fretBoardRef,
  hoverPoint,
  focusPoint,
  isFocused,
  stringXPositions,
  rawHeight,
  fretboardScale,
  realScaledWidth,
  realScaledHeight,
  activeTopOffset,
  handleRightClickRoot,
  handleLocalToggleOpenString,
  handleTogglePitchName,
} = useFretboardInteraction(
  props,
  capo => emit('update:capo', capo),
  strings => emit('update:strings', strings),
  isDragging => emit('drag-status-change', isDragging)
);

const getOpenStringTooltip = (str: GuitarStringEntity) => {
  return props.interactive && str.fret <= 0
    ? { content: '左键：切换空弦/静音 \n 右键：设为根音 \n 滚轮：切换升降号', placement: 'top' }
    : undefined;
};

const getOpenStringAriaLabel = (sIdx: number, str: GuitarStringsModel[number]) => {
  const stringNum = 6 - sIdx;
  if (str.fret > 0) {
    return `第 ${stringNum} 弦（已按第 ${str.fret} 品，点击清除按音）`;
  }
  if (isMuted(str)) {
    return `第 ${stringNum} 弦（静音，点击切换为空弦）`;
  }
  const noteName = calcNoteLabel(sIdx, 0, props.chord.capo, str.preferFlat, getActiveBaseStrings(props.chord.tuning));
  return `第 ${stringNum} 弦（空弦 ${noteName}，点击切换为静音）`;
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.fretboard-layout-scaler {
  display: inline-block;
  transition:
    width @duration-slow @bezier-sidebar,
    height @duration-slow @bezier-sidebar;
}

.fretboard-container {
  --fretboard-focus-color: var(--color-primary);
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  user-select: none;
  box-sizing: border-box;
  transition:
    transform @duration-slow @bezier-sidebar,
    background-color @duration-fast ease,
    border-color @duration-fast ease;

  &.is-bordered {
    border: 1px solid var(--border-light);
    border-radius: @radius-md;
  }

  &.is-interactive {
    touch-action: none;
    cursor: pointer;
  }

  &.is-disabled {
    pointer-events: none;
    cursor: default;
  }
}

.open-strings-wrapper {
  width: 100%;
  position: relative;
  pointer-events: none;
  box-sizing: border-box;
}

.open-string-btn {
  position: absolute;
  top: 10px;
  transform: translateX(-50%);
  width: 2.4rem;
  height: 2.4rem;
  box-sizing: border-box;
  box-shadow: @shadow-sm;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border-style: solid;
  border-width: 2px;
  padding: 0;
  cursor: pointer;
  transition:
    background-color @duration-fast ease,
    border-color @duration-fast ease,
    transform @duration-fast ease,
    opacity @duration-fast ease;
  will-change: transform;
  outline: none;

  &.no-border {
    border-color: transparent !important;
    box-shadow: none !important;
  }

  &.allow-events {
    pointer-events: auto;
  }

  &.block-events {
    pointer-events: none !important;
    cursor: default;
  }

  &.is-fret-available:active {
    transform: translateX(-50%) scale(0.92);
  }

  &.is-fret-pressed {
    opacity: 0 !important;
    transform: translateX(-50%) scale(1) !important;
    background-color: transparent !important;
    border-color: transparent !important;
    box-shadow: none !important;
  }

  &.is-muted-status {
    border-color: color-mix(in srgb, var(--color-danger), transparent 85%);
    color: var(--color-danger);
    background-color: color-mix(in srgb, var(--color-danger), transparent 92%) !important;
  }

  &.is-open-status {
    border-color: color-mix(in srgb, var(--color-primary), transparent 85%);
    color: var(--color-primary);
    background-color: color-mix(in srgb, var(--color-primary), transparent 92%) !important;
  }

  &.is-focused-hover {
    opacity: 1 !important;
    border-color: var(--color-primary) !important;
    box-shadow: 0 0 0 3.5px var(--color-primary) !important;
  }
}

.mute-icon {
  width: 1.5rem;
  height: 1.5rem;
}

.open-note-text {
  display: inline-block;
  line-height: 1;
  font-weight: 900;
  font-size: 1.5rem;
  letter-spacing: -0.05em;
}

@media (max-width: 768px) {
  .open-string-btn {
    width: 2.75rem;
    height: 2.75rem;
    transform: translateX(-50%) translateY(10px);

    &.is-fret-available:active {
      transform: translateX(-50%) translateY(10px) scale(0.92);
    }
  }

  .mute-icon {
    width: 1.4rem;
    height: 1.4rem;
  }

  .open-note-text {
    font-size: 1.5rem;
  }
}
</style>
