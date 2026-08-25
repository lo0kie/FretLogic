<template>
  <div class="fretboard-svg-wrapper">
    <div v-if="showFretNumbers" class="fret-numbers-overlay" aria-hidden="true">
      <span
        v-for="i in fretCount"
        v-show="i < fretCount"
        :key="'fret-num-' + i"
        class="fret-number-badge"
        :class="`size-${fretNumberSize}`"
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
      <g>
        <line
          v-for="s in 6"
          :key="'string-' + s"
          :x1="stringXPositions[s - 1]"
          y1="0"
          :x2="stringXPositions[s - 1]"
          :y2="fretCount * CANVAS_CONFIG.FRET_HEIGHT"
          :stroke="'var(--fb-line)'"
          :stroke-width="FRETBOARD_LINE_WIDTH"
          class="string-line"
          shape-rendering="crispEdges"
        />
        <line
          v-for="f in fretCount"
          :key="'fret-line-' + f"
          :x1="CANVAS_CONFIG.OFFSET_X_LEFT"
          :y1="f * CANVAS_CONFIG.FRET_HEIGHT"
          :x2="stringXPositions[5]"
          :y2="f * CANVAS_CONFIG.FRET_HEIGHT"
          :stroke="'var(--fb-line-dim)'"
          :stroke-width="FRETBOARD_LINE_WIDTH"
          shape-rendering="crispEdges"
        />
        <rect
          :x="CANVAS_CONFIG.OFFSET_X_LEFT - FRETBOARD_LINE_WIDTH / 2"
          y="-4"
          :width="5 * CANVAS_CONFIG.STRING_SPACING + FRETBOARD_LINE_WIDTH"
          height="8"
          :fill="'var(--fb-note)'"
          rx="2"
        />
      </g>

      <!-- 动态预测 Hover / 键盘 Focus 游标（当目标为空白品位时显示） -->
      <circle
        v-if="showEmptyHoverRing"
        :cx="stringXPositions[hoverPoint!.stringIndex]"
        :cy="(hoverPoint!.fretIndex - 1) * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.FRET_HEIGHT / 2"
        :r="NOTE_DISPLAY.FINGER_OUTLINE_RADIUS"
        :fill="hoverFillColor"
        stroke="var(--color-primary)"
        :stroke-width="NOTE_DISPLAY.FINGER_OUTLINE_WIDTH"
        class="finger-predictive"
      />

      <circle
        v-if="showEmptyFocusRing"
        :cx="stringXPositions[focusPoint!.stringIndex]"
        :cy="(focusPoint!.fretIndex - 1) * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.FRET_HEIGHT / 2"
        :r="NOTE_DISPLAY.FINGER_OUTLINE_RADIUS"
        :fill="hoverFillColor"
        stroke="var(--color-primary)"
        :stroke-width="NOTE_DISPLAY.FINGER_OUTLINE_WIDTH"
        class="finger-keyboard-focus"
      />

      <!-- 指板音符列表 -->
      <template v-for="(str, sIdx) in strings" :key="'finger-' + sIdx">
        <FretboardNote
          v-if="str[0] > 0 && str[0] <= fretCount"
          :x="stringXPositions[sIdx] ?? 0"
          :y="(str[0] - 1) * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.FRET_HEIGHT / 2"
          :is-root="isRoot(sIdx)"
          :is-dark-mode="isDarkMode"
          :interactive="interactive"
          :is-hovered="isNoteHovered(sIdx, str[0])"
          :is-focused="isNoteFocused(sIdx, str[0])"
          :label="noteInfo(sIdx, str).label"
          :is-accidental="noteInfo(sIdx, str).isAccidental"
          :prefer-flat="str[1]"
          :aria-label="`第 ${6 - sIdx} 弦第 ${str[0]} 品，音名 ${formatStringLabel(sIdx, str[0], str[1], capo, activeBaseStrings)}`"
          @toggle-pitch="emit('toggle-pitch', sIdx)"
        />
      </template>
    </svg>
  </div>
</template>

<script setup lang="ts">
import type { GuitarStringEntity, GuitarStringsModel } from '@/types';
import { CANVAS_CONFIG, FRETBOARD_LINE_WIDTH, NOTE_DISPLAY } from '@/utils/constants';
import { computeStringLabelAccidental, formatStringLabel } from '@/utils/musicTheory';
import { computed } from 'vue';
import FretboardNote from './FretboardNote.vue';

const props = withDefaults(
  defineProps<{
    strings: GuitarStringsModel;
    fretCount: number;
    capo: number;
    activeBaseStrings: readonly number[];
    rootStringIndex?: number | null;
    isDarkMode: boolean;
    interactive: boolean;
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
}>();

const getFretNumberStyle = (fretIndex: number) => {
  const yPixel = fretIndex * CANVAS_CONFIG.FRET_HEIGHT;
  const xPixel = (props.stringXPositions[0] ?? 0) - 22;
  return {
    top: `${yPixel}px`,
    left: `${xPixel}px`,
  };
};

/** 单点根音标记：某弦是否为主音。
 *  数据层已保证 rootStringIndex 永不指向禁用的弦，故此处仅做相等判断，不在渲染层遮蔽。 */
const isRoot = (sIdx: number) => props.rootStringIndex === sIdx;
const hoverFillColor = computed(() => 'var(--fb-hover)');

/** 实时派生某弦音名（label + 是否变化音级），不依赖存储字段 */
const noteInfo = (sIdx: number, str: GuitarStringEntity) =>
  computeStringLabelAccidental(sIdx, str[0], props.capo, str[1], props.activeBaseStrings);

const isNoteHovered = (sIdx: number, fret: number) =>
  props.hoverPoint?.stringIndex === sIdx && props.hoverPoint?.fretIndex === fret;

const isNoteFocused = (sIdx: number, fret: number) =>
  props.focusPoint?.stringIndex === sIdx && props.focusPoint?.fretIndex === fret;

const showEmptyHoverRing = computed(() => {
  const hp = props.hoverPoint;
  if (!props.interactive || !hp || hp.fretIndex <= 0 || hp.fretIndex > props.fretCount) return false;
  return props.strings[hp.stringIndex]?.[0] !== hp.fretIndex;
});

const showEmptyFocusRing = computed(() => {
  const fp = props.focusPoint;
  if (!props.interactive || !fp || fp.fretIndex <= 0 || fp.fretIndex > props.fretCount) return false;
  if (props.hoverPoint && props.hoverPoint.stringIndex === fp.stringIndex && props.hoverPoint.fretIndex === fp.fretIndex) {
    return false;
  }
  return props.strings[fp.stringIndex]?.[0] !== fp.fretIndex;
});
</script>

<style scoped lang="scss">
.fretboard-svg-wrapper {
  position: relative;
  width: 100%;
  display: inline-block;
}

.fret-numbers-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: var(--z-inner);
}

.fret-number-badge {
  position: absolute;
  transform: translate(-100%, -50%);
  font-weight: 800;
  line-height: 1;
  color: var(--fb-label);
  user-select: none;
  font-family: 'Helvetica Neue', Arial, sans-serif;

  &.size-sm {
    font-size: $fs-lg;
  }

  &.size-md {
    font-size: $fs-xl;
  }

  &.size-lg {
    font-size: $fs-2xl;
  }
}

.string-line {
  transition: y2 $duration-slow $bezier-sidebar;
}

.finger-predictive,
.finger-keyboard-focus {
  pointer-events: auto;
  cursor: pointer;
}

.fretboard-svg {
  width: 100%;
  pointer-events: none;
  box-sizing: border-box;
  display: block;
}
</style>
