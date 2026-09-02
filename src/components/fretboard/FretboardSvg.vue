<template>
  <div class="relative inline-block w-full">
    <div v-if="showFretNumbers" aria-hidden="true" class="z-inner pointer-events-none absolute inset-0">
      <span
        v-for="i in fretCount"
        v-show="i < fretCount"
        :class="FRET_SIZE_MAP[fretNumberSize] || FRET_SIZE_MAP['md']"
        :key="'fret-num-' + i"
        :style="getFretNumberStyle(i)"
        class="absolute -translate-x-full -translate-y-1/2 font-[Helvetica_Neue,Arial,sans-serif] leading-none font-extrabold text-(--fb-label) select-none"
      >
        {{ capo > 0 ? capo + i : i }}
      </span>
    </div>

    <svg
      :aria-label="boardAriaLabel"
      :height="fretCount * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.OFFSET_Y_BOTTOM"
      :viewBox="`0 0 ${CANVAS_CONFIG.BOARD_WIDTH} ${fretCount * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.OFFSET_Y_BOTTOM}`"
      :width="CANVAS_CONFIG.BOARD_WIDTH"
      class="pointer-events-none box-border block w-full"
      role="img"
      style="overflow: visible"
    >
      <g>
        <line
          v-for="s in 6"
          :key="'string-' + s"
          :stroke-width="FRETBOARD_LINE_WIDTH"
          :x1="stringXPositions[s - 1] ?? 0"
          :x2="stringXPositions[s - 1] ?? 0"
          :y1="0"
          :y2="fretCount * CANVAS_CONFIG.FRET_HEIGHT"
          shape-rendering="crispEdges"
          stroke="var(--fb-line)"
          stroke-linecap="butt"
        />

        <line
          v-for="f in fretCount + 1"
          :key="'fret-line-' + (f - 1)"
          :stroke-width="FRETBOARD_LINE_WIDTH"
          :x1="stringXPositions[0] ?? 0"
          :x2="stringXPositions[5] ?? 0"
          :y1="(f - 1) * CANVAS_CONFIG.FRET_HEIGHT"
          :y2="(f - 1) * CANVAS_CONFIG.FRET_HEIGHT"
          shape-rendering="crispEdges"
          stroke="var(--fb-line)"
          stroke-linecap="square"
        />

        <rect
          v-if="capo === 0 && isWideNut"
          :height="12"
          :width="(stringXPositions[5] ?? 0) - (stringXPositions[0] ?? 0) + FRETBOARD_LINE_WIDTH"
          :x="(stringXPositions[0] ?? 0) - FRETBOARD_LINE_WIDTH / 2"
          :y="-12"
          fill="var(--fb-note)"
          rx="1"
        />
      </g>

      <g v-if="!showPitchNames && barrePickMode && renderBarreCandidates.length">
        <rect
          v-for="c in renderBarreCandidates"
          :height="barreDashGeometry(c).height"
          :key="`barre-cand-dash-${c.fret}-${c.fromString}-${c.toString}`"
          :rx="barreDashGeometry(c).rx"
          :stroke="barreCandidateFill"
          :stroke-dasharray="'8 6'"
          :stroke-opacity="isBarreHighlighted(c) ? 1 : 0.6"
          :stroke-width="isBarreHighlighted(c) ? 6 : 4"
          :width="barreDashGeometry(c).width"
          :x="barreDashGeometry(c).x"
          :y="barreDashGeometry(c).y"
          class="duration-fast transition-[stroke-opacity]"
          fill="none"
        />
        <rect
          v-for="c in renderBarreCandidates"
          :fill="barreCandidateFill"
          :fill-opacity="isBarreHighlighted(c) ? 0.5 : 0.2"
          :height="barreThickness"
          :key="`barre-cand-${c.fret}-${c.fromString}-${c.toString}`"
          :rx="barreThickness / 2"
          :title="barreCandidateTitle(c)"
          :width="barreGeometry(c).width"
          :x="barreGeometry(c).x"
          :y="barreGeometry(c).y"
          class="duration-fast pointer-events-none cursor-pointer transition-[fill-opacity]"
        />
        <rect
          v-for="c in renderBarreCandidates"
          :aria-label="barreCandidateTitle(c)"
          :height="barreHitThickness"
          :key="`barre-cand-hit-${c.fret}-${c.fromString}-${c.toString}`"
          :width="barreGeometry(c).width"
          :x="barreGeometry(c).x"
          :y="barreHitGeometry(c).y"
          @blur="focusedBarreHit = null"
          @click.stop="emit('barre-click', c)"
          @focus="focusedBarreHit = barreKey(c)"
          @keydown.enter.prevent="emit('barre-click', c)"
          @keydown.space.prevent="emit('barre-click', c)"
          @mouseenter="activeBarreHit = barreKey(c)"
          @mouseleave="activeBarreHit = null"
          class="pointer-events-auto cursor-pointer outline-none"
          fill="transparent"
          role="button"
          tabindex="0"
        />
      </g>

      <g v-if="!showPitchNames && renderBarres.length" aria-hidden="true">
        <rect
          v-for="barre in renderBarres"
          :fill="barreActiveFill"
          :height="barreThickness"
          :key="`barre-${barre.fret}-${barre.fromString}-${barre.toString}`"
          :rx="barreThickness / 2"
          :width="barreGeometry(barre).width"
          :x="barreGeometry(barre).x"
          :y="barreGeometry(barre).y"
          class="duration-fast transition-[fill]"
        />
      </g>

      <circle
        v-if="showEmptyHoverRing"
        :cx="stringXPositions[hoverPoint!.stringIndex]"
        :cy="(hoverPoint!.fretIndex - 1) * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.FRET_HEIGHT / 2"
        :fill="hoverFillColor"
        :r="emptyRingRadius"
        :stroke-width="NOTE_DISPLAY.FINGER_OUTLINE_WIDTH"
        class="pointer-events-auto cursor-pointer"
        stroke="var(--color-primary)"
      />

      <circle
        v-if="showEmptyFocusRing"
        :cx="stringXPositions[focusPoint!.stringIndex]"
        :cy="(focusPoint!.fretIndex - 1) * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.FRET_HEIGHT / 2"
        :fill="hoverFillColor"
        :r="emptyRingRadius"
        :stroke-width="NOTE_DISPLAY.FINGER_OUTLINE_WIDTH"
        class="pointer-events-auto cursor-pointer"
        stroke="var(--color-primary)"
      />

      <template v-for="(str, sIdx) in strings" :key="'finger-' + sIdx">
        <FretboardNote
          v-if="str[0] > 0 && str[0] <= fretCount"
          :aria-label="stringNoteAriaLabel(sIdx, str)"
          :interactive
          :is-accidental="showPitchNames && noteInfo(sIdx, str).isAccidental"
          :is-dark-mode
          :is-focused="isNoteFocused(sIdx, str[0])"
          :is-hovered="isNoteHovered(sIdx, str[0])"
          :is-root="isRoot(sIdx)"
          :label="showPitchNames ? noteInfo(sIdx, str).label : ''"
          :prefer-flat="str[1]"
          :show-pitch-names
          :x="stringXPositions[sIdx] ?? 0"
          :y="(str[0] - 1) * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.FRET_HEIGHT / 2"
          @toggle-pitch="emit('toggle-pitch', sIdx)"
        />
      </template>
    </svg>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';

