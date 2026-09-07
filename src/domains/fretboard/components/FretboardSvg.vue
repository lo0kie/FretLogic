<template>
  <div class="relative inline-block w-full">
    <!-- 悬浮横按操作气泡：置于根容器顶层（不受板身撑开动画的 overflow 裁切影响）；
         外层 Wrapper 专注坐标定位与平移过渡，内层 Panel 专注入场出场动效与点击交互 -->
    <div
      v-if="isBubbleMounted && displayBubbleGeometry"
      :style="{
        left: `${(displayBubbleGeometry.centerX / (boardWidth || CANVAS_CONFIG.BOARD_WIDTH)) * 100}%`,
        top: `${displayBubbleGeometry.topY}px`,
      }"
      class="pointer-events-none absolute z-card -translate-x-1/2 -translate-y-full transition-[left,top] duration-200 ease-out select-none"
    >
      <Transition @after-leave="handleBubbleAfterLeave()" appear name="barre-bubble-transition">
        <div
          v-auto-width
          v-wave
          v-if="activeHoveredBarre && displayBubbleBarre"
          :class="[
            displayBubbleBarre.isMarked
              ? 'border-primary bg-primary text-white shadow-[0_6px_20px_rgba(59,130,246,0.45)] dark:shadow-[0_8px_26px_rgba(96,165,250,0.55)]'
              : 'border-primary/40 bg-surface-panel text-primary shadow-[0_6px_20px_rgba(0,0,0,0.22)] hover:bg-tint-primary-88 dark:shadow-[0_8px_26px_rgba(0,0,0,0.65)]',
          ]"
          @mousedown.prevent.stop
          @pointerdown.prevent.stop
          @pointermove.stop
          @click.stop="handleBarreBubbleClick()"
          @pointerenter.stop="handleBubblePointerEnter()"
          @pointerleave="handleBubblePointerLeave()"
          class="group pointer-events-auto relative flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold whitespace-nowrap transition-[background-color,border-color,box-shadow] duration-fast"
        >
          <BaseIcon v-if="displayBubbleBarre.isMarked" icon-size="md" icon-stroke="bold" name="check" />
          <BaseIcon v-else icon-size="md" icon-stroke="bold" name="plus" />
          <span>{{ displayBubbleBarre.isMarked ? '取消标记' : '标记为横按' }}</span>

          <!-- 直接复用项目统一的 buildFloatingArrowStyle 箭头组件与样式 -->
          <div :style="barreArrowStyle" class="popover-arrow pointer-events-none" />
        </div>
      </Transition>
    </div>

    <!-- 品数撑开动画容器：保留 overflow-y-clip 类名兼容单测，内联 overflow: visible 杜绝左右音符被截断 -->
    <div
      :style="{ height: `${boardBoxHeight}px`, overflow: 'visible' }"
      class="relative box-border w-full overflow-y-clip transition-[height] duration-slow ease-sidebar"
    >
      <div aria-hidden="true" class="pointer-events-none absolute inset-0 z-inner">
        <span
          v-for="i in visualFretCount"
          :class="i < fretCount ? 'opacity-100' : 'opacity-0'"
          :key="'fret-num-' + i"
          :style="getFretNumberStyle(i)"
          class="absolute -translate-x-full -translate-y-1/2 font-[Helvetica_Neue,Arial,sans-serif] text-xl leading-none font-extrabold text-(--fb-label) transition-opacity duration-slow ease-sidebar select-none"
        >
          {{ fretOffset > 0 ? fretOffset + i : i }}
        </span>
      </div>

      <svg
        :aria-label="boardAriaLabel"
        :height="renderedSvgHeight"
        :style="{ overflow: 'visible', maxWidth: `${boardWidth || CANVAS_CONFIG.BOARD_WIDTH}px` }"
        :viewBox="`0 0 ${boardWidth || CANVAS_CONFIG.BOARD_WIDTH} ${renderedSvgHeight}`"
        :width="boardWidth || CANVAS_CONFIG.BOARD_WIDTH"
        class="pointer-events-none mx-auto box-border block w-full"
        preserveAspectRatio="xMidYMin meet"
        role="img"
      >
        <defs>
          <!-- 琴格底部品丝收拢裁切：仅在品数收拢（4->3品）时对琴弦底端及品丝执行平滑裁切，左右保留 100px 裕量 -->
          <clipPath id="fretboard-grid-clip">
            <rect
              :height="gridClipHeight - CANVAS_CONFIG.OFFSET_Y_TOP + 100"
              :width="(boardWidth || CANVAS_CONFIG.BOARD_WIDTH) + 200"
              :y="CANVAS_CONFIG.OFFSET_Y_TOP - 100"
              class="transition-[height] duration-slow ease-sidebar"
              x="-100"
            />
          </clipPath>
        </defs>

        <!-- 1. 琴格网格与品丝（受 grid-clip 约束，保证品数收拢时自下而上零残影裁切） -->
        <g clip-path="url(#fretboard-grid-clip)">
          <line
            v-for="s in strings.length"
            :key="'string-' + s"
            :stroke-width="FRETBOARD_LINE_WIDTH"
            :x1="stringXPositions[s - 1] ?? 0"
            :x2="stringXPositions[s - 1] ?? 0"
            :y1="CANVAS_CONFIG.OFFSET_Y_TOP"
            :y2="CANVAS_CONFIG.OFFSET_Y_TOP + visualFretCount * CANVAS_CONFIG.FRET_HEIGHT"
            class="fretboard-string-line"
            shape-rendering="crispEdges"
            stroke="var(--fb-line)"
            stroke-linecap="butt"
          />

          <line
            v-for="f in visualFretCount + 1"
            :class="{ 'opacity-0': f > fretCount + 1 }"
            :key="'fret-line-' + (f - 1)"
            :stroke-width="FRETBOARD_LINE_WIDTH"
            :x1="stringXPositions[0] ?? 0"
            :x2="stringXPositions[strings.length - 1] ?? 0"
            :y1="CANVAS_CONFIG.OFFSET_Y_TOP + (f - 1) * CANVAS_CONFIG.FRET_HEIGHT"
            :y2="CANVAS_CONFIG.OFFSET_Y_TOP + (f - 1) * CANVAS_CONFIG.FRET_HEIGHT"
            class="transition-opacity duration-slow ease-sidebar"
            shape-rendering="crispEdges"
            stroke="var(--fb-line)"
            stroke-linecap="square"
          />
        </g>

        <!-- 2. 零品加粗视觉带（上琴枕）：零品线本身恒以普通品丝粗细渲染（见上方网格循环），
             此带仅在琴枕态出现，且完整覆盖零品线（底缘压到线宽下沿）——琴枕态只见深色粗带、
             偏移态只见灰色细线，任一时刻单一颜色无拼缝；
             height 从 0 插值生长，天然不越界。fretOffset≠0 时用 v-if 卸载（瞬时跳变，不需要过渡）。 -->
        <rect
          v-if="fretOffset === 0"
          :style="nutBarStyle"
          :width="(stringXPositions[strings.length - 1] ?? 0) - (stringXPositions[0] ?? 0) + FRETBOARD_LINE_WIDTH"
          :x="(stringXPositions[0] ?? 0) - FRETBOARD_LINE_WIDTH / 2"
          class="wide-nut-bar pointer-events-none"
          fill="var(--fb-nut)"
          rx="1"
        />

        <!-- 2. 横按梁（推导横按与已标记横按）：绘制在音符下方作为底衬，淡蓝色表示已标记，更淡的蓝色表示推导未标记 -->
        <g v-if="displayBarres.length" class="fretboard-barre-group">
          <g
            v-for="barre in displayBarres"
            :key="barre.key"
            @mouseenter="handleBarreMouseEnter(barre)"
            @mouseleave="handleBarreMouseLeave()"
            class="pointer-events-auto transition-all duration-fast"
          >
            <!-- 整品高度感应热区：鼠标悬停在横按区域内任何位置均浮现气泡 -->
            <rect
              :height="CANVAS_CONFIG.FRET_HEIGHT"
              :style="barreHotspotStyle(barre)"
              :width="barreGeometry(barre).width"
              :x="barreGeometry(barre).x"
              :y="CANVAS_CONFIG.OFFSET_Y_TOP + (barre.fret - 1) * CANVAS_CONFIG.FRET_HEIGHT"
              class="barre-transition"
              fill="transparent"
            />
            <!-- 视觉横按梁底衬（首次挂载时从左向右展开，跨度改变时平滑形态插值延展） -->
            <rect
              :fill="getBarreFill(barre.isMarked)"
              :height="barreThickness"
              :rx="barreThickness / 2"
              :stroke="getBarreStroke(barre.isMarked)"
              :stroke-dasharray="barre.isMarked ? undefined : '6 4'"
              :style="barreBeamStyle(barre)"
              :width="barreGeometry(barre).width"
              :x="barreGeometry(barre).x"
              :y="barreGeometry(barre).y"
              class="fretboard-barre-beam barre-slide-in barre-transition duration-fast hover:brightness-110"
              stroke-width="1.5"
            />
          </g>
        </g>

        <!-- 3. 一弦一音符持久实体（6 根琴弦对应 6 颗 Note，脱离 clipPath，左右与上方弧度 100% 完整显示；
             品位变化时由 CSS transform 驱动沿琴弦垂直滑行） -->
        <g>
          <g
            v-for="(str, sIdx) in strings"
            :class="{ 'is-moving': movingStringIndices.has(sIdx) }"
            :key="'string-note-' + sIdx"
            :style="getStringNoteStyle(sIdx, str[0])"
            class="string-note-move"
          >
            <FretboardNote
              :aria-label="stringNoteAriaLabel(sIdx, str)"
              :is-accidental="currentNoteInfo(sIdx, str).isAccidental"
              :is-focused="isNoteFocused(sIdx, str[0])"
              :is-hovered="isNoteHovered(sIdx, str[0])"
              :is-muted="str[0] < 0"
              :is-open-string="str[0] <= 0"
              :is-root="isRoot(sIdx)"
              :label="currentNoteInfo(sIdx, str).label"
              :prefer-flat="str[1]"
              :x="0"
              :y="0"
              @toggle-pitch="emit('toggle-pitch', sIdx)"
            />
          </g>
        </g>
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import { computeStringLabelAccidental, formatStringLabel } from '@/domains/chord/theory/theory';
import { computeBarreCandidates, isBarreStillValid } from '@/domains/fretboard/model/coordinates';
import { buildFloatingArrowStyle } from '@/platform/ui/popover/floatingArrow';

