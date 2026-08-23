<template>
  <g
    :class="[interactive ? 'note-interactive' : 'note-disabled', { 'is-pressed-hidden': isPressed }]"
    :tabindex="interactive ? -1 : undefined"
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
      stroke="var(--color-primary)"
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
      :stroke="noteStrokeColor"
      :stroke-width="noteStrokeWidth"
      class="note-circle"
      :class="{ 'is-root-glow': isRoot }"
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
        {{ preferFlat ? 'b' : '#' }}
      </tspan>
    </text>

    <!-- 始终存在的透明命中区 -->
    <circle
      class="note-hit-area"
      :cx="x"
      :cy="y"
      :r="NOTE_DISPLAY.FINGER_DOT_RADIUS"
      fill="transparent"
      style="pointer-events: all"
    />
  </g>
</template>

<script setup lang="ts">
import { FRETBOARD_COLORS, NOTE_DISPLAY } from '@/constants';
import { getFingerColor, getFingerTextColor } from '@/utils/fretboardVisuals';
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

// 静音 X 的半边长，按字号比例走，字号变了 X 的大小也跟着变
const muteXHalf = computed(() => NOTE_DISPLAY.FINGER_FONT_SIZE * 0.28);

// 把原来给 HTML 用的字号折算成 SVG <text> 的等效大小
const SVG_FONT_SIZE_RATIO = 0.9;
const svgFontSize = computed(() => NOTE_DISPLAY.FINGER_FONT_SIZE * SVG_FONT_SIZE_RATIO);
const svgAccidentalFontSize = computed(() => svgFontSize.value * 0.6);

// 主字符垂直居中偏移：约等于字号的 0.35 倍（经验值，适配大多数西文/数字字形的视觉居中），
// 比 dominant-baseline="central" 更稳，导出截图和实时显示效果一致。
// 如果还是偏上/偏下，只调这一个数字：调大→文字往下移，调小→文字往上移。
const labelVerticalOffset = computed(() => svgFontSize.value * 0.35);

// 升降号相对主字符的偏移：dx 往右挪一点，dy 负值往上顶
const accidentalDx = computed(() => svgFontSize.value * 0.03);
const accidentalDy = computed(() => -svgFontSize.value * 0.22);

const hoverFillColor = computed(() => 'var(--fb-hover)');

const noteBgColor = computed(() => {
  if (props.isRoot) {
    return props.isDarkMode ? FRETBOARD_COLORS.rootDark : FRETBOARD_COLORS.rootLight;
  }
  if (props.isOpenString) {
    if (props.isMuted) {
      return props.isDarkMode ? '#351f20' : '#ffefee';
    }
    return props.isDarkMode ? '#182737' : '#ebf4ff';
  }
  return getFingerColor(props.isRoot, props.isDarkMode);
});

const noteStrokeColor = computed(() => {
  if (props.isRoot) return 'transparent';
  if (props.isOpenString) {
    if (props.isMuted) {
      return props.isDarkMode ? '#762b28' : '#ffc4c1';
    }
    return props.isDarkMode ? '#144477' : '#b3d7ff';
  }
  return 'transparent';
});

const noteStrokeWidth = computed(() => (props.isOpenString && !props.isRoot ? 2 : 0));

const noteTextColor = computed(() => {
  if (props.isRoot) {
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

<style scoped lang="less">
@import '@/assets/tokens.module.less';

.note-interactive {
  cursor: pointer;
  pointer-events: auto;
  outline: none;

  &:hover .note-outline-ring {
    opacity: 1;
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
    filter @duration-fast ease,
    fill @duration-fast ease,
    stroke @duration-fast ease;
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
    fill @duration-fast ease,
    stroke @duration-fast ease;
}

.note-hit-area {
  pointer-events: all;
}
</style>
