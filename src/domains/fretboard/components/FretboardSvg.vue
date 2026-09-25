<template>
  <div class="relative inline-block w-full">
    <!-- 悬浮横按操作气泡：置于根容器顶层（不受板身撑开动画的 overflow 裁切影响）；
         外层 Wrapper 专注坐标定位与平移过渡，内层 Panel 专注入场出场动效与点击交互 -->
    <div
      v-if="isBubbleMounted && displayBubbleGeometry"
      :style="{
        left: `${(displayBubbleGeometry.centerX / (boardWidth || DEFAULT_BOARD_WIDTH)) * 100}%`,
        top: `${displayBubbleGeometry.topY}px`,
      }"
      class="pointer-events-none absolute z-card -translate-x-1/2 -translate-y-full transition-[left,top] duration-200 ease-out select-none"
    >
      <Transition @after-leave="handleBubbleAfterLeave()" appear name="barre-bubble-transition">
        <div
          v-auto-width
          v-if="activeHoveredBarre && displayBubbleBarre"
          v-wave="{ clip: barreWaveClip }"
          :class="[
            displayBubbleBarre.isMarked
              ? 'border-primary-solid bg-primary-solid text-fg-on-solid shadow-[0_1px_4px_rgba(var(--color-primary-rgb),0.28)] hover:shadow-[0_1px_7px_rgba(var(--color-primary-rgb),0.5)]'
              : 'border-tint-primary-60 bg-surface-panel text-primary shadow-md hover:bg-tint-primary-92',
          ]"
          @mousedown.prevent.stop
          @pointerdown.prevent.stop
          @pointermove.stop
          @click.stop="handleBarreBubbleClick()"
          @pointerenter.stop="handleBubblePointerEnter()"
          @pointerleave="handleBubblePointerLeave()"
          class="group pointer-events-auto relative flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold whitespace-nowrap transition-[background-color,border-color,box-shadow] duration-fast"
        >
          <!-- 已标记态用实心强调色底：底取 `bg-primary-solid`（`solid` 算子按「白字恰好过 AA 4.5:1」
               反推压深的实心档）、字取 `text-fg-on-solid` —— 这一对是
               tests/tokens/colorTokens.test.ts 唯一授权的组合（`--text-on-solid` 只许配
               `--color-<族>-solid`），故不破对比度门禁，并与勾选框 / 徽章 filled 档同口径。
               刻意不用裸 `bg-primary` + `--text-on-accent`：该墨色三主题统一取深墨，
               纯黑落在饱和蓝上是全项目最扎眼的一处。
               悬停也**不**走勾选框那套 `hover:bg-lift-primary-10`：lift 由 `--color-primary`（而非实心档）
               派生，底一亮白字就掉到 3.53 / 3.23 / 2.38:1 —— 三主题全部低于 AA，
               高对比主题连非文本下限 3:1 都不保。勾选框 / 开关的悬停实心底上只承载图形、
               徽章 filled 干脆没有悬停档，本项目此前不存在「悬停实心底承载文字」的先例，
               此处不新造一个。改以加深投影做悬停反馈，底色不动，白字恒定 4.50~4.58:1。
               未标记态维持不填充（面板底色），两态因此是「实心 vs 留白」的区分，不只靠描边与图标；
               其 hover 仍留 -92：原是为不撞已标记占用的 -88 而让档，本次已无占用，但不在本次改动路径上。 -->
          <!-- 两态图标：换 name 即由 BaseIcon 自动做线条级形变（「+」就地张开成「✓」），
               调用方不需要声明「从哪个图标到哪个图标」 -->
          <BaseIcon :name="displayBubbleBarre.isMarked ? 'check' : 'plus'" icon-size="md" icon-stroke="bold" />
          <span>{{ displayBubbleBarre.isMarked ? '取消标记' : '标记横按' }}</span>

          <!-- 指向箭头：由剪影层把面板描边与楔形画成**一条连续轮廓**（几何见 arrowPanel.ts）。
               它必须是面板的直接子节点（靠 parentElement 认领宿主），且面板不得裁剪。
               不再需要「箭头复刻面板取色」与「箭头层级低于波纹容器」这两条旧约束 ——
               它已是面板轮廓本身，取色与过渡都由剪影层从面板复刻。 -->
          <BaseArrowPanel :size="barreArrowSize" side="bottom" />
        </div>
      </Transition>
    </div>

    <!-- 品数撑开动画容器：保留 overflow-y-clip 类名兼容单测，内联 overflow: visible 杜绝左右音符被截断 -->
    <div
      :style="{ height: `${boardBoxHeight}px`, overflow: 'visible' }"
      class="relative w-full overflow-y-clip transition-[height] duration-slow ease-sidebar"
    >
      <!-- 左侧品号：坐标与字号仍由 geometry 给出（与 Canvas 同源），文字**外观**改由 BaseRollingText 承载 ——
           改品位偏移时同一格上的数字做「旧字上滑离场、新字自下滑入」（单档即 3 → 4，
           跨品窗跳转则整列一起翻），而不是原地换字。本层刻意把 aria-live 显式关掉：
           整层是 aria-hidden 的装饰层，组件默认的 polite 播报在此无处安放（口径同 BaseNumberInput）。 -->
      <div aria-hidden="true" class="pointer-events-none absolute inset-0 z-inner">
        <span
          v-for="i in visualFretCount"
          :class="showsFretNumber(i, fretCount) ? 'opacity-100' : 'opacity-0'"
          :key="'fret-num-' + i"
          :style="getFretNumberStyle(i)"
          class="absolute -translate-x-full -translate-y-1/2 font-[Helvetica_Neue,Arial,sans-serif] leading-none font-extrabold text-(--fb-label) transition-opacity duration-slow ease-sidebar select-none"
        >
          <BaseRollingText :text="`${absoluteFretLabel(fretOffset, i)}`" aria-live="off" />
        </span>
      </div>

      <svg
        :aria-label="boardAriaLabel"
        :height="renderedSvgHeight"
        :style="{ overflow: 'visible', maxWidth: `${boardWidth || DEFAULT_BOARD_WIDTH}px` }"
        :viewBox="`0 0 ${boardWidth || DEFAULT_BOARD_WIDTH} ${renderedSvgHeight}`"
        :width="boardWidth || DEFAULT_BOARD_WIDTH"
        class="pointer-events-none mx-auto block w-full"
        preserveAspectRatio="xMidYMin meet"
        role="group"
      >
        <defs>
          <!-- 琴格底部品丝收拢裁切：仅在品数收拢时对琴弦底端及品丝执行平滑裁切，
               左右与上方各留一段裕量，避免裁切线切进可见的笔触 -->
          <clipPath id="fretboard-grid-clip">
            <rect
              :height="gridClipHeight - geometry.gridTop + GRID_CLIP_BLEED"
              :width="(boardWidth || DEFAULT_BOARD_WIDTH) + GRID_CLIP_BLEED * 2"
              :x="-GRID_CLIP_BLEED"
              :y="geometry.gridTop - GRID_CLIP_BLEED"
              class="transition-[height] duration-slow ease-sidebar"
            />
          </clipPath>
        </defs>

        <!-- 1. 琴格网格与品丝（受 grid-clip 约束，保证品数收拢时自下而上零残影裁切）。
             线宽取自几何：三处指板共用同一条基准线宽，各按自己的 scale 派生 -->
        <g clip-path="url(#fretboard-grid-clip)">
          <line
            v-for="s in strings.length"
            :key="'string-' + s"
            :stroke-width="geometry.lineWidth"
            :x1="stringXPositions[s - 1] ?? 0"
            :x2="stringXPositions[s - 1] ?? 0"
            :y1="geometry.gridTop"
            :y2="gridBottomOf(visualFretCount)"
            class="fretboard-string-line"
            shape-rendering="crispEdges"
            stroke="var(--fb-line)"
            stroke-linecap="butt"
          />

          <line
            v-for="f in visualFretCount + 1"
            :class="{ 'opacity-0': f > fretCount + 1 }"
            :key="'fret-line-' + (f - 1)"
            :stroke-width="geometry.lineWidth"
            :x1="stringXPositions[0] ?? 0"
            :x2="stringXPositions[strings.length - 1] ?? 0"
            :y1="fretLineY(f - 1)"
            :y2="fretLineY(f - 1)"
            class="transition-opacity duration-slow ease-sidebar"
            shape-rendering="crispEdges"
            stroke="var(--fb-line)"
            stroke-linecap="square"
          />
        </g>

        <!-- 2. 零品加粗视觉带（上琴枕）：零品线本身恒以普通品丝粗细渲染（见上方网格循环），
             此带完整覆盖零品线（底缘压到线宽下沿）——琴枕态只见深色粗带、偏移态只见灰色细线，
             任一时刻单一颜色无拼缝；矩形横向左右各外扩半线宽、纵向落在骨架上。
             进/出**不走 v-if**：矩形常驻，只让高度在 0 ↔ 弦枕高之间插值，顶边锚在「指板顶那条线」
             （跨窗口恒定，见 nutBarStyle），故看到的是弦枕自顶线向下长满、向上收没。
             此前用 v-if 卸载，等于把 .wide-nut-bar 那条 height 过渡连同元素一起卸掉 —— 那才是
             「瞬时跳变」的唯一原因，不是缺过渡规则。 -->
        <rect
          :style="nutBarStyle"
          :width="nutBarRect.width"
          :x="nutBarRect.x"
          class="wide-nut-bar pointer-events-none"
          fill="var(--fb-nut)"
        />

        <!-- 3. 横按梁（推导横按与已标记横按）：绘制在音符下方作为底衬，淡蓝色表示已标记，更淡的蓝色表示推导未标记 -->
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
              :height="geometry.fretHeight"
              :style="barreHotspotStyle(barre)"
              :width="barreGeometry(barre).width"
              :x="barreGeometry(barre).x"
              :y="fretLineY(barre.fret - 1)"
              class="barre-transition"
              fill="transparent"
            />
            <!-- 视觉横按梁底衬（首次挂载时从左向右展开，跨度改变时平滑形态插值延展）：
                 体量（位置 / 跨度 / 厚度 / 圆角半径）全取自几何，描边只是一圈压在梁缘上的线 -->
            <rect
              :fill="getBarreFill(barre.isMarked)"
              :height="geometry.barreThickness"
              :rx="geometry.barreThickness / 2"
              :stroke="getBarreStroke(barre.isMarked)"
              :stroke-dasharray="barre.isMarked ? undefined : '6 4'"
              :stroke-width="barreStrokeWidth"
              :style="barreBeamStyle(barre)"
              :width="barreGeometry(barre).width"
              :x="barreGeometry(barre).x"
              :y="barreGeometry(barre).y"
              class="fretboard-barre-beam barre-slide-in barre-transition duration-fast hover:brightness-110"
            />
          </g>
        </g>

        <!-- 4. 空品位预览环（悬停 / 键盘焦点落点反馈）：指针悬停或方向键把焦点移到「该弦当前无音符」的品位格时，
             用与音符外圈高亮环等大的描边环画出落点；落在音符所在格时由 FretboardNote 自身的高亮环接手，此处不重复绘制；
             空弦区（品位 0）恒有 FretboardNote 的空弦圆点兜底，故不在此绘制。
             层级：压在横按梁之上、音符之下，与音符自身「外环在内点下方」的层叠关系一致。
             环的半径与线宽都取几何的同一项，故与音符高亮环逐像素等大 -->
        <circle
          v-if="showEmptyHoverRing"
          :cx="stringXPositions[hoverPoint!.stringIndex] ?? 0"
          :cy="getStringNoteY(hoverPoint!.fretIndex)"
          :fill="hoverFillColor"
          :r="geometry.noteOutlineRadius"
          :stroke-width="geometry.noteOutlineWidth"
          stroke="var(--color-primary)"
        />

        <circle
          v-if="showEmptyFocusRing"
          :cx="stringXPositions[focusPoint!.stringIndex] ?? 0"
          :cy="getStringNoteY(focusPoint!.fretIndex)"
          :fill="hoverFillColor"
          :r="geometry.noteOutlineRadius"
          :stroke-width="geometry.noteOutlineWidth"
          stroke="var(--color-primary)"
        />

        <!-- 5. 一弦一音符持久实体（每根弦对应一颗 Note，脱离 clipPath，左右与上方弧度 100% 完整显示；
             品位变化时由 CSS transform 驱动沿琴弦垂直滑行） -->
        <g>
          <g
            v-for="(str, sIdx) in strings"
            :class="{ 'is-moving': movingStringIndices.has(sIdx) }"
            :key="'string-note-' + sIdx"
            :style="getStringNoteStyle(sIdx, str.fret)"
            class="string-note-move"
          >
            <FretboardNote
              :aria-label="stringNoteAriaLabel(sIdx, str)"
              :is-accidental="stringNoteInfos[sIdx]!.isAccidental"
              :is-focused="isNoteFocused(sIdx, str.fret)"
              :is-hovered="isNoteHovered(sIdx, str.fret)"
              :is-muted="str.fret < 0"
              :is-open-string="str.fret <= 0"
              :is-root="isRoot(sIdx)"
              :label="stringNoteInfos[sIdx]!.label"
              :prefer-flat="str.preferFlat"
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
import BaseArrowPanel from '@/platform/ui/popover/BaseArrowPanel.vue';
import BaseRollingText from '@/platform/ui/rolling-text/BaseRollingText.vue';
import { computeStringLabelAccidental, formatStringLabel } from '@/domains/chord/theory/theory';
import { useBarreBubble } from '@/domains/fretboard/composables/useBarreBubble';
import { absoluteFretLabel, isZeroFretWindow, showsFretNumber } from '@/domains/fretboard/model/fretGeometry';
import { INTERACTIVE_GEOMETRY, interactiveGeometryFor } from '@/domains/fretboard/model/interactiveGeometry';