import { computeStringLabelAccidental, formatStringLabel } from '@/services/music/theory';
import type { BarreEntity, GuitarStringEntity, GuitarStringsModel } from '@/types';
import { CANVAS_CONFIG, FRETBOARD_LINE_WIDTH, NOTE_DISPLAY } from '@/utils/core/constants';

import FretboardNote from './FretboardNote.vue';

/** 横按梁厚度与极简模式按品圆点同直径（仅不显示音名时渲染，固定 48px） */
const barreThickness = 24 * 2;
/** 横按候选命中区厚度：略大于圆点，扩大可点击/悬停热区 */
const barreHitThickness = 24 * 2 + 8;

/** 当前 hover 的候选梁标识（`fret-from-to`），用于可见梁提亮提示 */
const activeBarreHit = ref<string | null>(null);
/** 当前键盘聚焦的候选梁标识，聚焦强调走外扩虚线框而非浏览器默认描边 */
const focusedBarreHit = ref<string | null>(null);

/** 候选梁唯一标识（品位-起弦-止弦），用于 hover / 聚焦态比对 */
const barreKey = (b: BarreEntity) => `${b.fret}-${b.fromString}-${b.toString}`;
/** 候选梁是否处于 hover 或键盘聚焦的强调态 */
const isBarreHighlighted = (b: BarreEntity) => {
  const key = barreKey(b);
  return activeBarreHit.value === key || focusedBarreHit.value === key;
};

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
  wideNut = false,
  barres = [],
  barreCandidates = [],
  barrePickMode = false,
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
  /** 零品品丝是否加宽（粗琴枕效果），默认 false */
  wideNut?: boolean;
  /** 横按列表（显式配置或自动推导），绘制在音符下方 */
  barres?: BarreEntity[];
  /** 可点击的候选横按列表（横按拾取模式展示） */
  barreCandidates?: BarreEntity[];
  /** 横按拾取模式：候选梁可点击派发 barre-click（音符保持不可交互） */
  barrePickMode?: boolean;
}>();