import FretboardNote from './FretboardNote.vue';
import {
  BARRE_ARROW_TRANSITION_MS,
  CANVAS_CONFIG,
  FRETBOARD_LINE_WIDTH,
  NOTE_DISPLAY,
  OPEN_STRING_MARKER_Y,
} from '../constants';

import type { BarreEntity, GuitarStringEntity, GuitarStringsModel } from '@/domains/fretboard/types';
import type { CSSProperties } from 'vue';

const {
  hoverPoint = null,
  focusPoint = null,
  rootStringIndex = null,
  stringXPositions,
  activeBaseStrings,
  strings,
  fretCount,
  fretOffset = 0,
  isDarkMode,
  barres = [],
  boardWidth,
} = defineProps<{
  strings: GuitarStringsModel;
  fretCount: number;
  fretOffset?: number;
  activeBaseStrings: readonly number[];
  rootStringIndex?: number | null;
  isDarkMode: boolean;
  stringXPositions: number[];
  hoverPoint?: { stringIndex: number; fretIndex: number } | null;
  focusPoint?: { stringIndex: number; fretIndex: number } | null;
  /** 横按列表（显式配置或自动推导），绘制在音符下方 */
  barres?: BarreEntity[];
  /** 指板画布基准宽度（根据弦数动态推导） */
  boardWidth?: number;
}>();

