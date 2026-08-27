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
        <!-- 6 根琴弦（纵向线）：垂直精准贯穿 0 到最后一品 -->
        <line
          v-for="s in 6"
          :key="'string-' + s"
          :x1="stringXPositions[s - 1] ?? 0"
          :y1="0"
          :x2="stringXPositions[s - 1] ?? 0"
          :y2="fretCount * CANVAS_CONFIG.FRET_HEIGHT"
          stroke="var(--fb-line)"
          :stroke-width="FRETBOARD_LINE_WIDTH"
          stroke-linecap="butt"
          shape-rendering="crispEdges"
        />

        <!-- 所有横向品线（0 品顶线至最后一品底线）：每一条坐标严格间隔 FRET_HEIGHT，两端通过 square 端点闭合 -->
        <line
          v-for="f in fretCount + 1"
          :key="'fret-line-' + (f - 1)"
          :x1="stringXPositions[0] ?? 0"
          :y1="(f - 1) * CANVAS_CONFIG.FRET_HEIGHT"
          :x2="stringXPositions[5] ?? 0"
          :y2="(f - 1) * CANVAS_CONFIG.FRET_HEIGHT"
          stroke="var(--fb-line)"
          :stroke-width="FRETBOARD_LINE_WIDTH"
          stroke-linecap="square"
          shape-rendering="crispEdges"
        />

        <!-- Capo 为 0 时的粗琴枕（完全向上画，底边对准 y=0，不挤占任何网格高度） -->
        <rect
          v-if="capo === 0"
          :x="(stringXPositions[0] ?? 0) - FRETBOARD_LINE_WIDTH / 2"
          :y="-12"
          :width="(stringXPositions[5] ?? 0) - (stringXPositions[0] ?? 0) + FRETBOARD_LINE_WIDTH"
          :height="12"
          fill="var(--fb-note)"
          rx="1"
        />
      </g>

      <!-- 候选横按梁（Barre Pick）：仅极简模式 + 拾取模式下渲染，弱化显示且可点击标记 -->
      <g v-if="!showPitchNames && barrePickMode && renderBarreCandidates.length">
        <!-- 外扩虚线轮廓 -->
        <rect
          v-for="c in renderBarreCandidates"
          :key="`barre-cand-dash-${c.fret}-${c.fromString}-${c.toString}`"
          :x="barreDashGeometry(c).x"
          :y="barreDashGeometry(c).y"
          :width="barreDashGeometry(c).width"
          :height="barreDashGeometry(c).height"
          :rx="barreDashGeometry(c).rx"
          fill="none"
          :stroke="barreCandidateFill"
          :stroke-width="2"
          :stroke-dasharray="'8 6'"
          :stroke-opacity="activeBarreHit === `${c.fret}-${c.fromString}-${c.toString}` ? 1 : 0.6"
          class="transition-[stroke-opacity] duration-fast"
        />
        <!-- 淡色填充主体 -->
        <rect
          v-for="c in renderBarreCandidates"
          :key="`barre-cand-${c.fret}-${c.fromString}-${c.toString}`"
          :x="barreGeometry(c).x"
          :y="barreGeometry(c).y"
          :width="barreGeometry(c).width"
          :height="barreThickness"
          :rx="barreThickness / 2"
          :fill="barreCandidateFill"
          :fill-opacity="activeBarreHit === `${c.fret}-${c.fromString}-${c.toString}` ? 0.5 : 0.2"
          :title="barreCandidateTitle(c)"
          class="pointer-events-none cursor-pointer transition-[fill-opacity] duration-fast"
        />
        <!-- 命中放大区：扩大点击/悬停热区，避免细梁难点 -->
        <rect
          v-for="c in renderBarreCandidates"
          :key="`barre-cand-hit-${c.fret}-${c.fromString}-${c.toString}`"
          :x="barreGeometry(c).x"
          :y="barreHitGeometry(c).y"
          :width="barreGeometry(c).width"
          :height="barreHitThickness"
          fill="transparent"
          class="pointer-events-auto cursor-pointer"
          @click.stop="emit('barre-click', c)"
          @mouseenter="activeBarreHit = c.fret + '-' + c.fromString + '-' + c.toString"
          @mouseleave="activeBarreHit = null"
        />
      </g>

      <!-- 横按梁（Barre）：仅极简模式（不显示音名）下渲染，绘制在音符下方作为连接底衬 -->
      <g v-if="!showPitchNames && renderBarres.length" aria-hidden="true">
        <rect
          v-for="barre in renderBarres"
          :key="`barre-${barre.fret}-${barre.fromString}-${barre.toString}`"
          :x="barreGeometry(barre).x"
          :y="barreGeometry(barre).y"
          :width="barreGeometry(barre).width"
          :height="barreThickness"
          :rx="barreThickness / 2"
          :fill="barreActiveFill"
          class="transition-[fill] duration-fast"
        />
      </g>

      <!-- 动态预测 Hover / 键盘 Focus 游标（当目标为空白品位时显示），置于横按梁之上 -->
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
import type { BarreEntity, GuitarStringEntity, GuitarStringsModel } from '@/types';
import { CANVAS_CONFIG, FRETBOARD_LINE_WIDTH, NOTE_DISPLAY } from '@/utils/core/constants';
import { computeStringLabelAccidental, formatStringLabel } from '@/utils/music/musicTheory';
import { computed, ref } from 'vue';
import FretboardNote from './FretboardNote.vue';

/** 横按梁厚度与极简模式按品圆点同直径（仅不显示音名时渲染，固定 48px） */
const barreThickness = 24 * 2;
/** 横按候选命中区厚度：略大于圆点，扩大可点击/悬停热区 */
const barreHitThickness = 24 * 2 + 8;

/** 当前 hover 的候选梁标识（`fret-from-to`），用于可见梁提亮提示 */
const activeBarreHit = ref<string | null>(null);

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
  /** 横按列表（显式配置或自动推导），绘制在音符下方 */
  barres?: BarreEntity[];
  /** 可点击的候选横按列表（横按拾取模式展示） */
  barreCandidates?: BarreEntity[];
  /** 横按拾取模式：候选梁可点击派发 barre-click（音符保持不可交互） */
  barrePickMode?: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle-pitch', stringIndex: number): void;
  (e: 'barre-click', barre: BarreEntity): void;
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
const BARRE_DASH_PAD = 4;
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
