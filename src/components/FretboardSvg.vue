<template>
  <div class="fretboard-svg-wrapper">
    <div v-if="showFretNumbers" class="fret-numbers-overlay" aria-hidden="true">
      <span
        v-for="i in fretCount"
        :key="'fret-num-' + i"
        v-show="i < fretCount"
        class="fret-number-badge"
        :class="[`size-${fretNumberSize}`, { 'is-dark': isDarkMode }]"
        :style="getFretNumberStyle(i)"
      >
        {{ capo > 0 ? capo + i : i }}
      </span>
    </div>

    <svg
      ref="svgContainerRef"
      @keydown="handleGridKeydown"
      :width="CANVAS_CONFIG.BOARD_WIDTH"
      :height="fretCount * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.OFFSET_Y_BOTTOM"
      :viewBox="`0 0 ${CANVAS_CONFIG.BOARD_WIDTH} ${fretCount * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.OFFSET_Y_BOTTOM}`"
      style="overflow: visible"
      class="fretboard-svg"
      role="img"
      :aria-label="`吉他指板图，共 ${fretCount} 品${capo > 0 ? `，变调夹 Capo ${capo} 品` : ''}`"
    >
      <g v-memo="[fretCount, isDarkMode]">
        <line
          v-for="s in 6"
          :key="'string-' + s"
          :x1="stringXPositions[s - 1]"
          y1="0"
          :x2="stringXPositions[s - 1]"
          :y2="fretCount * CANVAS_CONFIG.FRET_HEIGHT"
          :stroke="isDarkMode ? '#ffffff' : '#0f172a'"
          :stroke-width="FRETBOARD_LINE_WIDTH"
          class="string-line"
          style="pointer-events: none"
          shape-rendering="crispEdges"
        />
        <line
          v-for="f in fretCount"
          :key="'fret-line-' + f"
          :x1="CANVAS_CONFIG.OFFSET_X"
          :y1="f * CANVAS_CONFIG.FRET_HEIGHT"
          :x2="stringXPositions[5]"
          :y2="f * CANVAS_CONFIG.FRET_HEIGHT"
          :stroke="isDarkMode ? '#cbd5e1' : '#334155'"
          :stroke-width="FRETBOARD_LINE_WIDTH"
          style="pointer-events: none"
          shape-rendering="crispEdges"
        />
        <rect
          :x="CANVAS_CONFIG.OFFSET_X - FRETBOARD_LINE_WIDTH / 2"
          y="-4"
          :width="5 * CANVAS_CONFIG.STRING_SPACING + FRETBOARD_LINE_WIDTH"
          height="8"
          :fill="isDarkMode ? '#ffffff' : '#0f172a'"
          style="pointer-events: none"
          rx="2"
        />
      </g>

      <g v-if="showPredictiveHover" class="finger-predictive" aria-hidden="true">
        <circle
          :cx="stringXPositions[hoverPoint!.stringIndex]"
          :cy="(hoverPoint!.fretIndex - 1) * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.FRET_HEIGHT / 2"
          r="28"
          :fill="isDarkMode ? '#28282a' : '#ffffff'"
          style="pointer-events: none"
        />

        <circle
          :cx="stringXPositions[hoverPoint!.stringIndex]"
          :cy="(hoverPoint!.fretIndex - 1) * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.FRET_HEIGHT / 2"
          r="25.5"
          fill="transparent"
          :stroke="isDarkMode ? 'rgba(255, 255, 255, 0.45)' : 'rgba(60, 60, 67, 0.35)'"
          stroke-width="3"
          stroke-dasharray="4 4"
          style="pointer-events: none"
        />
      </g>

      <template v-for="(str, sIdx) in strings" :key="'finger-' + sIdx">
        <g
          v-if="str.fret > 0 && str.fret <= fretCount"
          :class="[interactive ? 'finger-interactive' : 'finger-disabled']"
          :role="interactive ? 'button' : undefined"
          :tabindex="interactive ? 0 : undefined"
          :style="{ color: getFingerColor(str, isDarkMode) }"
          :aria-label="`第 ${6 - sIdx} 弦第 ${str.fret} 品，音名 ${calcNoteLabel(sIdx, str.fret, capo, str.preferFlat, activeBaseStrings)}。按 Enter/空格 切换升降号，按 Delete/Backspace 清除按音，按 R 设为根音`"
          @dblclick.prevent.stop="emit('toggle-pitch', sIdx)"
          @keydown="e => handleFingerKeydown(e, sIdx)"
          data-focusable-outline
        >
          <circle
            :cx="stringXPositions[sIdx]"
            :cy="(str.fret - 1) * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.FRET_HEIGHT / 2"
            r="30"
            :fill="getFingerColor(str, isDarkMode)"
            class="finger-circle"
            :class="{ 'is-root-glow': str.isRoot }"
          />
          <text
            :x="stringXPositions[sIdx]"
            :y="(str.fret - 1) * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.FRET_HEIGHT / 2"
            text-anchor="middle"
            dy="0.36em"
            font-size="30"
            font-weight="900"
            :fill="getFingerTextColor(str, isDarkMode)"
            class="finger-text"
            style="pointer-events: none"
            aria-hidden="true"
          >
            {{ calcNoteLabel(sIdx, str.fret, capo, str.preferFlat, activeBaseStrings) }}
          </text>
        </g>
      </template>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { CANVAS_CONFIG, FRETBOARD_LINE_WIDTH } from '@/constants';
