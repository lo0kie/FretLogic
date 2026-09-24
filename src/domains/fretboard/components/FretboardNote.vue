<template>
  <g :aria-label @dblclick.prevent.stop="$emit('toggle-pitch')" class="outline-none" role="img" tabindex="-1">
    <g class="transition-opacity duration-base">
      <circle
        v-if="isHovered || isFocused"
        :cx="x"
        :cy="y"
        :r="outlineRadius"
        :stroke-width="outlineWidth"
        :style="{ fill: hoverFillColor, stroke: noteRingColor }"
        class="note-outline-ring"
      />

      <circle
        :cx="x"
        :cy="y"
        :r="fillRadius"
        :stroke-width="noteStrokeWidth"
        :style="{ fill: noteBgColor, stroke: noteStrokeColor }"
        class="note-circle"
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
        :font-size="noteFontSize"
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
          :font-size="accidentalFontSize"
          font-weight="700"
        >
          {{ preferFlat ? '♭' : '♯' }}
        </tspan>
      </text>
    </g>

    <circle :cx="x" :cy="y" :r="dotRadius" class="pointer-events-auto cursor-pointer" fill="transparent" />
  </g>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { INTERACTIVE_GEOMETRY } from '@/domains/fretboard/model/interactiveGeometry';

const {
  x,
  y,
  label = '',
  isAccidental = false,
  preferFlat = false,
  isRoot = false,
  isOpenString = false,
  isMuted = false,
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
  isHovered?: boolean;
  isFocused?: boolean;
  ariaLabel?: string;
  hideLabel?: boolean;
}>();

defineEmits<{
  (e: 'toggle-pitch'): void;
}>();

/**
 * 本组件的体量全部取自本侧几何 —— 组件里不再有裸算式与裸字面量。
 *
 * 与 Canvas 侧的关系：那边的按弦圆点是个纯色实心圆（半径由几何给出），本侧在同一个半径上
 * 再叠三样东西（描边、外圈高亮环、圆点内的音名与静音叉号），故这三样的尺寸也登记在
 * `InteractiveFretboardGeometry` 上（见 model/interactiveGeometry 的「本侧独有的记号尺寸」），
 * 本组件只读它的 getter。
 *
 * 这些量都不随 props 变，故取普通常量而非 computed：几何实例是模块级单例，重复求值没有意义。
 */
const {
  /** 圆点外缘半径（= 填充半径 + 描边一半）；也是可点命中区的半径 */
  dotRadius,
  /** 圆点填充半径：描边向外占掉半个宽度，故填充要相应收进去，外缘才恒等于圆点半径 */
  noteFillRadius: fillRadius,
  noteStrokeWidth,
  noteOutlineRadius: outlineRadius,
  noteOutlineWidth: outlineWidth,
  noteFontSize,
  noteAccidentalFontSize: accidentalFontSize,
  noteLabelDy: labelVerticalOffset,
  noteAccidentalDx: accidentalDx,
  noteAccidentalDy: accidentalDy,
  /**
   * 圆点内静音叉号半边长：**归本侧几何**，不取空弦标记的叉号半径 —— Canvas 的静音标记画在
   * 空弦标记行（与空弦圆圈同体量），本侧画在音符圆点之内（须占满圆点），形状与语境都不同，
   * 按基准等比放大只会得到一枚明显过小的叉号。
   */
  noteMuteCrossHalf: muteXHalf,
  noteMuteStrokeWidth: muteStrokeWidth,
} = INTERACTIVE_GEOMETRY;

const hoverFillColor = 'var(--fb-hover)';

/** 主音强调 */
const showRootStyle = computed(() => isRoot);

const noteBgColor = computed(() => {
  if (isOpenString) {
    if (isMuted) return 'var(--fb-open-muted-bg)';
    if (showRootStyle.value) return 'var(--fb-open-root-bg)';
    return 'var(--fb-open-bg)';
  }
  // 根音用强调色，其余用普通色；明暗主题由 CSS 变量在 tokens.scss 中切换
  return showRootStyle.value ? 'var(--fb-root)' : 'var(--fb-dot)';
});

const noteStrokeColor = computed(() => {
  if (isOpenString) {
    if (isMuted) return 'var(--fb-open-muted-border)';
    if (showRootStyle.value) return 'var(--fb-open-root-border)';
    return 'var(--fb-open-border)';
  }
  // 按品时描边色与填充色相同，外缘因此看不出描边，只留「体量恒定」这一件事
  return noteBgColor.value;
});

const muteStrokeColor = computed(() => 'var(--color-danger)');

const noteRingColor = computed(() => {
  if (showRootStyle.value) return 'var(--color-warning)';
  if (isOpenString && isMuted) return 'var(--color-danger)';

  return 'var(--color-primary)';
});

const noteTextColor = computed(() => {
  if (isOpenString) {
    if (isMuted) return 'var(--color-danger)';
    if (showRootStyle.value) return 'var(--color-warning)';
    return 'var(--color-primary)';
  }
  // 普通音符文字取「圆点上的字色」token（各主题圆点的最优墨色：亮色白字，暗色与高对比黑字）。
  // 刻意不用 --text-on-accent —— 那个令牌服务语义强调色（四种底都偏亮，故取黑字），
  // 而圆点是饱和蓝、取档方向相反，共用一个令牌必然顾此失彼。
  return showRootStyle.value ? 'var(--fb-root-text)' : 'var(--fb-dot-text)';
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
