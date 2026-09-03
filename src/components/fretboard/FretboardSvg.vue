<template>
  <div class="relative inline-block w-full">
    <div aria-hidden="true" class="z-inner pointer-events-none absolute inset-0">
      <span
        v-for="i in fretCount"
        v-show="i < fretCount"
        :key="'fret-num-' + i"
        :style="getFretNumberStyle(i)"
        class="absolute -translate-x-full -translate-y-1/2 font-[Helvetica_Neue,Arial,sans-serif] text-xl leading-none font-extrabold text-(--fb-label) select-none"
      >
        {{ capo > 0 ? capo + i : i }}
      </span>
    </div>

    <!-- 悬浮横按操作气泡：外层 Wrapper 专注坐标定位与平移过渡，内层 Panel 专注入场出场动效与点击交互 -->
    <div
      v-if="isBubbleMounted && displayBubbleGeometry"
      :style="{
        left: `${(displayBubbleGeometry.centerX / CANVAS_CONFIG.BOARD_WIDTH) * 100}%`,
        top: `${displayBubbleGeometry.topY}px`,
      }"
      class="z-card pointer-events-none absolute -translate-x-1/2 -translate-y-full transition-[left,top] duration-200 ease-out select-none"
    >
      <Transition @after-leave="handleBubbleAfterLeave" appear name="barre-bubble-transition">
        <div
          v-auto-width
          v-if="activeHoveredBarre && displayBubbleBarre"
          v-wave
          :class="[
            displayBubbleBarre.isMarked
              ? 'bg-primary border-primary text-white shadow-[0_6px_20px_rgba(59,130,246,0.45)] dark:shadow-[0_8px_26px_rgba(96,165,250,0.55)]'
              : 'bg-bg-panel text-primary border-primary/40 hover:bg-tint-primary-88 shadow-[0_6px_20px_rgba(0,0,0,0.22)] dark:shadow-[0_8px_26px_rgba(0,0,0,0.65)]',
          ]"
          @click.stop="handleBarreBubbleClick"
          @mousedown.prevent.stop
          @pointerdown.prevent.stop
          @pointerenter.stop="handleBubblePointerEnter"
          @pointerleave="handleBubblePointerLeave"
          @pointermove.stop
          class="group duration-fast pointer-events-auto relative flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold whitespace-nowrap transition-[background-color,border-color,box-shadow]"
        >
          <BaseIcon v-if="displayBubbleBarre.isMarked" :stroke-width="2.5" name="check" size="xs" />
          <BaseIcon v-else :stroke-width="2.5" name="plus" size="xs" />
          <span>{{ displayBubbleBarre.isMarked ? '取消标记' : '标记为横按' }}</span>

          <!-- 直接复用项目统一的 buildFloatingArrowStyle 箭头组件与样式 -->
          <div :style="barreArrowStyle" class="popover-arrow pointer-events-none" />
        </div>
      </Transition>
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

      <!-- 横按梁（推导横按与已标记横按）：绘制在音符下方作为底衬，淡蓝色表示已标记，更淡的蓝色表示推导未标记 -->
      <g v-if="displayBarres.length" class="fretboard-barre-group">
        <g
          v-for="barre in displayBarres"
          :key="barre.key"
          @mouseenter="handleBarreMouseEnter(barre)"
          @mouseleave="handleBarreMouseLeave"
          class="duration-fast pointer-events-auto transition-all"
        >
          <!-- 整品高度感应热区：鼠标悬停在横按区域内任何位置（两弦之间、品格空白处）均即刻浮现气泡 -->
          <rect
            :height="CANVAS_CONFIG.FRET_HEIGHT"
            :width="barreGeometry(barre).width"
            :x="barreGeometry(barre).x"
            :y="(barre.fret - 1) * CANVAS_CONFIG.FRET_HEIGHT"
            fill="transparent"
          />
          <!-- 视觉横按梁底衬 -->
          <rect
            :fill="getBarreFill(barre.isMarked)"
            :height="barreThickness"
            :rx="barreThickness / 2"
            :stroke="getBarreStroke(barre.isMarked)"
            :stroke-dasharray="barre.isMarked ? undefined : '6 4'"
            :width="barreGeometry(barre).width"
            :x="barreGeometry(barre).x"
            :y="barreGeometry(barre).y"
            class="fretboard-barre-beam duration-fast transition-all hover:brightness-110"
            stroke-width="1.5"
          />
        </g>
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
          :is-accidental="noteInfo(sIdx, str).isAccidental"
          :is-dark-mode
          :is-focused="isNoteFocused(sIdx, str[0])"
          :is-hovered="isNoteHovered(sIdx, str[0])"
          :is-root="isRoot(sIdx)"
          :label="noteInfo(sIdx, str).label"
          :prefer-flat="str[1]"
          :x="stringXPositions[sIdx] ?? 0"
          :y="(str[0] - 1) * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.FRET_HEIGHT / 2"
          @toggle-pitch="emit('toggle-pitch', sIdx)"
        />
      </template>
    </svg>
  </div>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, watch, type CSSProperties } from 'vue';

