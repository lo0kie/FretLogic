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
      :style="{
        width: `${CANVAS_CONFIG.BOARD_WIDTH}px`,
        height: `${rawHeight}px`,
        transform: `scale(${fretboardScale})`,
        transformOrigin: 'top left',
        backgroundColor: bgColor,
      }"
      @contextmenu.prevent.stop="handleRightClickRoot"
    >
      <!-- 应用动态的顶部偏移量，并在 showOpenStrings 为 false 时卸载内容 -->
      <div class="open-strings-wrapper" :style="{ height: `${activeTopOffset}px` }">
        <template v-if="showOpenStrings">
          <template v-for="(str, sIdx) in strings" :key="'os-' + sIdx">
            <GlobalTooltip
              placement="top"
              :content="
                interactive && str.fret <= 0 ? '左键：切换空弦/静音 \n 右键：设为根音 \n 滚轮：切换升降号' : undefined
              "
              :style="{
                position: 'absolute',
                left: `${stringXPositions[sIdx]}px`,
                top: '10px',
                transform: 'translateX(-50%)',
                width: 'auto',
              }"
            >
              <button
                v-wave
                :tabindex="interactive ? 0 : -1"
                role="button"
                :aria-label="getOpenStringAriaLabel(sIdx, str)"
                :aria-disabled="!interactive"
                :title="str.fret > 0 ? undefined : getOpenStringAriaLabel(sIdx, str)"
                @click.stop="handleLocalToggleOpenString(sIdx)"
                @dblclick.prevent.stop="handleTogglePitchName(sIdx)"
                @keydown.enter.prevent.stop="handleLocalToggleOpenString(sIdx)"
                @keydown.space.prevent.stop="handleLocalToggleOpenString(sIdx)"
                class="open-string-btn"
                :class="[
                  str.fret > 0 ? 'is-fret-pressed' : 'is-fret-available',
                  getOpenStringStatusClass(str),
                  interactive ? 'allow-events' : 'block-events',
                  { 'no-border': !bordered },
                ]"
                :style="{ backgroundColor: bgColor, ...getOpenStringStyle(str, isDarkMode) }"
              >
                <template v-if="str.fret <= 0">
                  <X v-if="isMuted(str)" class="mute-icon" stroke-width="3" aria-hidden="true" />
                  <span v-else-if="isOpen(str)" class="open-note-text">
                    {{ calcNoteLabel(sIdx, 0, capo, str.preferFlat, activeBaseStrings) }}
                  </span>
                </template>
              </button>
            </GlobalTooltip>
          </template>
        </template>
      </div>

      <FretboardSvg
        :strings="strings"
        :fret-count="fretCount"
        :capo="capo"
        :active-base-strings="activeBaseStrings"
        :is-dark-mode="isDarkMode"
        :interactive="interactive"
        :is-mobile="uiStore.isMobile"
        :string-x-positions="stringXPositions"
        :hover-point="hoverPoint"
        :fret-number-size="fretNumberSize"
        :show-fret-numbers="showFretNumbers"
        @toggle-pitch="handleTogglePitchName"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { X } from '@lucide/vue';

import FretboardSvg from '@/components/FretboardSvg.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { CANVAS_CONFIG } from '@/constants';
import { useFretboardInteraction } from '@/services/useFretboardInteraction';
import { useUiStore } from '@/stores/uiStore';
import type { GuitarStringsModel } from '@/types';
import { getOpenStringStatusClass, getOpenStringStyle } from '@/utils/fretboardVisuals';
import { calcNoteLabel, DEFAULT_TUNING_MAPPING, isMuted, isOpen } from '@/utils/musicTheory';

const props = withDefaults(
  defineProps<{
    strings: GuitarStringsModel;
    fretCount: number;
    capo: number;
    activeBaseStrings?: readonly number[];
    isDarkMode?: boolean;
    interactive?: boolean;
    scale?: number;
    fretNumberSize?: 'sm' | 'md' | 'lg';
    showOpenStrings?: boolean;
    showFretNumbers?: boolean;
    bgColor?: string; // 支持自定义背景色
    bordered?: boolean;
  }>(),
  {
    activeBaseStrings: () => DEFAULT_TUNING_MAPPING,
    isDarkMode: false,
    interactive: true,
    scale: 1.0,
    fretNumberSize: 'md',
    showOpenStrings: true,
    showFretNumbers: true,
    bgColor: 'transparent',
    bordered: false,
  }
);

const emit = defineEmits<{
  (e: 'update:strings', value: GuitarStringsModel): void;
  (e: 'update:capo', value: number): void;
  (e: 'drag-status-change', isDragging: boolean): void;
}>();

const uiStore = useUiStore();

const {
  fretBoardRef,
  hoverPoint,
  stringXPositions,
  rawHeight,
  fretboardScale,
  realScaledWidth,
  realScaledHeight,
  activeTopOffset,
  handleRightClickRoot,
  handleLocalToggleOpenString,
  handleTogglePitchName,
} = useFretboardInteraction(props, emit);

const getOpenStringAriaLabel = (sIdx: number, str: GuitarStringsModel[number]) => {
  const stringNum = 6 - sIdx;
  if (str.fret > 0) {
    return `第 ${stringNum} 弦（已按第 ${str.fret} 品，点击清除按音）`;
  }
  if (isMuted(str)) {
    return `第 ${stringNum} 弦（静音，点击切换为空弦）`;
  }
  const noteName = calcNoteLabel(sIdx, 0, props.capo, str.preferFlat, props.activeBaseStrings);
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

  /* 边框切换 */
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
  transition: @transition-fast;
  outline: none;

  &.no-border {
    border-color: transparent !important;
    box-shadow: none !important;
  }

  &:focus-visible {
    box-shadow: @focus-ring-primary;
    border-color: var(--color-primary);
  }

  &.allow-events {
    pointer-events: auto;
  }

  &.block-events {
    pointer-events: none;
  }

  &.is-fret-available:active {
    transform: scale(0.92);
  }

  /* 🌟 修改点 4：按品时透明隐藏，但保留事件响应 (移除 pointer-events: none) */
  &.is-fret-pressed {
    opacity: 0 !important;
    transform: scale(1) !important;
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
    transform: translateY(10px);

    &.is-fret-available:active {
      transform: translateY(10px) scale(0.92);
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