const emit = defineEmits<{
  (e: 'toggle-pitch', stringIndex: number): void;
  (e: 'toggle-barre', barre: BarreEntity): void;
}>();

/** 横按实心梁厚度：贴合按弦圆点直径 */
const barreThickness = NOTE_DISPLAY.FINGER_DOT_RADIUS * 2;

/** 零品加粗样式：加粗带完整覆盖零品线（底缘压到线宽下沿），使琴枕态画面中只存在深色粗带一种颜色，
 *  偏移态卸载后只存在灰色细线一种颜色——任一状态都不会出现双色拼缝；
 *  通过 style 绑定 height/y 使 CSS transition 生效（plain SVG attribute 不触发 transition，
 *  与 barreBeamStyle 同样约定）；显隐由模板 v-if="fretOffset === 0" 控制 */
const NUT_BAR_HEIGHT = 14;
const nutBarStyle = computed<CSSProperties>(() => {
  return {
    height: `${NUT_BAR_HEIGHT}px`,
    y: `${CANVAS_CONFIG.OFFSET_Y_TOP - NUT_BAR_HEIGHT + FRETBOARD_LINE_WIDTH / 2}px`,
  };
});

/**
 * 视觉渲染品数缓冲：
 * - 增加品数（3 -> 4）：立即扩展内部 SVG 画布与品丝，由外层 div overflow-y-clip 从下往上平滑展开显现；
 * - 减少品数（4 -> 3）：外层 div 立即向目标 3 品高度平滑收起（duration-slow 300ms），内部 SVG 与品丝保持在 4 品，
 *   使第 4 品网格被外层底边自下而上平滑裁切遮蔽吞没，待动画结束后再清理多余品丝，消除 4->3 品瞬间闪断无动画的问题。
 */