import FretboardNote from './FretboardNote.vue';
import {
  barreGeometryOf,
  computeDisplayBarres,
  getBarreFill as getBarreFillOf,
  getBarreStroke as getBarreStrokeOf,
  getStringNoteY as getStringNoteYOf,
} from './FretboardSvg.logic';

import type { DisplayBarre } from './FretboardSvg.logic';
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
  isHighContrast = false,
  barres = [],
  boardWidth,
} = defineProps<{
  strings: GuitarStringsModel;
  fretCount: number;
  fretOffset?: number;
  activeBaseStrings: readonly number[];
  rootStringIndex?: number | null;
  isDarkMode: boolean;
  /** 是否高对比主题。必须与 isDarkMode 分开传：HC 也算「非 light」即 isDarkMode=true，
   *  但它的横按源色沿用明色档、底色却是近黑，沿用暗色档的 alpha 会让未标记横按不可见 */
  isHighContrast?: boolean;
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

/**
 * 本组件的几何口径 —— **一切尺寸都从这里取，组件内不写任何裸算式**。
 *
 * 纵向定位读的是**当前这张图**的实例（见下）；横向、字号、记号尺寸在两张图里完全相同，
 * 走 `INTERACTIVE_GEOMETRY` 单例即可。
 */
const geometry = computed(() => interactiveGeometryFor(isZeroFretWindow(fretOffset)));

/** 未传 boardWidth 时的兜底宽度：默认 6 弦指板（由本侧几何派生） */
const DEFAULT_BOARD_WIDTH = INTERACTIVE_GEOMETRY.boardWidth(6);

/** 横按梁描边宽度（纯笔触，由本侧几何给出） */
const { barreStrokeWidth } = INTERACTIVE_GEOMETRY;

/** 品数收拢裁切的裕量（px）：裁切矩形向上下左右各外扩这么多，避免裁切线切进可见笔触 */
const GRID_CLIP_BLEED = 100;

/**
 * 视觉渲染品数缓冲：
 * - 增加品数：立即扩展内部 SVG 画布与品丝，由外层 div overflow-y-clip 从下往上平滑展开显现；
 * - 减少品数：外层 div 立即向目标高度平滑收起（duration-slow），内部 SVG 与品丝保持在较大品数，
 *   使多出的网格被外层底边自下而上平滑裁切遮蔽吞没，待动画结束后再清理多余品丝，
 *   消除「品数减少瞬间无动画直接闪断」的问题。
 */

/** 缩减品数后清理多余品丝的延时（ms）：必须**严格大于** CSS `--duration-slow`，
 *  否则清理与收起动画同时结束，多出的网格会在裁切完成前被抹掉（闪一下）。
 *  故在动画时长之外显式留一段余量，而不是取「恰好等长」。 */
const FRET_RETRACT_DELAY_MS = 380;
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
      }, FRET_RETRACT_DELAY_MS);
    }
  }
);

