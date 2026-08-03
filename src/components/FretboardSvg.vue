<template>
  <svg
    :width="CANVAS_CONFIG.BOARD_WIDTH"
    :height="fretCount * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.OFFSET_Y_BOTTOM"
    :viewBox="`0 0 ${CANVAS_CONFIG.BOARD_WIDTH} ${fretCount * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.OFFSET_Y_BOTTOM}`"
    style="overflow: visible"
    class="fretboard-svg"
  >
    <g v-memo="[fretCount, isDarkMode, capo, fretNumberSize]">
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
      <text
        v-for="i in fretCount"
        :key="'fret-text-' + i"
        v-show="i < fretCount"
        :x="(CANVAS_CONFIG.OFFSET_X - 32) / 2"
        :y="i * CANVAS_CONFIG.FRET_HEIGHT"
        text-anchor="middle"
        dominant-baseline="central"
        dy="-2px"
        :font-size="fretFontSize"
        font-weight="900"
        :fill="isDarkMode ? '#e2e8f0' : '#475569'"
        style="pointer-events: none"
      >
        {{ capo > 0 ? capo + i : i }}
      </text>
    </g>

    <g v-if="showPredictiveHover" class="finger-predictive">
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
        @dblclick.prevent.stop="emit('toggle-pitch', sIdx)"
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
        >
          {{ calcNoteLabel(sIdx, str.fret, capo, str.preferFlat, activeBaseStrings) }}
        </text>
      </g>
    </template>
  </svg>
</template>

<script setup lang="ts">
import { CANVAS_CONFIG, FRETBOARD_LINE_WIDTH } from '@/constants';
import type { GuitarStringsModel } from '@/types';
import { getFingerColor, getFingerTextColor } from '@/utils/fretboardVisuals';
import { calcNoteLabel } from '@/utils/musicTheory';
import { computed } from 'vue';

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
    fretNumberSize?: 'sm' | 'md' | 'lg'; // 🌟 新增尺寸控制参数
  }>(),
  { fretNumberSize: 'md' }
);

const emit = defineEmits<{
  (e: 'toggle-pitch', stringIndex: number): void;
}>();

// 🌟 新增：计算动态字体大小预设值
const fretFontSize = computed(() => {
  switch (props.fretNumberSize) {
    case 'sm':
      return 20; // 较小的品格数字
    case 'lg':
      return 40; // 较大的品格数字
    case 'md':
    default:
      return 30; // 原本的默认值
  }
});

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
</script>

<!-- <style> 保持不变 -->

<style scoped lang="less">
@import '@/assets/tokens.module.less';

.fretboard-svg {
  width: 100%;
  pointer-events: auto;
  box-sizing: border-box;
}

.string-line {
  transition: y2 @duration-slow @bezier-sidebar;
}

.finger-interactive {
  cursor: pointer;
  pointer-events: auto;
}

// 🌟 finger-predictive 只在 interactive=true 时渲染，
// cursor 已由父级 .fretboard-container.is-interactive 继承，这里不再重复声明
.finger-predictive {
  pointer-events: none;
}

// 🌟 pointer-events 会从父级 .fretboard-container.is-disabled 继承为 none，
// 这里不用再声明 pointer-events，只保留 cursor 覆盖即可
.finger-disabled {
  cursor: default;
}

.finger-circle {
  /* 移除 fill 的渐变动画，确保高频点击状态切换时不会出现颜色插值闪白 */
  transition: filter @duration-fast ease;
  filter: var(--finger-shadow);

  &.is-root-glow {
    filter: var(--root-glow);
  }
}

.finger-text {
  transition: fill @duration-fast ease;
}

@media (max-width: 768px) {
  .fretboard-svg text:not(.finger-text) {
    transform: translateX(15px);
    font-size: 18px;
  }
}
</style>