import { useGridNavigation } from '@/services/useGridNavigation';
import type { GuitarStringsModel } from '@/types';
import { getFingerColor, getFingerTextColor } from '@/utils/fretboardVisuals';
import { calcNoteLabel } from '@/utils/musicTheory';
import { computed, useTemplateRef } from 'vue';

const props = withDefaults(
  defineProps<{
    strings: GuitarStringsModel;
    fretCount: number;
    capo: number;
    activeBaseStrings: readonly number[];
    isDarkMode: boolean;
    interactive: boolean;
    isMobile: boolean;
    stringXPositions: number[];
    hoverPoint: { stringIndex: number; fretIndex: number } | null;
    fretNumberSize?: 'sm' | 'md' | 'lg';
    showFretNumbers?: boolean;
  }>(),
  { fretNumberSize: 'md', showFretNumbers: true }
);

const emit = defineEmits<{
  (e: 'toggle-pitch', stringIndex: number): void;
  (e: 'clear-fret', stringIndex: number): void;
  (e: 'toggle-root', stringIndex: number): void;
}>();

const svgContainerRef = useTemplateRef<SVGSVGElement>('svgContainerRef');
const { handleKeydown: handleGridKeydown } = useGridNavigation(undefined, svgContainerRef as any);

const getFretNumberStyle = (fretIndex: number) => {
  const yPixel = fretIndex * CANVAS_CONFIG.FRET_HEIGHT;
  const xPixel = props.stringXPositions[0] - 22;
  return {
    top: `${yPixel}px`,
    left: `${xPixel}px`,
  };
};

const showPredictiveHover = computed(() => {
  const hp = props.hoverPoint;
  return (
    props.interactive &&
    hp !== null &&
    hp.fretIndex > 0 &&
    hp.fretIndex <= props.fretCount &&
    hp.stringIndex >= 0 &&
    hp.stringIndex <= 5 &&
    !props.isMobile
  );
});

const handleFingerKeydown = (e: KeyboardEvent, sIdx: number) => {
  if (!props.interactive) return;

  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    e.stopPropagation();
    emit('toggle-pitch', sIdx);
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    e.stopPropagation();
    emit('clear-fret', sIdx);
  } else if (e.key === 'r' || e.key === 'R') {
    e.preventDefault();
    e.stopPropagation();
    emit('toggle-root', sIdx);
  }
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.module.less';

.fretboard-svg-wrapper {
  position: relative;
  width: 100%;
  display: inline-block;
}

.fretboard-svg {
  width: 100%;
  pointer-events: auto;
  box-sizing: border-box;
  display: block;
}

.fret-numbers-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
}

.fret-number-badge {
  position: absolute;
  transform: translate(-100%, -50%);
  font-weight: 900;
  line-height: 1;
  color: #475569;
  user-select: none;

  &.is-dark {
    color: #e2e8f0;
  }

  &.size-sm {
    font-size: 20px;
  }

  &.size-md {
    font-size: 30px;
  }

  &.size-lg {
    font-size: 40px;
  }
}

.string-line {
  transition: y2 @duration-slow @bezier-sidebar;
}

.finger-interactive {
  cursor: pointer;
  pointer-events: auto;
  outline: none;
}

.finger-predictive {
  pointer-events: none;
}

.finger-disabled {
  cursor: default;
}

.finger-circle {
  transition: filter @duration-fast ease;
  filter: var(--finger-shadow);

  &.is-root-glow {
    filter: var(--root-glow);
  }
}

.finger-text {
  transition: fill @duration-fast ease;
}
</style>
