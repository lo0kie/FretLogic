<template>
  <g
    :class="[interactive ? 'note-interactive' : 'note-disabled', { 'is-pressed-hidden': isPressed }]"
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
      class="note-outline-ring"
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
      class="note-circle"
      :class="{ 'is-root-glow': isRoot && !interactive }"
    />
    <!-- 静音状态：原生 SVG 画 X，不用图标组件/foreignObject -->
    <g v-if="!isPressed && isMuted" class="note-mute-x" :stroke="noteTextColor" stroke-width="4" stroke-linecap="round">
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
      class="note-svg-label"
    >
      <tspan>{{ label }}</tspan>
      <tspan
        v-if="isAccidental"
        :dx="accidentalDx"
        :dy="accidentalDy"
        :font-size="svgAccidentalFontSize"
        font-weight="700"
        class="note-svg-accidental"
      >
        {{ preferFlat ? '♭' : '♯' }}
      </tspan>
    </text>
    <!-- 始终存在的透明命中区 -->
    <circle class="note-hit-area" :cx="x" :cy="y" :r="NOTE_DISPLAY.FINGER_DOT_RADIUS" fill="transparent" />
  </g>
</template>

<script setup lang="ts">
import { getFingerColor, getFingerTextColor } from '@/utils/chord-fretboard';
import { FRETBOARD_COLORS, NOTE_DISPLAY } from '@/utils/constants';
import { computed } from 'vue';
const props = withDefaults(
  defineProps<{
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
  }>(),
  {
    label: '',
    isAccidental: false,
    preferFlat: false,
    isRoot: false,
    isOpenString: false,
    isMuted: false,
    isPressed: false,
    isDarkMode: false,
    interactive: true,
    isHovered: false,
    isFocused: false,
    ariaLabel: '',
  }
);

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
const showRootStyle = computed(() => props.isRoot && props.interactive);
const noteBgColor = computed(() => {
  if (showRootStyle.value) {
    return props.isDarkMode ? FRETBOARD_COLORS.rootDark : FRETBOARD_COLORS.rootLight;
  }
  if (props.isOpenString) {
    if (props.isMuted) {
      return props.isDarkMode ? '#351f20' : '#ffefee';
    }
    return props.isDarkMode ? '#182737' : '#ebf4ff';
  }
  return getFingerColor(showRootStyle.value, props.isDarkMode);
});

const noteStrokeColor = computed(() => {
  if (showRootStyle.value) return 'transparent';
  if (props.isOpenString) {
    if (props.isMuted) {
      return props.isDarkMode ? '#762b28' : '#ffc4c1';
    }
    return props.isDarkMode ? '#144477' : '#b3d7ff';
  }
  return 'transparent';
});

const noteStrokeWidth = computed(() => (props.isOpenString && !showRootStyle.value ? 2 : 0));
const noteRingColor = computed(() => {
  if (showRootStyle.value) return 'var(--color-warning)';
  if (props.isOpenString && props.isMuted) return 'var(--color-danger)';
  return 'var(--color-primary)';
});

const noteTextColor = computed(() => {
  if (showRootStyle.value) {
    return getFingerTextColor(true, props.isDarkMode);
  }

  if (props.isOpenString) {
    if (props.isMuted) {
      return 'var(--color-danger)';
    }

    return 'var(--color-primary)';
  }
  return getFingerTextColor(false, props.isDarkMode);
});
</script>

<style scoped lang="scss">
.note-interactive {
  cursor: pointer;
  pointer-events: auto;
  outline: none;

  &:hover .note-outline-ring {
    opacity: 1;
  }

  .note-hit-area {
    pointer-events: all;
    cursor: pointer;
  }
}

.note-disabled {
  cursor: default;
  pointer-events: none;
  outline: none;
}

.is-pressed-hidden {
  .note-circle,
  .note-svg-label,
  .note-mute-x {
    display: none;
  }
}

.note-circle {
  transition:
    filter $duration-fast ease,
    fill $duration-fast ease,
    stroke $duration-fast ease;
  filter: var(--finger-shadow);
  &.is-root-glow {
    filter: var(--root-glow);
  }
}

.note-mute-x {
  pointer-events: none;
}

.note-svg-label {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  user-select: none;
  pointer-events: none;
}

.note-svg-accidental {
  font-family: 'Helvetica Neue', Arial, sans-serif;
}

.note-outline-ring {
  pointer-events: none;
  transition:
    fill $duration-fast ease,
    stroke $duration-fast ease;
}
</style>