onBeforeUnmount(() => {
  if (fretRetractTimer) clearTimeout(fretRetractTimer);
});

/** 撑开容器高度：板身高度（工厂口径，见 boardBoxHeight） */
const boardBoxHeight = computed(() => geometry.value.boardBoxHeight(fretCount));

/** 内部 SVG 视口渲染高度：在收起过渡期内保持较大高度 */
const renderedSvgHeight = computed(() => geometry.value.boardBoxHeight(visualFretCount.value));

/** 板身品格网格精确裁切高度（用于收拢动画自下而上裁切） */
const gridClipHeight = computed(() => gridBottomOf(fretCount) + geometry.value.lineWidth);

/** 指板图的整体无障碍描述：品数与品位偏移信息 */
const boardAriaLabel = computed(
  () => `吉他指板图，共 ${fretCount} 品${fretOffset > 0 ? `，品位偏移 ${fretOffset} 品` : ''}`
);

/** 单根弦指位描述：弦序、品格与音名（v-for 内调用） */
const stringNoteAriaLabel = (sIdx: number, str: GuitarStringEntity) => {
  const stringNum = strings.length - sIdx;
  if (str.fret > 0)
    return `第 ${stringNum} 弦第 ${str.fret} 品，音名 ${formatStringLabel(sIdx, str.fret, str.preferFlat, fretOffset, activeBaseStrings)}`;

  if (str.fret < 0) return `第 ${stringNum} 弦（静音）`;

  return `第 ${stringNum} 弦（空弦 ${formatStringLabel(sIdx, 0, str.preferFlat, fretOffset, activeBaseStrings)}）`;
};