const visualFretCount = ref(fretCount);
let fretRetractTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => fretCount,
  newVal => {
    if (newVal >= visualFretCount.value) {
      if (fretRetractTimer) {
        clearTimeout(fretRetractTimer);
        fretRetractTimer = null;
      }
      visualFretCount.value = newVal;
    } else {
      if (fretRetractTimer) clearTimeout(fretRetractTimer);
      fretRetractTimer = setTimeout(() => {
        visualFretCount.value = newVal;
        fretRetractTimer = null;
      }, 350); // 略大于 CSS duration-slow (300ms)
    }
  }
);

onBeforeUnmount(() => {
  if (fretRetractTimer) clearTimeout(fretRetractTimer);
});

/** 撑开容器高度：包含顶部 80px 空弦区 + 各品高 + 底部 20px 留白 */
const boardBoxHeight = computed(
  () => CANVAS_CONFIG.OFFSET_Y_TOP + fretCount * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.OFFSET_Y_BOTTOM
);

/** 内部 SVG 视口渲染高度：在收起过渡期内保持较大高度 */
const renderedSvgHeight = computed(
  () => CANVAS_CONFIG.OFFSET_Y_TOP + visualFretCount.value * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.OFFSET_Y_BOTTOM
);

/** 板身品格网格精确裁切高度（用于收拢动画自下而上裁切） */
const gridClipHeight = computed(
  () => CANVAS_CONFIG.OFFSET_Y_TOP + fretCount * CANVAS_CONFIG.FRET_HEIGHT + FRETBOARD_LINE_WIDTH
);

/** 指板图的整体无障碍描述：品数与品位偏移信息 */
const boardAriaLabel = computed(
  () => `吉他指板图，共 ${fretCount} 品${fretOffset > 0 ? `，品位偏移 ${fretOffset} 品` : ''}`
);

/** 单根弦指位描述：弦序、品格与音名（v-for 内调用） */
const stringNoteAriaLabel = (sIdx: number, str: GuitarStringEntity) => {
  const stringNum = strings.length - sIdx;
  if (str[0] > 0) {
    return `第 ${stringNum} 弦第 ${str[0]} 品，音名 ${formatStringLabel(sIdx, str[0], str[1], fretOffset, activeBaseStrings)}`;
  }
  if (str[0] < 0) {
    return `第 ${stringNum} 弦（静音）`;
  }
  return `第 ${stringNum} 弦（空弦 ${formatStringLabel(sIdx, 0, str[1], fretOffset, activeBaseStrings)}）`;
};

