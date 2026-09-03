<template>
  <g
    :aria-label
    :class="{
      '[&_.note-circle]:hidden [&_.note-mute-x]:hidden [&_.note-svg-label]:hidden': isPressed,
    }"
    @click.stop="$emit('click', $event)"
    @dblclick.prevent.stop="$emit('toggle-pitch')"
    class="pointer-events-auto cursor-pointer outline-none [&:hover_.note-outline-ring]:opacity-100"
    role="img"
    tabindex="-1"
  >
    <circle
      v-if="isHovered || isFocused"
      :cx="x"
      :cy="y"
      :fill="hoverFillColor"
      :r="outlineRadius"
      :stroke-width="NOTE_DISPLAY.FINGER_OUTLINE_WIDTH"
      :style="{ stroke: noteRingColor }"
      class="note-outline-ring duration-fast transition-[fill,stroke]"
    />

    <circle
      v-if="!isPressed"
      :cx="x"
      :cy="y"
      :fill="noteBgColor"
      :r="dotRadius"
      :stroke-width="noteStrokeWidth"
      :style="{ stroke: noteStrokeColor }"
      class="note-circle duration-fast filter-(--finger-shadow) transition-[fill,stroke]"
    />

    <g
      v-if="!isPressed && isMuted"
      :stroke="muteStrokeColor"
      :stroke-width="muteStrokeWidth"
      class="note-mute-x pointer-events-none"
      stroke-linecap="round"
    >
      <line :x1="x - muteXHalf" :x2="x + muteXHalf" :y1="y - muteXHalf" :y2="y + muteXHalf" />
      <line :x1="x + muteXHalf" :x2="x - muteXHalf" :y1="y - muteXHalf" :y2="y + muteXHalf" />
    </g>

    <text
      v-else-if="!isPressed && label"
      :dy="labelVerticalOffset"
      :fill="noteTextColor"
      :font-size="svgFontSize"
      :x
      :y
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

    <circle
      :cx="x"
      :cy="y"
      :r="NOTE_DISPLAY.FINGER_DOT_RADIUS"
      class="pointer-events-auto cursor-pointer"
      fill="transparent"
    />
  </g>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

import { FRETBOARD_COLORS, NOTE_DISPLAY } from '@/utils/core/constants';
import { getFingerColor, getFingerTextColor } from '@/utils/music/chord-fretboard';

const {
  x,
  y,
  label = '',
  isAccidental = false,
  preferFlat = false,
  isRoot = false,
  isOpenString = false,
  isMuted = false,
  isPressed = false,
  isDarkMode = false,
  isHovered = false,
  isFocused = false,
  ariaLabel = '',
} = defineProps<{
  x: number;
  y: number;
  label?: string;
  isAccidental?: boolean;
  preferFlat?: boolean;
  isRoot?: boolean;
  isOpenString?: boolean;
  isMuted?: boolean;
  isPressed?: boolean;
  isDarkMode?: boolean;
  isHovered?: boolean;
  isFocused?: boolean;
  ariaLabel?: string;
}>();

defineEmits<{
  (e: 'click', event: MouseEvent): void;
  (e: 'toggle-pitch'): void;
}>();

/** 主音强调 */
const showRootStyle = computed(() => isRoot);

/** 圆点半径：带描边的标记（空弦圈/静音圈）描边以路径为中心向两侧各扩 stroke/2，
 *  需向内收缩相同量，使视觉外缘与无描边的按弦点（r=28）对齐，保证相邻标记间隙一致 */
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
  return 'transparent';
});

const noteStrokeWidth = computed(() => (isOpenString ? 2 : 0));
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