/**
 * 交互指板的坐标一律转发本侧几何（见上方的 geometry），组件内不重算：
 * 品丝线 Y（网格线、横按热区、品号共用）与网格底端（琴弦竖线终点、容器高度、裁切高度共用）。
 */
const fretLineY = (index: number): number => geometry.value.fretLineY(index);
const gridBottomOf = (count: number): number => geometry.value.gridBottomY(count);

/**
 * 品号定位与字号：置于指板左侧、精准对齐横向品丝（偏移量与字号均与 Canvas 同源）。
 * 与 Canvas 的分工到此为止 —— 那边是 fillText 直接落笔，没有「上一帧的字」可翻，
 * 故逐字符翻页是 SVG 侧独有的观感（见模板内品号层）。
 */
const getFretNumberStyle = (fretIndex: number): CSSProperties => {
  const g = geometry.value;
  return {
    top: `${g.fretLineY(fretIndex)}px`,
    left: `${(stringXPositions[0] ?? 0) - g.fretNumberXOffset}px`,
    fontSize: `${g.capoTextFontSize}px`,
  };
};

/**
 * 零品加粗枕条：矩形四边全由几何给出（横向左右各外扩半线宽、纵向落在骨架上），
 * 宽度与左沿走属性、高度与上沿走 style —— 只有 style 绑定才触发 CSS transition
 * （plain SVG attribute 不触发过渡，与 barreBeamStyle 同一约定）。
 *
 * 两张图的 `nutBarRect` 都按**弦枕态**的位置算（高度恒为弦枕高，偏移态那张图连 y 都算到了顶线之上），
 * 故下方把「本图是否画弦枕」当高度开关用：偏移态取高度 0、顶边退回 `rect.y + rect.height`
 * —— 两条路径落到同一条顶线上，插值因此只动底缘（进出靠高度，不靠挂载卸载）。
 */