/** 品号定位：置于指板左侧、精准对齐横向品丝 */
const getFretNumberStyle = (fretIndex: number) => {
  const yPixel = CANVAS_CONFIG.OFFSET_Y_TOP + fretIndex * CANVAS_CONFIG.FRET_HEIGHT;
  const xPixel = (stringXPositions[0] ?? 0) - 22;
  return {
    top: `${yPixel}px`,
    left: `${xPixel}px`,
  };
};

/** 该弦是否为根音弦 */
const isRoot = (sIdx: number) => rootStringIndex === sIdx;

// ==================== 一弦一音符持久模型与沿弦滑行动画 ====================

/** 根据品位计算音符中心 Y 坐标：0 品/静音位于 34px，1~N 品位于对应品格中心 (80 + (fret - 0.5) * 100) */
const getStringNoteY = (fret: number) => {
  if (fret <= 0) {
    return OPEN_STRING_MARKER_Y;
  }
  return CANVAS_CONFIG.OFFSET_Y_TOP + (fret - 0.5) * CANVAS_CONFIG.FRET_HEIGHT;
};

/** 正在沿弦滑动的琴弦索引集合：仅在品位变更时激活 transition，避免浏览器缩放/resize 时因矩阵微调误触发过渡抽动 */
const movingStringIndices = ref<Set<number>>(new Set());
let movingTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => strings.map(s => s[0]),
  (newFrets, oldFrets) => {
    // 初始挂载时不触发过渡动画，保持瞬间就位
    if (!oldFrets) return;

    const changedIndices: number[] = [];
    newFrets.forEach((fret, idx) => {
      if (fret !== oldFrets[idx]) {
        changedIndices.push(idx);
      }
    });

    if (changedIndices.length === 0) return;

    movingStringIndices.value = new Set(changedIndices);

    if (movingTimer) clearTimeout(movingTimer);
    movingTimer = setTimeout(() => {
      movingStringIndices.value = new Set();
      movingTimer = null;
    }, 250); // 略大于 $duration-base (200ms)
  }
);

onBeforeUnmount(() => {
  if (movingTimer) clearTimeout(movingTimer);
});

/** 位移层定位：音符坐标由 transform 驱动（弦横向恒定、品位纵向平滑往返） */
const getStringNoteStyle = (sIdx: number, fret: number): CSSProperties => ({
  transform: `translate(${stringXPositions[sIdx] ?? 0}px, ${getStringNoteY(fret)}px)`,
});

/** 当前音符音名计算：0 品及静音计算空弦音名，按品计算当前品位音名 */
const currentNoteInfo = (sIdx: number, str: GuitarStringEntity) => {
  const effectiveFret = str[0] > 0 ? str[0] : 0;
  return computeStringLabelAccidental(sIdx, effectiveFret, fretOffset, str[1], activeBaseStrings);
};

/** 该按弦点是否处于 hover 位 */
const isNoteHovered = (sIdx: number, fret: number) =>
  Boolean(hoverPoint && hoverPoint.stringIndex === sIdx && hoverPoint.fretIndex === Math.max(0, fret));

/** 该按弦点是否处于键盘焦点位 */
const isNoteFocused = (sIdx: number, fret: number) =>
  Boolean(focusPoint && focusPoint.stringIndex === sIdx && focusPoint.fretIndex === Math.max(0, fret));

// ==================== 横按梁几何与交互 ====================

/** 横按梁几何：圆角圆心对齐最外侧音符中心（pad = 厚度一半），y 对齐所在品中心 */
const barreGeometry = (barre: BarreEntity) => {
  const pad = barreThickness / 2;
  const x1 = stringXPositions[barre.fromString] ?? 0;
  const x2 = stringXPositions[barre.toString] ?? 0;
  const xLeft = Math.min(x1, x2) - pad;
  const xRight = Math.max(x1, x2) + pad;
  return {
    x: xLeft,
    width: Math.max(0, xRight - xLeft),
    y: CANVAS_CONFIG.OFFSET_Y_TOP + (barre.fret - 0.5) * CANVAS_CONFIG.FRET_HEIGHT - pad,
  };
};

/** 视觉横按梁内联几何样式：显式驱动 CSS transition 实现平滑形态形变与跨度伸缩 */
const barreBeamStyle = (barre: BarreEntity): CSSProperties => {
  const geo = barreGeometry(barre);
  return {
    x: `${geo.x}px`,
    y: `${geo.y}px`,
    width: `${geo.width}px`,
  };
};

