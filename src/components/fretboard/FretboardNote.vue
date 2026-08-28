<template>
  <g
    :class="[
      interactive
        ? 'cursor-pointer pointer-events-auto outline-none [&:hover_.note-outline-ring]:opacity-100'
        : 'cursor-default pointer-events-none outline-none',
      {
        '[&_.note-circle]:hidden [&_.note-svg-label]:hidden [&_.note-mute-x]:hidden': isPressed,
      },
    ]"
    tabindex="-1"
    :aria-label="ariaLabel"
    @click.stop="interactive && $emit('click', $event)"
    @dblclick.prevent.stop="interactive && $emit('toggle-pitch')"
  >
    <!-- 统一的外边框环（Hover / Focus / 键盘聚焦） -->
    <circle
      v-if="isHovered || isFocused"
      :cx="x"
      :cy="y"
      :r="outlineRadius"
      :fill="hoverFillColor"
      :style="{ stroke: noteRingColor }"
      :stroke-width="NOTE_DISPLAY.FINGER_OUTLINE_WIDTH"
      class="note-outline-ring transition-[fill,stroke] duration-fast"
    />

    <!-- 音符圆圈背景 -->
    <circle
      v-if="!isPressed && (showPitchNames || !isMuted)"
      :cx="x"
      :cy="y"
      :r="dotRadius"
      :fill="noteBgColor"
      :style="{ stroke: noteStrokeColor }"
      :stroke-width="noteStrokeWidth"
      class="note-circle transition-[fill,stroke] duration-fast [filter:var(--finger-shadow)]"
      :class="{ '[filter:var(--root-glow)]': showRootStyle && !interactive }"
    />

    <!-- 静音/禁用状态：原生 SVG 画 X -->
    <g
      v-if="!isPressed && isMuted"
      class="note-mute-x pointer-events-none"
      :stroke="muteStrokeColor"
      :stroke-width="muteStrokeWidth"
      stroke-linecap="round"
    >
      <line :x1="x - muteXHalf" :y1="y - muteXHalf" :x2="x + muteXHalf" :y2="y + muteXHalf" />
      <line :x1="x + muteXHalf" :y1="y - muteXHalf" :x2="x - muteXHalf" :y2="y + muteXHalf" />
    </g>

    <!-- 音名文字：原生 SVG <text> -->
    <text
      v-else-if="!isPressed && label"
      :x="x"
      :y="y"
      text-anchor="middle"
      :dy="labelVerticalOffset"
      :fill="noteTextColor"
      :font-size="svgFontSize"
      font-weight="700"
      class="note-svg-label font-[Helvetica_Neue,Arial,sans-serif] select-none pointer-events-none"
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

    <!-- 透明命中区：仅交互模式下拦截点击放大命中；非交互/拾取预览时放行，避免遮挡下层可点击元素（如候选横按梁） -->
    <circle
      class="transition-[pointer-events]"
      :class="interactive ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'"
      :cx="x"
      :cy="y"
      :r="NOTE_DISPLAY.FINGER_DOT_RADIUS"
      fill="transparent"
    />
  </g>
</template>

<script setup lang="ts">
import { FRETBOARD_COLORS, NOTE_DISPLAY } from '@/utils/core/constants';
import { getFingerColor, getFingerTextColor } from '@/utils/music/chord-fretboard';
import { computed } from 'vue';

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
  interactive = true,
  isHovered = false,
  isFocused = false,
  showPitchNames = true,
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
  interactive?: boolean;
  isHovered?: boolean;
  isFocused?: boolean;
  showPitchNames?: boolean;
  ariaLabel?: string;
}>();

defineEmits<{
  (e: 'click', event: MouseEvent): void;
  (e: 'toggle-pitch'): void;
}>();

/** 主音强调仅在显示音名时生效；不显示音名状态下主音不强调 */
const showRootStyle = computed(() => showPitchNames && isRoot);

/** 圆点半径：不显示音名时指板按品圆点为 20，空弦圈为 16；显示音名时统一为 28 */
const dotRadius = computed(() => {
  if (!showPitchNames) {
    return isOpenString ? 16 : 24;
  }
  return NOTE_DISPLAY.FINGER_DOT_RADIUS;
});

const outlineRadius = computed(() => {
  if (!showPitchNames) {
    return isOpenString ? 20 : 28;
  }
  return NOTE_DISPLAY.FINGER_OUTLINE_RADIUS;
});

const muteXHalf = computed(() => {
  if (isOpenString && !showPitchNames) return 12;
  return NOTE_DISPLAY.FINGER_FONT_SIZE * 0.28;
});

const muteStrokeWidth = computed(() => {
  if (isOpenString && !showPitchNames) return 3.5;
  return 3;
});

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
      return !showPitchNames ? 'transparent' : isDarkMode ? '#351f20' : '#ffefee';
    }
    if (showRootStyle.value) {
      return isDarkMode ? FRETBOARD_COLORS.openRootBgDark : FRETBOARD_COLORS.openRootBgLight;
    }
    return !showPitchNames ? 'transparent' : isDarkMode ? '#182737' : '#ebf4ff';
  }
  if (!showPitchNames) {
    return 'var(--fb-line)';
  }
  return getFingerColor(showRootStyle.value, isDarkMode);
});

const noteStrokeColor = computed(() => {
  if (isOpenString) {
    if (isMuted) {
      return !showPitchNames ? 'transparent' : isDarkMode ? '#762b28' : '#ffc4c1';
    }
    if (showRootStyle.value) {
      return isDarkMode ? FRETBOARD_COLORS.openRootBorderDark : FRETBOARD_COLORS.openRootBorderLight;
    }
    return !showPitchNames ? 'var(--fb-line)' : isDarkMode ? '#144477' : '#b3d7ff';
  }
  return 'transparent';
});

const noteStrokeWidth = computed(() => {
  if (isOpenString) {
    if (!showPitchNames && isMuted) return 0;
    return 2;
  }
  return 0;
});

const muteStrokeColor = computed(() => {
  if (!showPitchNames) return 'var(--fb-line)';
  return 'var(--color-danger)';
});

const noteRingColor = computed(() => {
  if (showRootStyle.value) return 'var(--color-warning)';
  if (isOpenString && isMuted) {
    return !showPitchNames ? 'var(--fb-line)' : 'var(--color-danger)';
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