import BaseIcon from '@/components/ui/BaseIcon.vue';
import { computeStringLabelAccidental, formatStringLabel } from '@/services/music/theory';
import type { BarreEntity, GuitarStringEntity, GuitarStringsModel } from '@/types';
import { BARRE_ARROW_TRANSITION_MS, CANVAS_CONFIG, FRETBOARD_LINE_WIDTH, NOTE_DISPLAY } from '@/utils/core/constants';
import { computeBarreCandidates, isBarreStillValid } from '@/utils/music/chord-fretboard';
import { buildFloatingArrowStyle } from '@/utils/ui/floatingArrow';

import FretboardNote from './FretboardNote.vue';

/** 横按实心梁厚度：贴合按弦圆点直径 */
const barreThickness = NOTE_DISPLAY.FINGER_DOT_RADIUS * 2;

const {
  hoverPoint = null,
  focusPoint = null,
  rootStringIndex = null,
  stringXPositions,
  activeBaseStrings,
  fretCount,
  strings,
  capo,
  isDarkMode,
  wideNut = false,
  barres = [],
} = defineProps<{
  strings: GuitarStringsModel;
  fretCount: number;
  capo: number;
  activeBaseStrings: readonly number[];
  rootStringIndex?: number | null;
  isDarkMode: boolean;
  stringXPositions: number[];
  hoverPoint?: { stringIndex: number; fretIndex: number } | null;
  focusPoint?: { stringIndex: number; fretIndex: number } | null;
  /** 零品品丝是否加宽（粗琴枕效果），默认 false */
  wideNut?: boolean;
  /** 横按列表（显式配置或自动推导），绘制在音符下方 */
  barres?: BarreEntity[];
}>();

const isWideNut = computed(() => Boolean(wideNut));

/** 指板图的整体无障碍描述：品数与变调夹信息 */
const boardAriaLabel = computed(() => `吉他指板图，共 ${fretCount} 品${capo > 0 ? `，变调夹 Capo ${capo} 品` : ''}`);
/** 单根弦指位描述：弦序、品格与音名（v-for 内调用） */
const stringNoteAriaLabel = (sIdx: number, str: GuitarStringEntity) =>
  `第 ${6 - sIdx} 弦第 ${str[0]} 品，音名 ${formatStringLabel(sIdx, str[0], str[1], capo, activeBaseStrings)}`;

