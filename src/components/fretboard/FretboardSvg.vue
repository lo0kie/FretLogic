<template>
  <div class="relative w-full inline-block">
    <div v-if="showFretNumbers" class="absolute inset-0 pointer-events-none z-inner" aria-hidden="true">
      <span
        v-for="i in fretCount"
        v-show="i < fretCount"
        :key="'fret-num-' + i"
        class="absolute -translate-x-full -translate-y-1/2 font-extrabold leading-none select-none text-[var(--fb-label)] font-[Helvetica_Neue,Arial,sans-serif]"
        :class="FRET_SIZE_MAP[fretNumberSize] || FRET_SIZE_MAP.md"
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
      class="w-full pointer-events-none box-border block"
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
          class="transition-[y2] duration-slow ease-sidebar"
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
        :r="emptyRingRadius"
        :fill="hoverFillColor"
        stroke="var(--color-primary)"
        :stroke-width="NOTE_DISPLAY.FINGER_OUTLINE_WIDTH"
        class="pointer-events-auto cursor-pointer"
      />

      <circle
        v-if="showEmptyFocusRing"
        :cx="stringXPositions[focusPoint!.stringIndex]"
        :cy="(focusPoint!.fretIndex - 1) * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.FRET_HEIGHT / 2"
        :r="emptyRingRadius"
        :fill="hoverFillColor"
        stroke="var(--color-primary)"
        :stroke-width="NOTE_DISPLAY.FINGER_OUTLINE_WIDTH"
        class="pointer-events-auto cursor-pointer"
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
          :show-pitch-names="showPitchNames"
          :label="showPitchNames ? noteInfo(sIdx, str).label : ''"
          :is-accidental="showPitchNames && noteInfo(sIdx, str).isAccidental"
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
import { CANVAS_CONFIG, FRETBOARD_LINE_WIDTH, NOTE_DISPLAY } from '@/utils/core/constants';
import { computeStringLabelAccidental, formatStringLabel } from '@/utils/music/musicTheory';
import { computed } from 'vue';
import FretboardNote from './FretboardNote.vue';

const FRET_SIZE_MAP: Record<string, string> = {
  sm: 'text-lg',
  md: 'text-xl',
  lg: 'text-2xl',
};

const {
  fretNumberSize = 'md',
  showFretNumbers = true,
  showPitchNames = true,
  hoverPoint = null,
  focusPoint = null,
  rootStringIndex = null,
  stringXPositions,
  activeBaseStrings,
  fretCount,
  strings,
  interactive,
  capo,
  isDarkMode,
} = defineProps<{
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
  showPitchNames?: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle-pitch', stringIndex: number): void;
}>();

const getFretNumberStyle = (fretIndex: number) => {
  const yPixel = fretIndex * CANVAS_CONFIG.FRET_HEIGHT;
  const xPixel = (stringXPositions[0] ?? 0) - 22;
  return {
    top: `${yPixel}px`,
    left: `${xPixel}px`,
  };
};

const isRoot = (sIdx: number) => rootStringIndex === sIdx;
const hoverFillColor = computed(() => 'var(--fb-hover)');
const emptyRingRadius = computed(() => (showPitchNames ? NOTE_DISPLAY.FINGER_OUTLINE_RADIUS : 28));

const noteInfo = (sIdx: number, str: GuitarStringEntity) =>
  computeStringLabelAccidental(sIdx, str[0], capo, str[1], activeBaseStrings);

const isNoteHovered = (sIdx: number, fret: number) =>
  hoverPoint?.stringIndex === sIdx && hoverPoint?.fretIndex === fret;

const isNoteFocused = (sIdx: number, fret: number) =>
  focusPoint?.stringIndex === sIdx && focusPoint?.fretIndex === fret;

const showEmptyHoverRing = computed(() => {
  const hp = hoverPoint;
  if (!interactive || !hp || hp.fretIndex <= 0 || hp.fretIndex > fretCount) return false;
  return strings[hp.stringIndex]?.[0] !== hp.fretIndex;
});

const showEmptyFocusRing = computed(() => {
  const fp = focusPoint;
  if (!interactive || !fp || fp.fretIndex <= 0 || fp.fretIndex > fretCount) return false;
  if (hoverPoint && hoverPoint.stringIndex === fp.stringIndex && hoverPoint.fretIndex === fp.fretIndex) {
    return false;
  }
  return strings[fp.stringIndex]?.[0] !== fp.fretIndex;
});
</script>