const nutBarRect = computed(() => geometry.value.nutBarRect(strings.length, stringXPositions[0] ?? 0));

const nutBarStyle = computed<CSSProperties>(() => {
  const rect = nutBarRect.value;
  const grown = isZeroFretWindow(fretOffset);
  // 顶边锚点 = 「指板顶那条线」，跨两态恒定：弦枕态即 rect.y；偏移态那张图少了弦枕那一段，
  // 加回 rect.height 才回到同一条线。锚点不动，于是高度插值是「长满 / 收没」而不是「滑动」。
  return {
    height: `${grown ? rect.height : 0}px`,
    y: `${grown ? rect.y : rect.y + rect.height}px`,
  };
});

/** 该弦是否为根音弦 */
const isRoot = (sIdx: number) => rootStringIndex === sIdx;

// ==================== 一弦一音符持久模型与沿弦滑行动画 ====================

/** 根据品位计算音符中心 Y 坐标（纯函数见 FretboardSvg.logic.ts；几何须传当前这张图的实例） */
const getStringNoteY = (fret: number) => getStringNoteYOf(fret, geometry.value);

/** 正在沿弦滑动的琴弦索引集合：仅在品位变更时激活 transition，避免浏览器缩放/resize 时因矩阵微调误触发过渡抽动 */
const movingStringIndices = ref<Set<number>>(new Set());
/** 滑行过渡的解锁延时（ms）：略大于 $duration-base，保证滑行到位后才解除过渡锁定 */
const MOVING_UNLOCK_DELAY_MS = 250;
let movingTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => strings.map(s => s.fret),
  (newFrets, oldFrets) => {
    // 初始挂载时不触发过渡动画，保持瞬间就位
    if (!oldFrets) return;

    const changedIndices: number[] = [];
    newFrets.forEach((fret, idx) => {
      if (fret !== oldFrets[idx]) changedIndices.push(idx);
    });

    if (changedIndices.length === 0) return;

    movingStringIndices.value = new Set(changedIndices);

    if (movingTimer) clearTimeout(movingTimer);
    movingTimer = setTimeout(() => {
      movingStringIndices.value = new Set();
      movingTimer = null;
    }, MOVING_UNLOCK_DELAY_MS);
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
  const effectiveFret = str.fret > 0 ? str.fret : 0;
  return computeStringLabelAccidental(sIdx, effectiveFret, fretOffset, str.preferFlat, activeBaseStrings);
};

