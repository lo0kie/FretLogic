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
          :x1="CANVAS_CONFIG.OFFSET_X_LEFT"
          :y1="f * CANVAS_CONFIG.FRET_HEIGHT"
          :x2="stringXPositions[5]"
          :y2="f * CANVAS_CONFIG.FRET_HEIGHT"
          :stroke="isDarkMode ? '#cbd5e1' : '#334155'"
          :stroke-width="FRETBOARD_LINE_WIDTH"
          style="pointer-events: none"
          shape-rendering="crispEdges"
        />
        <rect
          :x="CANVAS_CONFIG.OFFSET_X_LEFT - FRETBOARD_LINE_WIDTH / 2"
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
          r="33"
          :fill="isDarkMode ? '#28282a' : '#ffffff'"
          :stroke="isDarkMode ? '#64d2ff' : '#007aff'"
          stroke-width="3.5"
          style="pointer-events: none"
        />
      </g>

      <g v-if="showKeyboardFocus" class="finger-keyboard-focus" aria-hidden="true">
        <circle
          :cx="stringXPositions[focusPoint!.stringIndex]"
          :cy="(focusPoint!.fretIndex - 1) * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.FRET_HEIGHT / 2"
          r="33"
          :fill="isDarkMode ? '#28282a' : '#ffffff'"
          :stroke="isDarkMode ? '#64d2ff' : '#007aff'"
          stroke-width="3.5"
          style="pointer-events: none"
        />
      </g>

      <template v-for="(str, sIdx) in strings" :key="'finger-' + sIdx">
        <g
          v-if="str.fret > 0 && str.fret <= fretCount"
          v-memo="[
            str.fret,
            str.preferFlat,
            rootStringIndex,
            interactive,
            isDarkMode,
            capo,
            activeBaseStrings[sIdx],
            stringXPositions[sIdx],
          ]"
          :class="[interactive ? 'finger-interactive' : 'finger-disabled']"
          :tabindex="interactive ? -1 : undefined"
          :style="{ color: getFingerColor(isRoot(sIdx), isDarkMode) }"
          :aria-label="`第 ${6 - sIdx} 弦第 ${str.fret} 品，音名 ${formatStringLabel(sIdx, str.fret, str.preferFlat, capo, activeBaseStrings)}`"
          @dblclick.prevent.stop="emit('toggle-pitch', sIdx)"
        >
          <circle
            :cx="stringXPositions[sIdx]"
            :cy="(str.fret - 1) * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.FRET_HEIGHT / 2"
            :r="NOTE_DISPLAY.FINGER_DOT_RADIUS"
            :fill="getFingerColor(isRoot(sIdx), isDarkMode)"
            class="finger-circle"
            :class="{ 'is-root-glow': isRoot(sIdx) }"
          />
          <text
            :x="stringXPositions[sIdx]"
            :y="(str.fret - 1) * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.FRET_HEIGHT / 2"
            text-anchor="middle"
            dy="0.36em"
            :font-size="NOTE_DISPLAY.FINGER_FONT_SIZE"
            font-weight="600"
            :fill="getFingerTextColor(isRoot(sIdx), isDarkMode)"
            class="finger-text"
            style="pointer-events: none"
            aria-hidden="true"
          >
            <template v-if="str.fret < 0">✕</template>
            <template v-else>
              <tspan>{{ noteInfo(sIdx, str).label }}</tspan>
              <tspan
                v-if="noteInfo(sIdx, str).isAccidental"
                class="finger-accidental"
                :font-size="String(Math.round(NOTE_DISPLAY.FINGER_FONT_SIZE * NOTE_DISPLAY.ACCIDENTAL_SCALE))"
                :dy="String(-NOTE_DISPLAY.FINGER_FONT_SIZE * NOTE_DISPLAY.ACCIDENTAL_RAISE_RATIO)"
              >
                {{ str.preferFlat ? 'b' : '#' }}
              </tspan>
            </template>
          </text>
        </g>
      </template>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { CANVAS_CONFIG, FRETBOARD_LINE_WIDTH, NOTE_DISPLAY } from '@/constants';
import type { GuitarStringEntity, GuitarStringsModel } from '@/types';
import { getFingerColor, getFingerTextColor } from '@/utils/fretboardVisuals';
import { computeStringLabelAccidental, formatStringLabel } from '@/utils/musicTheory';
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    strings: GuitarStringsModel;
    fretCount: number;
    capo: number;
    activeBaseStrings: readonly number[];
    rootStringIndex?: number | null;
    isDarkMode: boolean;
    interactive: boolean;
    isMobile: boolean;
    stringXPositions: number[];
    hoverPoint?: { stringIndex: number; fretIndex: number } | null;
    focusPoint?: { stringIndex: number; fretIndex: number } | null;
    fretNumberSize?: 'sm' | 'md' | 'lg';
    showFretNumbers?: boolean;
  }>(),
  {
    fretNumberSize: 'md',
    showFretNumbers: true,
    hoverPoint: null,
    focusPoint: null,
    rootStringIndex: null,
  }
);

const emit = defineEmits<{
  (e: 'toggle-pitch', stringIndex: number): void;
  (e: 'clear-fret', stringIndex: number): void;
  (e: 'toggle-root', stringIndex: number): void;
}>();

const getFretNumberStyle = (fretIndex: number) => {
  const yPixel = fretIndex * CANVAS_CONFIG.FRET_HEIGHT;
  const xPixel = props.stringXPositions[0] - 22;
  return {
    top: `${yPixel}px`,
    left: `${xPixel}px`,
  };
};

/** 单点根音标记：某弦是否为根音 */
const isRoot = (sIdx: number) => props.rootStringIndex === sIdx;

/** 实时派生某弦音名（label + 是否变化音级），不依赖存储字段 */
const noteInfo = (sIdx: number, str: GuitarStringEntity) =>
  computeStringLabelAccidental(sIdx, str.fret, props.capo, str.preferFlat, props.activeBaseStrings);

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

const showKeyboardFocus = computed(() => {
  const fp = props.focusPoint;
  return (
    props.interactive &&
    fp !== null &&
    fp.fretIndex > 0 &&
    fp.fretIndex <= props.fretCount &&
    fp.stringIndex >= 0 &&
    fp.stringIndex <= 5
  );
});
</script>

<style scoped lang="less">
@import '@/assets/tokens.module.less';

.fretboard-svg-wrapper {
  position: relative;
  width: 100%;
  display: inline-block;
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
  font-weight: 800;
  line-height: 1;
  color: #475569;
  user-select: none;
  font-family: 'Helvetica Neue', Arial, sans-serif;

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

.finger-predictive,
.finger-keyboard-focus {
  pointer-events: none;
}

.fretboard-svg {
  width: 100%;
  pointer-events: none;
  box-sizing: border-box;
  display: block;
}

.finger-disabled {
  cursor: default;
  pointer-events: none;
  outline: none;
}

.finger-circle {
  transition: filter @duration-fast ease;
  filter: var(--finger-shadow);

  &.is-root-glow {
    filter: var(--root-glow);
  }
}

.finger-text {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  transition: fill @duration-fast ease;
}
</style>