const isWideNut = computed(() => Boolean(wideNut));

/** 指板图的整体无障碍描述：品数与变调夹信息 */
const boardAriaLabel = computed(() => `吉他指板图，共 ${fretCount} 品${capo > 0 ? `，变调夹 Capo ${capo} 品` : ''}`);
/** 单根弦指位描述：弦序、品格与音名（v-for 内调用） */
const stringNoteAriaLabel = (sIdx: number, str: GuitarStringEntity) =>
  `第 ${6 - sIdx} 弦第 ${str[0]} 品，音名 ${formatStringLabel(sIdx, str[0], str[1], capo, activeBaseStrings)}`;

const emit = defineEmits<{
  (e: 'toggle-pitch', stringIndex: number): void;
  (e: 'barre-click', barre: BarreEntity): void;
}>();

/** 品号定位：置于指板左侧、按品高垂直排列 */
const getFretNumberStyle = (fretIndex: number) => {
  const yPixel = fretIndex * CANVAS_CONFIG.FRET_HEIGHT;
  const xPixel = (stringXPositions[0] ?? 0) - 22;
  return {
    top: `${yPixel}px`,
    left: `${xPixel}px`,
  };
};

/** 该弦是否为根音弦 */
const isRoot = (sIdx: number) => rootStringIndex === sIdx;
const hoverFillColor = computed(() => 'var(--fb-hover)');
const emptyRingRadius = computed(() => (showPitchNames ? NOTE_DISPLAY.FINGER_OUTLINE_RADIUS : 28));

/** 横按梁几何：圆角圆心对齐最外侧音符中心（pad = 厚度一半），y 对齐所在品中心 */
const barreGeometry = (barre: BarreEntity) => {
  const pad = barreThickness / 2;
  const xLeft = (stringXPositions[barre.fromString] ?? 0) - pad;
  const xRight = (stringXPositions[barre.toString] ?? 0) + pad;
  return {
    x: xLeft,
    width: Math.max(0, xRight - xLeft),
    y: (barre.fret - 1) * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.FRET_HEIGHT / 2 - pad,
  };
};

/** 候选横按梁的外扩虚线轮廓（四向外扩 DASH_PAD，虚线框比主体大一圈） */
const BARRE_DASH_PAD = 10;
/** 候选横按梁的外扩虚线轮廓几何：四周向外扩 DASH_PAD，虚线框比主体大一圈 */
const barreDashGeometry = (barre: BarreEntity) => {
  const base = barreGeometry(barre);
  const h = barreThickness + BARRE_DASH_PAD * 2;
  return {
    x: base.x - BARRE_DASH_PAD,
    y: base.y - BARRE_DASH_PAD,
    width: base.width + BARRE_DASH_PAD * 2,
    height: h,
    rx: h / 2,
  };
};

/** 候选横按梁填充：极简模式线色（以淡色 + 虚线表现"未选中可点"） */
const barreCandidateFill = 'var(--fb-line)';
/** 已标记横按梁填充：实心线色，保持黑白线稿风格，与候选淡虚线明显区分 */
const barreActiveFill = 'var(--fb-line)';

/** 仅渲染落在指板范围内的横按（品格越界时跳过，避免画出 SVG 外） */
const renderBarres = computed(() => barres.filter(b => b.fret >= 1 && b.fret <= fretCount));
const renderBarreCandidates = computed(() => barreCandidates.filter(b => b.fret >= 1 && b.fret <= fretCount));

/** 候选横按梁的可点击命中区几何（垂直方向按品中心扩展） */
const barreHitGeometry = (barre: BarreEntity) => {
  const half = barreHitThickness / 2;
  const x = barreGeometry(barre).x - 4;
  const width = barreGeometry(barre).width + 8;
  return {
    x,
    width,
    y: (barre.fret - 1) * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.FRET_HEIGHT / 2 - half,
  };
};

/** 候选梁 hover 提示：显示品位与弦范围 */
const barreCandidateTitle = (b: BarreEntity) => `标记 ${b.fret} 品 ${6 - b.fromString}弦 ~ ${6 - b.toString}弦 横按`;

/** 按弦点位音名信息（v-for 内调用） */
const noteInfo = (sIdx: number, str: GuitarStringEntity) =>
  computeStringLabelAccidental(sIdx, str[0], capo, str[1], activeBaseStrings);

/** 该按弦点是否处于 hover 位 */
const isNoteHovered = (sIdx: number, fret: number) =>
  hoverPoint?.stringIndex === sIdx && hoverPoint?.fretIndex === fret;

/** 该按弦点是否处于键盘焦点位 */
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
