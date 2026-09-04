<template>
  <g :aria-label @dblclick.prevent.stop="$emit('toggle-pitch')" class="outline-none" role="img" tabindex="-1">
    <g class="duration-base transition-opacity">
      <circle
        v-if="isHovered || isFocused"
        :cx="x"
        :cy="y"
        :r="outlineRadius"
        :stroke-width="NOTE_DISPLAY.FINGER_OUTLINE_WIDTH"
        :style="{ fill: hoverFillColor, stroke: noteRingColor }"
        class="note-outline-ring"
      />

      <circle
        :cx="x"
        :cy="y"
        :r="dotRadius"
        :stroke-width="noteStrokeWidth"
        :style="{ fill: noteBgColor, stroke: noteStrokeColor }"
        class="note-circle filter-(--finger-shadow)"
      />

      <g
        :class="isMuted ? 'opacity-100' : 'opacity-0'"
        :stroke-width="muteStrokeWidth"
        :style="{ stroke: muteStrokeColor }"
        class="note-mute-x pointer-events-none"
        stroke-linecap="round"
      >
        <line :x1="x - muteXHalf" :x2="x + muteXHalf" :y1="y - muteXHalf" :y2="y + muteXHalf" />
        <line :x1="x + muteXHalf" :x2="x - muteXHalf" :y1="y - muteXHalf" :y2="y + muteXHalf" />
      </g>

      <text
        v-if="label"
        :x
        :y
        :class="isMuted || hideLabel ? 'opacity-0' : 'opacity-100'"
        :dy="labelVerticalOffset"
        :font-size="svgFontSize"
        :style="{ fill: noteTextColor }"
        class="note-svg-label pointer-events-none font-[Helvetica_Neue,Arial,sans-serif] select-none"
        font-weight="700"
        text-anchor="middle"
      >
        <tspan> {{ label }} </tspan>
        <tspan
          v-if="isAccidental"
          :dx="accidentalDx"
          :dy="accidentalDy"
          :font-size="svgAccidentalFontSize"
          font-weight="700"
        >
          {{ preferFlat ? '♭' : '♯' }}
        </tspan>
      </text>
    </g>

    <circle
      :cx="x"
      :cy="y"
      :r="NOTE_DISPLAY.FINGER_DOT_RADIUS"
      class="pointer-events-auto cursor-pointer"
      fill="transparent"
    />
  </g>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { getFingerColor, getFingerTextColor } from '@/domains/fretboard/model/coordinates';

import { FRETBOARD_COLORS, NOTE_DISPLAY } from '../constants';

const {
  x,
  y,
  label = '',
  isAccidental = false,
  preferFlat = false,
  isRoot = false,
  isOpenString = false,
  isMuted = false,
  isDarkMode = false,
  isHovered = false,
  isFocused = false,
  ariaLabel = '',
  hideLabel = false,
} = defineProps<{
  x: number;
  y: number;
  label?: string;
  isAccidental?: boolean;
  preferFlat?: boolean;
  isRoot?: boolean;
  isOpenString?: boolean;
  isMuted?: boolean;
  isDarkMode?: boolean;
  isHovered?: boolean;
  isFocused?: boolean;
  ariaLabel?: string;
  hideLabel?: boolean;
}>();

defineEmits<{
  (e: 'toggle-pitch'): void;
}>();

/** 主音强调 */
const showRootStyle = computed(() => isRoot);

/** 描边宽度恒定 2px，按品时描边颜色与背景色相同，确保外缘总半径恒为 28px 且颜色平滑插值无跳变 */
const noteStrokeWidth = computed(() => 2);
const dotRadius = computed(() => NOTE_DISPLAY.FINGER_DOT_RADIUS - noteStrokeWidth.value / 2);
const outlineRadius = computed(() => NOTE_DISPLAY.FINGER_OUTLINE_RADIUS);
const muteXHalf = computed(() => NOTE_DISPLAY.FINGER_FONT_SIZE * 0.28);
const muteStrokeWidth = computed(() => 3);

const SVG_FONT_SIZE_RATIO = 0.9;
const svgFontSize = computed(() => NOTE_DISPLAY.FINGER_FONT_SIZE * SVG_FONT_SIZE_RATIO);
const svgAccidentalFontSize = computed(() => svgFontSize.value * 0.6);
const labelVerticalOffset = computed(() => svgFontSize.value * 0.35);
const accidentalDx = computed(() => svgFontSize.value * 0.03);
const accidentalDy = computed(() => -svgFontSize.value * 0.3);
const hoverFillColor = computed(() => 'var(--fb-hover)');

const noteBgColor = computed(() => {
  if (isOpenString) {
    if (isMuted) {
      return isDarkMode ? '#351f20' : '#ffefee';
    }
    if (showRootStyle.value) {
      return isDarkMode ? FRETBOARD_COLORS.openRootBgDark : FRETBOARD_COLORS.openRootBgLight;
    }
    return isDarkMode ? '#182737' : '#ebf4ff';
  }
  return getFingerColor(showRootStyle.value, isDarkMode);
});

const noteStrokeColor = computed(() => {
  if (isOpenString) {
    if (isMuted) {
      return isDarkMode ? '#762b28' : '#ffc4c1';
    }
    if (showRootStyle.value) {
      return isDarkMode ? FRETBOARD_COLORS.openRootBorderDark : FRETBOARD_COLORS.openRootBorderLight;
    }
    return isDarkMode ? '#144477' : '#b3d7ff';
  }
  return noteBgColor.value;
});

const muteStrokeColor = computed(() => 'var(--color-danger)');

const noteRingColor = computed(() => {
  if (showRootStyle.value) return 'var(--color-warning)';
  if (isOpenString && isMuted) {
    return 'var(--color-danger)';
  }
  return 'var(--color-primary)';
});

const noteTextColor = computed(() => {
  if (isOpenString) {
    if (isMuted) return 'var(--color-danger)';
    if (showRootStyle.value) {
      return isDarkMode ? FRETBOARD_COLORS.openRootTextDark : FRETBOARD_COLORS.openRootTextLight;
    }
    return 'var(--color-primary)';
  }
  return getFingerTextColor(showRootStyle.value, isDarkMode);
});
</script>

<style scoped lang="scss">
.note-circle {
  transition:
    fill $duration-base $bezier-standard,
    stroke $duration-base $bezier-standard;
  will-change: fill, stroke;
}

.note-svg-label {
  transition:
    fill $duration-base $bezier-standard,
    opacity $duration-base $bezier-standard;
  will-change: fill, opacity;
}

.note-mute-x {
  transition:
    opacity $duration-base $bezier-standard,
    stroke $duration-base $bezier-standard;
  will-change: opacity, stroke;
}

.note-outline-ring {
  transition:
    fill $duration-base $bezier-standard,
    stroke $duration-base $bezier-standard;
  will-change: fill, stroke;
}

@media (prefers-reduced-motion: reduce) {
  .note-circle,
  .note-svg-label,
  .note-mute-x,
  .note-outline-ring {
    transition: none;
  }
}
</style>