/**
 * 每根弦的音名信息，供模板按索引取用。
 *
 * 模板原先在 `FretboardNote` 上分两处调用 `currentNoteInfo(sIdx, str)`（:is-accidental 与
 * :label），即同一根弦在同一轮渲染里被算两遍；而本组件随 hoverPoint 逐帧重渲染（悬停移动），
 * 于是每帧都付双份计算与对象分配。这里按 strings 一次算好，索引与 `v-for` 同源、必然对齐。
 */
const stringNoteInfos = computed(() => strings.map((str, sIdx) => currentNoteInfo(sIdx, str)));

/** 该按弦点是否处于 hover 位 */
const isNoteHovered = (sIdx: number, fret: number) =>
  Boolean(hoverPoint && hoverPoint.stringIndex === sIdx && hoverPoint.fretIndex === Math.max(0, fret));

/** 该按弦点是否处于键盘焦点位 */
const isNoteFocused = (sIdx: number, fret: number) =>
  Boolean(focusPoint && focusPoint.stringIndex === sIdx && focusPoint.fretIndex === Math.max(0, fret));

// ==================== 横按梁几何与交互 ====================

/** 横按梁几何：圆角圆心对齐最外侧音符中心（纯函数见 FretboardSvg.logic.ts；几何须传当前这张图的实例） */
const barreGeometry = (barre: BarreEntity) => barreGeometryOf(barre, stringXPositions, geometry.value);

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

/** 展示用横按集合（推导候选 + 已标记合并，纯函数见 FretboardSvg.logic.ts） */
const displayBarres = computed<DisplayBarre[]>(() => computeDisplayBarres(strings, barres, fretCount));

/** 横按梁填充色 / 边框色：暗色模式与高对比主题的差异由纯函数处理 */
const getBarreFill = (isMarked: boolean) => getBarreFillOf(isMarked, isDarkMode, isHighContrast);

const getBarreStroke = (isMarked: boolean) => getBarreStrokeOf(isMarked, isDarkMode, isHighContrast);

// ==================== 浮动横按操作气泡交互 ====================

/**
 * 悬停横按梁浮现「标记 / 取消标记」气泡的整套局部状态机（激活键、延迟隐藏计时器、挂载态、
 * 以及离开动画期间不脱位用的缓存）已收进 useBarreBubble；此处只做几何与事件的接线。
 */
const {
  activeHoveredBarre,
  isBubbleMounted,
  displayBubbleBarre,
  displayBubbleGeometry,
  barreArrowSize,
  barreWaveClip,
  isBubbleHovered,
  handleBubbleAfterLeave,
  handleBubblePointerEnter,
  handleBubblePointerLeave,
  handleBarreMouseEnter,
  handleBarreMouseLeave,
  handleBarreBubbleClick,
} = useBarreBubble({
  displayBarres,
  // 三个 prop / 派生值都按取值器传入：props 解构绑定与 `strings.length` 在取值器内读取才保有响应性
  stringXPositions: () => stringXPositions,
  stringCount: () => strings.length,
  fretLineY,
  hoverPoint: () => hoverPoint,
  onToggleBarre: barre => emit('toggle-barre', barre),
});

// ==================== 空品位预览环（悬停 / 键盘焦点落点） ====================

