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
      :r="NOTE_DISPLAY.FINGER_OUTLINE_RADIUS"
      :fill="hoverFillColor"
      :style="{ stroke: noteRingColor }"
      :stroke-width="NOTE_DISPLAY.FINGER_OUTLINE_WIDTH"
      class="note-outline-ring transition-[fill,stroke] duration-fast"
    />
    <!-- 音符圆圈背景 -->
    <circle
      v-if="!isPressed"
      :cx="x"
      :cy="y"
      :r="NOTE_DISPLAY.FINGER_DOT_RADIUS"
      :fill="noteBgColor"
      :style="{ stroke: noteStrokeColor }"
      :stroke-width="noteStrokeWidth"
      class="note-circle transition-[filter,fill,stroke] duration-fast [filter:var(--finger-shadow)]"
      :class="{ '[filter:var(--root-glow)]': isRoot && !interactive }"
    />
    <!-- 静音状态：原生 SVG 画 X，不用图标组件/foreignObject -->
    <g
      v-if="!isPressed && isMuted"
      class="note-mute-x pointer-events-none"
      :stroke="noteTextColor"
      stroke-width="4"
      stroke-linecap="round"
    >
      <line :x1="x - muteXHalf" :y1="y - muteXHalf" :x2="x + muteXHalf" :y2="y + muteXHalf" />
      <line :x1="x + muteXHalf" :y1="y - muteXHalf" :x2="x - muteXHalf" :y2="y + muteXHalf" />
    </g>
    <!-- 音名文字：原生 SVG <text>，不再用 foreignObject 包 HTML -->
    <!-- 垂直居中用 dy 手动算偏移，不用 dominant-baseline：
         html-to-image 导出时会把 SVG 序列化成字符串再用 <img> 重新加载解析，
         这个"重新解析"过程里浏览器对 dominant-baseline 的支持经常和实时 DOM 渲染不一致，
         容易退化回默认 alphabetic 基线，导致导出图片里文字往下沉、不居中。
         dy 是纯数值偏移，序列化前后表现一致，更稳。 -->
    <text
      v-else-if="!isPressed"
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
    <!-- 始终存在的透明命中区 -->
    <circle
      class="pointer-events-auto cursor-pointer"
      :cx="x"
      :cy="y"
      :r="NOTE_DISPLAY.FINGER_DOT_RADIUS"
      fill="transparent"
    />
  </g>
</template>

<script setup lang="ts">
import { getFingerColor, getFingerTextColor } from '@/utils/music/chord-fretboard';
import { FRETBOARD_COLORS, NOTE_DISPLAY } from '@/utils/core/constants';
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
  ariaLabel?: string;
}>();

defineEmits<{
  (e: 'click', event: MouseEvent): void;
  (e: 'toggle-pitch'): void;
}>();

const muteXHalf = computed(() => NOTE_DISPLAY.FINGER_FONT_SIZE * 0.28);
const SVG_FONT_SIZE_RATIO = 0.9;
const svgFontSize = computed(() => NOTE_DISPLAY.FINGER_FONT_SIZE * SVG_FONT_SIZE_RATIO);
const svgAccidentalFontSize = computed(() => svgFontSize.value * 0.6);
const labelVerticalOffset = computed(() => svgFontSize.value * 0.35);
const accidentalDx = computed(() => svgFontSize.value * 0.03);
const accidentalDy = computed(() => -svgFontSize.value * 0.3);
const hoverFillColor = computed(() => 'var(--fb-hover)');

/** interactive 模式下不再用黄色高亮根音，统一按普通音（蓝色）处理；
 *  非 interactive（乐谱展示/导出等静态场景）仍保留原本的根音黄色标记 */
const showRootStyle = computed(() => isRoot && interactive);
const noteBgColor = computed(() => {
  if (showRootStyle.value) {
    return isDarkMode ? FRETBOARD_COLORS.rootDark : FRETBOARD_COLORS.rootLight;
  }
  if (isOpenString) {
    if (isMuted) {
      return isDarkMode ? '#351f20' : '#ffefee';
    }
    return isDarkMode ? '#182737' : '#ebf4ff';
  }
  return getFingerColor(showRootStyle.value, isDarkMode);
});

const noteStrokeColor = computed(() => {
  if (showRootStyle.value) return 'transparent';
  if (isOpenString) {
    if (isMuted) {
      return isDarkMode ? '#762b28' : '#ffc4c1';
    }
    return isDarkMode ? '#144477' : '#b3d7ff';
  }
  return 'transparent';
});

const noteStrokeWidth = computed(() => (isOpenString && !showRootStyle.value ? 2 : 0));
const noteRingColor = computed(() => {
  if (showRootStyle.value) return 'var(--color-warning)';
  if (isOpenString && isMuted) return 'var(--color-danger)';
  return 'var(--color-primary)';
});

const noteTextColor = computed(() => {
  if (showRootStyle.value) {
    return getFingerTextColor(true, isDarkMode);
  }

  if (isOpenString) {
    if (isMuted) {
      return 'var(--color-danger)';
    }

    return 'var(--color-primary)';
  }
  return getFingerTextColor(false, isDarkMode);
});
</script>