/** 感应热区内联几何样式：与视觉梁同步平滑形变 */
const barreHotspotStyle = (barre: BarreEntity): CSSProperties => {
  const geo = barreGeometry(barre);
  return {
    x: `${geo.x}px`,
    width: `${geo.width}px`,
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

  // 采用稳定品位键 barre-fret-{fret}，琴弦跨度变化（如 xxx222 改为 xx2222）时复用已有 DOM 节点，触发平滑连续形态延展
  const fretCounters = new Map<number, number>();
  return Array.from(map.values()).map(({ barre, isMarked }) => {
    const count = fretCounters.get(barre.fret) ?? 0;
    fretCounters.set(barre.fret, count + 1);
    const key = count === 0 ? `barre-fret-${barre.fret}` : `barre-fret-${barre.fret}-${count}`;
    return {
      ...barre,
      isMarked,
      key,
    };
  });
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
  const topY = CANVAS_CONFIG.OFFSET_Y_TOP + (b.fret - 1) * CANVAS_CONFIG.FRET_HEIGHT + 4;
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

const isPointInBarre = (pt: { stringIndex: number; fretIndex: number } | null, b: BarreEntity) => {
  if (!pt) return false;
  if (pt.fretIndex !== b.fret) return false;
  const minS = Math.min(b.fromString, b.toString);
  const maxS = Math.max(b.fromString, b.toString);
  return pt.stringIndex >= minS && pt.stringIndex <= maxS;
};

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

watch(() => hoverPoint, syncBarreHover, { deep: true });
watch(displayBarres, syncBarreHover, { flush: 'post' });
</script>

<style scoped lang="scss">
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

/* 琴弦底端在品数收缩时的平滑过渡 */
.fretboard-string-line {
  transition: y2 $duration-slow $bezier-sidebar;
}

/* 一弦一音符沿琴弦垂直滑行的移动过渡：
   平时处于静态锁定状态（transition: none），仅在品位变动激活 .is-moving 时驱动 transform 平滑沿弦滑行；
   显式锁定变换参考系为 view-box 且原点为 (0, 0)；
   彻底根治浏览器缩放（Ctrl +/-）或容器 resize 时变换矩阵亚像素重算误触发 CSS transition 导致的音符偏离琴弦抽动现象 */
.string-note-move {
  transform-box: view-box;
  transform-origin: 0 0;
  transition: none;

  &.is-moving {
    transition: transform $duration-base $bezier-sidebar;
  }
}

/* 横按标记入场动画：从左往右展开延展，伴随平滑淡入 */
.barre-slide-in {
  animation: barre-slide-right $duration-base $bezier-standard both;
  transform-box: fill-box;
  transform-origin: left center;
  will-change: opacity, transform;
}

/* 横按梁形态与颜色过渡：琴弦跨度伸缩或品位变动时，位置、尺寸与颜色平滑插值延展 */
.barre-transition {
  transition:
    x $duration-base $bezier-standard,
    y $duration-base $bezier-standard,
    width $duration-base $bezier-standard,
    fill $duration-base $bezier-standard,
    stroke $duration-base $bezier-standard;
  will-change: x, y, width, fill, stroke;
}

@keyframes barre-slide-right {
  from {
    opacity: 0;
    transform: scaleX(0);
  }

  to {
    opacity: 1;
    transform: scaleX(1);
  }
}

/* 0 品加粗上琴枕：height/y 联动插值——bottom 恒为 OFFSET_Y_TOP，height 从 0→12 时自品丝线向上生长，
   12→0 时收缩消失，天然不越界，无需 clipPath 或 Transition */
.wide-nut-bar {
  transition:
    height $duration-base $bezier-sidebar,
    y $duration-base $bezier-sidebar;
  will-change: height, y;
}

@media (prefers-reduced-motion: reduce) {
  .barre-slide-in {
    animation: none;
  }

  .string-note-move,
  .barre-transition,
  .wide-nut-bar {
    transition: none;
  }
}
</style>