const emit = defineEmits<{
  (e: 'toggle-pitch', stringIndex: number): void;
  (e: 'toggle-barre', barre: BarreEntity): void;
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
const emptyRingRadius = computed(() => NOTE_DISPLAY.FINGER_OUTLINE_RADIUS);

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

/**
 * 汇总当前指板上需要展示的所有横按（推导出的候选 + 已标记横按）：
 * - 已标记横按（用户显式设置）：isMarked = true
 * - 推导出的未标记横按：isMarked = false
 */
interface DisplayBarre extends BarreEntity {
  isMarked: boolean;
  key: string;
}

const displayBarres = computed<DisplayBarre[]>(() => {
  const validMarked = barres.filter(b => isBarreStillValid(strings, b) && b.fret >= 1 && b.fret <= fretCount);
  const candidates = computeBarreCandidates(strings, fretCount).filter(c => c.fret >= 1 && c.fret <= fretCount);

  const map = new Map<string, { barre: BarreEntity; isMarked: boolean }>();

  // 1. 注入推导出的候选横按（初始为未标记）
  for (const c of candidates) {
    const key = `${c.fret}_${c.fromString}_${c.toString}`;
    map.set(key, { barre: c, isMarked: false });
  }

  // 2. 将已有标记的横按设为已标记（覆盖已有候选或补充特例）
  for (const m of validMarked) {
    const key = `${m.fret}_${m.fromString}_${m.toString}`;
    map.set(key, { barre: m, isMarked: true });
  }

  return Array.from(map.values()).map(({ barre, isMarked }) => ({
    ...barre,
    isMarked,
    key: `barre-${barre.fret}-${barre.fromString}-${barre.toString}`,
  }));
});

/** 横按梁填充色：已标记加深蓝色，推导未标记为更淡的蓝色 */
const getBarreFill = (isMarked: boolean) => {
  if (isMarked) {
    return isDarkMode ? 'rgba(96, 165, 250, 0.62)' : 'rgba(59, 130, 246, 0.58)';
  }
  return isDarkMode ? 'rgba(96, 165, 250, 0.16)' : 'rgba(59, 130, 246, 0.14)';
};

/** 横按梁边框色：已标记为深色清晰描边，未标记为虚线更淡描边 */
const getBarreStroke = (isMarked: boolean) => {
  if (isMarked) {
    return isDarkMode ? 'rgba(96, 165, 250, 0.90)' : 'rgba(59, 130, 246, 0.85)';
  }
  return isDarkMode ? 'rgba(96, 165, 250, 0.38)' : 'rgba(59, 130, 246, 0.35)';
};

// ==================== 浮动横按操作气泡交互 ====================
const activeHoveredBarreKey = ref<string | null>(null);
const isBubbleMounted = ref(false);
let barreHideTimer: ReturnType<typeof setTimeout> | null = null;

/** 当前被 hover 激活的横按对象（响应式随 displayBarres 变化同步更新，并在横按延伸时平滑延续避免 DOM 销毁重建） */
const activeHoveredBarre = computed<DisplayBarre | null>(() => {
  if (activeHoveredBarreKey.value) {
    const direct = displayBarres.value.find(b => b.key === activeHoveredBarreKey.value);
    if (direct) return direct;

    // 关键优化：音符连续点按时横按弦跨度扩展（例如从 0..1 延伸到 0..2），新旧 key 不一致但属于同一品位横按的连续生长
    // 此时平滑延续当前品位的最新横按，绝不返回 null 触发 DOM 节点销毁重建，确保 CSS 移位平滑过渡！
    const oldFret = Number(activeHoveredBarreKey.value.split('-')[1]);
    const continued = displayBarres.value.find(
      b => b.fret === oldFret && ((hoverPoint && isPointInBarre(hoverPoint, b)) || true)
    );
    if (continued) {
      return continued;
    }
  }

  // 若光标当前落在任一横按上，自动匹配激活
  if (hoverPoint) {
    const matched = displayBarres.value.find(b => isPointInBarre(hoverPoint, b));
    if (matched) {
      return matched;
    }
  }

  return null;
});

// 在合法的 watcher 生命周期内同步最新 key 与挂载生命周期，杜绝 computed 内产生 side-effect
watch(
  activeHoveredBarre,
  b => {
    if (b) {
      isBubbleMounted.value = true;
      activeHoveredBarreKey.value = b.key;
    }
  },
  { immediate: true }
);

/** 内层离开动画完全播放完毕后，才安全卸载外层定位容器，绝不提前卸载打断动画 */
const handleBubbleAfterLeave = () => {
  // 核心防御：若离开动画播放期间用户重新移入了横按，绝不可把挂载状态置为 false！
  if (activeHoveredBarre.value) return;
  isBubbleMounted.value = false;
};

const isBubbleHovered = ref(false);

const isBubbleElementHovered = ref(false);

const handleBubblePointerEnter = () => {
  isBubbleHovered.value = true;
  isBubbleElementHovered.value = true;
  if (barreHideTimer) {
    clearTimeout(barreHideTimer);
    barreHideTimer = null;
  }
};

const handleBubblePointerLeave = () => {
  isBubbleHovered.value = false;
  isBubbleElementHovered.value = false;
  handleBarreMouseLeave();
};

const handleBarreMouseEnter = (barre: DisplayBarre) => {
  if (barreHideTimer) {
    clearTimeout(barreHideTimer);
    barreHideTimer = null;
  }
  isBubbleMounted.value = true;
  activeHoveredBarreKey.value = barre.key;
};

/** 离开横按区域：只有在鼠标确实不在该横按区域内、且不在气泡本体上时，才延迟隐藏 */
const handleBarreMouseLeave = () => {
  // 如果鼠标依然悬停在气泡上，或仍处于该横按琴弦跨度内，绝不关闭
  if (isBubbleHovered.value) return;
  if (activeHoveredBarre.value && isPointInBarre(hoverPoint, activeHoveredBarre.value)) return;

  if (barreHideTimer) clearTimeout(barreHideTimer);
  barreHideTimer = setTimeout(() => {
    if (isBubbleHovered.value) return;
    if (activeHoveredBarre.value && isPointInBarre(hoverPoint, activeHoveredBarre.value)) return;
    activeHoveredBarreKey.value = null;
    barreHideTimer = null;
  }, 200);
};

/** 点击浮动气泡：派发切换事件，由于响应式计算，气泡内容将实时切换已标记/未标记 */
const handleBarreBubbleClick = () => {
  if (activeHoveredBarre.value) {
    emit('toggle-barre', activeHoveredBarre.value);
  }
};

/** 悬浮气泡几何定位：处于该横按所在两弦中心水平位置，垂直上移至品丝线上方，远离音符并由箭头指向下方 */
const hoveredBarreGeometry = computed(() => {
  const b = activeHoveredBarre.value;
  if (!b) return null;
  const xLeft = stringXPositions[b.fromString] ?? 0;
  const xRight = stringXPositions[b.toString] ?? 0;
  const centerX = (xLeft + xRight) / 2;
  // 气泡上移：原 +14px 调整为 +4px，整体上移 10px，远离音符并由底边箭头指向下方
  const topY = (b.fret - 1) * CANVAS_CONFIG.FRET_HEIGHT + 4;
  return {
    centerX,
    topY,
    label: `${6 - b.fromString}～${6 - b.toString}弦`,
  };
});

// 缓存最后一次有效的横按数据与坐标，确保在 Transition 离开动画播放期间，DOM 节点的 left/top 不被清空导致闪现到左上角 (0, 0)
const cachedBarre = ref<DisplayBarre | null>(null);
const cachedGeometry = ref<{ centerX: number; topY: number; label: string } | null>(null);

watch(
  [activeHoveredBarre, hoveredBarreGeometry] as const,
  ([b, geo]) => {
    if (b) cachedBarre.value = b;
    if (geo) cachedGeometry.value = geo;
  },
  { immediate: true }
);

/** 用于渲染展示的气泡数据（即使在离开动画期间也稳定持有最后一刻的状态，绝不闪现脱位） */
const displayBubbleBarre = computed(() => activeHoveredBarre.value ?? cachedBarre.value);
const displayBubbleGeometry = computed(() => hoveredBarreGeometry.value ?? cachedGeometry.value);

/** 复用项目统一的 buildFloatingArrowStyle 箭头算法：朝下加大为 12px 且带边框，与面板同源 0 色差 */
const barreArrowStyle = computed<CSSProperties>(() => {
  const b = displayBubbleBarre.value;
  if (!b) return {};
  const isMarked = b.isMarked;
  const isHovered = isBubbleElementHovered.value;
  const size = 12;

  const background = isMarked ? 'var(--color-primary)' : isHovered ? 'var(--tint-primary-88)' : 'var(--bg-panel)';

  const borderColor = isMarked
    ? 'var(--color-primary)'
    : isDarkMode
      ? 'rgba(96, 165, 250, 0.4)'
      : 'rgba(59, 130, 246, 0.4)';

  const base = buildFloatingArrowStyle({
    arrowX: null,
    arrowY: null,
    placement: 'top',
    background,
    borderColor,
    size,
    borderWidth: 1,
    zIndex: 1,
  });

  return {
    ...base,
    left: `calc(50% - ${size / 2}px)`,
    transition: `background-color ${BARRE_ARROW_TRANSITION_MS}ms ease, border-color ${BARRE_ARROW_TRANSITION_MS}ms ease`,
  };
});

onBeforeUnmount(() => {
  if (barreHideTimer) clearTimeout(barreHideTimer);
});

/** 判定当前 hoverPoint 逻辑点是否落在某个横按的品位与琴弦跨度范围内 */
const isPointInBarre = (pt: { stringIndex: number; fretIndex: number } | null, b: BarreEntity) => {
  if (!pt) return false;
  if (pt.fretIndex !== b.fret) return false;
  const minS = Math.min(b.fromString, b.toString);
  const maxS = Math.max(b.fromString, b.toString);
  return pt.stringIndex >= minS && pt.stringIndex <= maxS;
};

/** 根据当前的 hoverPoint 实时评估是否命中任一横按 */
const syncBarreHover = () => {
  if (isBubbleHovered.value) return;
  const pt = hoverPoint;
  if (!pt) {
    handleBarreMouseLeave();
    return;
  }
  const matched = displayBarres.value.find(b => isPointInBarre(pt, b));
  if (matched) {
    handleBarreMouseEnter(matched);
  } else {
    handleBarreMouseLeave();
  }
};

// 1. 鼠标在指板上移动时检测横按气泡
watch(() => hoverPoint, syncBarreHover, { deep: true });

// 2. 当点按音符产生新横按时（如按下第 2 颗音符），即使鼠标不移动也立即检测并瞬间浮现气泡！
watch(displayBarres, syncBarreHover, { flush: 'post' });

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
  // 鼠标悬浮在横按气泡上时，坚决不显示上一品的空品预览环
  if (isBubbleHovered.value) return false;
  const hp = hoverPoint;
  if (!hp || hp.fretIndex <= 0 || hp.fretIndex > fretCount) return false;
  return strings[hp.stringIndex]?.[0] !== hp.fretIndex;
});

const showEmptyFocusRing = computed(() => {
  const fp = focusPoint;
  if (!fp || fp.fretIndex <= 0 || fp.fretIndex > fretCount) return false;
  if (hoverPoint && hoverPoint.stringIndex === fp.stringIndex && hoverPoint.fretIndex === fp.fretIndex) {
    return false;
  }
  return strings[fp.stringIndex]?.[0] !== fp.fretIndex;
});
</script>

<style lang="scss" scoped>
@use '@/assets/tokens' as *;

.barre-bubble-transition-enter-active,
.barre-bubble-transition-leave-active {
  transition:
    opacity $duration-base $bezier-standard,
    transform $duration-base $bezier-standard;
  will-change: opacity, transform;
}

.barre-bubble-transition-enter-from,
.barre-bubble-transition-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.barre-bubble-transition-enter-to,
.barre-bubble-transition-leave-from {
  opacity: 1;
  transform: translateY(0);
}
</style>