/** 空品位预览环填充色：与 FretboardNote 的高亮环同源 token，明暗主题随 tokens 切换 */
const hoverFillColor = computed(() => 'var(--fb-hover)');

/** 该弦的音符是否正落在给定品位（静音态归位到空弦位 0 品，与 isNoteFocused 的判定口径保持一致） */
const hasNoteAt = (sIdx: number, fretIndex: number) => Math.max(0, strings[sIdx]?.fret ?? 0) === fretIndex;

/**
 * 空品位悬停预览环：
 * 指针悬停在横按气泡上时坚决不绘制——气泡浮于指板上方，此时 hover 坐标会滞留在原格，环会误留在原地
 */
const showEmptyHoverRing = computed(() => {
  if (isBubbleHovered.value) return false;
  const hp = hoverPoint;
  if (!hp || hp.fretIndex <= 0 || hp.fretIndex > fretCount) return false;
  return !hasNoteAt(hp.stringIndex, hp.fretIndex);
});

/**
 * 空品位键盘焦点预览环：
 * 与悬停点重合时让位给悬停环，避免两枚半透明填充环叠画导致该格填充色明显深于其它格
 */
const showEmptyFocusRing = computed(() => {
  const fp = focusPoint;
  if (!fp || fp.fretIndex <= 0 || fp.fretIndex > fretCount) return false;
  if (hoverPoint && hoverPoint.stringIndex === fp.stringIndex && hoverPoint.fretIndex === fp.fretIndex) return false;

  return !hasNoteAt(fp.stringIndex, fp.fretIndex);
});
</script>

<style scoped lang="scss">
@use '@/assets/token-vars' as *;

/* 必须保持 scoped：气泡元素自带 Tailwind 的 transition-[background-color,border-color,box-shadow]
   工具类（与下列过渡规则同为单类选择器 (0,1,0)、且在样式表中位置更靠后）。scoped 会给选择器附加
   [data-v-*]，特异性提升到 (0,2,0) 才能压过该工具类；一旦去掉 scoped，进入/离开的 opacity+transform
   过渡会被工具类覆盖，气泡入场出场动画即失效。 */
.barre-bubble-transition-enter-active,
.barre-bubble-transition-leave-active {
  transition:
    opacity $duration-base $bezier-standard,
    transform $duration-base $bezier-standard;
  will-change: opacity, transform;
}

.barre-bubble-transition-enter-from,
.barre-bubble-transition-leave-to {
  transform: translateY(6px);
  opacity: 0;
}

.barre-bubble-transition-enter-to,
.barre-bubble-transition-leave-from {
  transform: translateY(0);
  opacity: 1;
}

/* 气泡上的波纹容器（v-wave 以 JS 创建、不带 scoped 标记，故必须用 :deep 穿透）：
   裁剪形状不归这里管 —— 模板上的 v-wave 把 barreWaveClip 交给指令（容器被撑成
   「气泡盒 + 向下 9px」），真正的轮廓由剪影层挂到面板上的 --arrow-panel-clip 给出，
   补丁优先按它裁（面板 + 箭头是一条非凸曲线，矩形加圆角表达不了；含那条容易被漏掉的
   mask 裁剪，见 patches/v-wave.patch）。水波因此只扫得到箭头，不会从箭头左右溢出去。
   这里只负责一件事：把容器抬到剪影层（面板轮廓，即箭头本身）之上 —— 水波要扫过箭头，
   就必须晚于它绘制；靠文档序决定先后太脆，显式层级才稳。 */
:deep([data-v-wave-container-internal]) {
  z-index: 2 !important;
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
  transform-box: fill-box;
  transform-origin: left center;
  animation: barre-slide-right $duration-base $bezier-standard both;
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
    transform: scaleX(0);
    opacity: 0;
  }

  to {
    transform: scaleX(1);
    opacity: 1;
  }
}

/* 零品加粗上琴枕：height 单向插值——顶边锚在「指板顶那条线」上、跨窗口恒定，故只有底缘在动：
   0 → 弦枕高是长满，反向是收没，天然不越界，无需 clipPath。触发路径是模板 nutBarStyle 上的
   height 变化（矩形常驻，非零品窗口不卸载）。y 不再列入：锚点恒定后它永不变化，列着只是空转。 */
.wide-nut-bar {
  transition: height $duration-base $bezier-sidebar;
  will-change: height;
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
