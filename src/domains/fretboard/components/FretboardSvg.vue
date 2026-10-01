<template>
  <div class="relative inline-block w-full">
    <!-- 浮动横按操作气泡：置于根容器顶层（不受板身撑开动画的 overflow 裁切影响）；
         外层 Wrapper 专注坐标定位与平移过渡，内层 Panel 专注入场出场动效与点击交互。
         **一维列表**：悬停档至多一条（key 为常量，同一枚气泡在横按之间滑过去），
         常驻档（触屏）一条横按一条 —— 两档的组装口径见 useBarreBubble 的 bubbleItems -->
    <div
      v-for="item in bubbleItems"
      :key="item.key"
      :style="{
        left: `${(item.geometry.centerX / (boardWidth || DEFAULT_BOARD_WIDTH)) * 100}%`,
        top: `${item.geometry.topY}px`,
      }"
      class="pointer-events-none absolute z-card -translate-x-1/2 -translate-y-full transition-[left,top] duration-200 ease-out select-none"
    >
      <!-- 气泡本体（药丸 + 指向箭头 + 进出场 + 按压波纹 + 指针卫生）是平台原语 BaseAnchorBubble；
           本层只负责**特定需求**：锚点坐标（左/上跟随指板几何的位移过渡）、两态外观、内容与交互。
           位移过渡刻意留在这里而不是组件里 —— 「跟着锚点走」是调用方的坐标约定，不是气泡的固有行为。
           波纹同理**不进这里**：它的裁剪外扩量由箭头尺寸推出，而箭头尺寸是气泡自己的 prop
           （此前外面抄了一份 `barreWaveClip`，箭头一改就得同步两处）。 -->
      <BaseAnchorBubble
        :class="[
          item.barre.isMarked
            ? 'border-primary-solid bg-primary-solid text-fg-on-solid shadow-[0_1px_4px_rgba(var(--color-primary-rgb),0.28)] hover:shadow-[0_1px_7px_rgba(var(--color-primary-rgb),0.5)]'
            : 'border-tint-primary-60 bg-surface-panel text-primary shadow-md hover:bg-tint-primary-92',
        ]"
        :visible="item.visible"
        @after-leave="handleBubbleAfterLeave()"
        @click="handleBarreBubbleClick(item.barre)"
        @pointerenter.stop="handleBubblePointerEnter()"
        @pointerleave="handleBubblePointerLeave()"
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
        <BaseIcon :name="item.barre.isMarked ? 'check' : 'plus'" icon-size="md" icon-stroke="bold" />
        <span>{{ item.barre.isMarked ? '取消标记' : '标记横按' }}</span>
      </BaseAnchorBubble>
    </div>

    <!-- 品数撑开动画容器：保留 overflow-y-clip 类名兼容单测，内联 overflow: visible 杜绝左右音符被截断。
         骨架位移补偿（零品加粗 ↔ 偏移切换）也落在这里 —— 品号层与 svg 都是它的子节点，
         两者一起挪才与品线保持对齐（过渡规则见样式块的 .fretboard-board-frame） -->
    <div
      :style="[{ height: `${boardBoxHeight}px`, overflow: 'visible' }, boardShiftStyle]"
      class="fretboard-board-frame relative w-full overflow-y-clip"
      ref="boardFrameEl"
    >
      <!-- 左侧品号：坐标与字号仍由 geometry 给出（与 Canvas 同源）。改品位偏移时**整列一起滑动一行**
           （窗口在整数序列上滑动：滑出可见带的那一个淡出、滑进来的那一个淡入），而不是每个品号原地翻字。
           实现是一条按**绝对品号**排布的数字带，整带按 −fretOffset × 品距 平移（见 fretNumberStripStyle）；
           「在不在可见带内」决定各自的不透明度，平移与淡入淡出同长同曲线，故「边滑边淡」是一次动作。
           刻意不借通用滚动文本组件：那是「同一位置换字」的观感，而这里要的是**位置在动**（数字跨行位移）。
           本层刻意把 aria-live 显式关掉：整层是 aria-hidden 的装饰层，
           组件默认的 polite 播报在此无处安放（口径同 BaseNumberInput）。
           **可视窗口钳在指板高度范围内**（overflow-y-clip，本层是 inset-0，盒高即 boardBoxHeight）：
           数字带两端各多渲染一个，滑出 / 滑入的那两个本来会落到指板盒之外（品数撑开时新出现的下端品号
           还会先于盒高出现在盒外），钳掉才只在指板范围内可见。用 overflow-y-clip 而非 hidden ——
           横向必须保持 visible，多位数（如 24）从锚点向左展开，横向裁切会切掉它的首位。 -->
      <div aria-hidden="true" class="pointer-events-none absolute inset-0 z-inner overflow-y-clip">
        <div :style="fretNumberStripStyle" class="absolute inset-0 transition-transform duration-slow ease-sidebar">
          <span
            v-for="n in fretNumberValues"
            :class="showsFretNumber(n - fretOffset, fretCount) ? 'opacity-100' : 'opacity-0'"
            :key="n"
            :style="getFretNumberStyleOfValue(n)"
            class="absolute -translate-x-full -translate-y-1/2 font-[Helvetica_Neue,Arial,sans-serif] leading-none font-extrabold text-(--fb-label) transition-opacity duration-slow ease-sidebar select-none"
          >
            {{ n }}
          </span>
        </div>
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
          <clipPath :id="gridClipId">
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
        <g :clip-path="`url(#${gridClipId})`">
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
            :x2="stringXPositions.at(-1) ?? 0"
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

        <!-- 3. 横按梁（推导横按与已标记横按 + 退场 ghost）：绘制在音符下方作为底衬，
             淡蓝色表示已标记，更淡的蓝色表示推导未标记。每条梁的几何与动画起点 / 终点都由
             renderedBarres 一次算好（见「横按梁全生命周期动画」），本处只负责画出来 ——
             模板里没有任何动画分支，入场 / 形变 / 退场全由 v-barre-beam 按计划播放。
             ghost 不参与交互、无热区、不进气泡 -->
        <g v-if="renderedBarres.length" class="fretboard-barre-group">
          <g
            v-for="item in renderedBarres"
            :class="item.leaving ? 'pointer-events-none' : 'pointer-events-auto transition-all duration-fast'"
            :key="item.key"
            @mouseenter="handleBarreMouseEnter(item.barre)"
            @mouseleave="handleBarreMouseLeave()"
          >
            <!-- 整品高度感应热区：鼠标悬停在横按区域内任何位置均浮现气泡（ghost 无热区）。
                 只跟目标几何、不参与几何插值：热区是全透明的，差半拍看不出来，
                 而让它跟着插值等于把同一段动画播两遍 -->
            <rect
              v-if="!item.leaving"
              :height="geometry.fretHeight"
              :width="item.to.width"
              :x="item.to.x"
              :y="fretLineY(item.barre.fret - 1)"
              fill="transparent"
            />
            <!-- 视觉横按梁底衬：体量（位置 / 跨度 / 厚度 / 圆角半径）全取自几何，描边只是一圈压在梁缘上的线。
                 几何本身是动画的终点，起点与播放时机由 v-barre-beam 决定 -->
            <rect
              v-barre-beam="item"
              :fill="getBarreFill(item.barre.isMarked)"
              :height="geometry.barreThickness"
              :rx="geometry.barreThickness / 2"
              :stroke="getBarreStroke(item.barre.isMarked)"
              :stroke-dasharray="item.barre.isMarked ? undefined : '6 4'"
              :stroke-width="barreStrokeWidth"
              :width="item.to.width"
              :x="item.to.x"
              :y="item.to.y"
              class="fretboard-barre-beam barre-transition duration-fast"
            />
          </g>
        </g>

        <!-- 4. 空品位预览环（悬停 / 键盘焦点落点反馈）：指针悬停或方向键把焦点移到「该弦当前无音符」的品位格时，
             用与音符外圈高亮环等大的描边环画出落点；落在音符所在格时由 FretboardNote 自身的高亮环接手，此处不重复绘制；
             空弦位（品位 0）同理不例外：该弦为空弦 / 静音时圆点接手，已按品时圆点滑到所按品位、这一位空着，由本环兜底。
             层级：压在横按梁之上、音符之下，与音符自身「外环在内点下方」的层叠关系一致。
             环的半径与线宽都取几何的同一项，故与音符高亮环逐像素等大 -->
        <circle
          v-if="showEmptyHoverRing"
          :cx="stringXPositions[hoverPoint!.stringIndex] ?? 0"
          :cy="noteCenterY(hoverPoint!.fretIndex)"
          :fill="hoverFillColor"
          :r="geometry.noteOutlineRadius"
          :stroke-width="geometry.noteOutlineWidth"
          stroke="var(--color-primary)"
        />

        <circle
          v-if="showEmptyFocusRing"
          :cx="stringXPositions[focusPoint!.stringIndex] ?? 0"
          :cy="noteCenterY(focusPoint!.fretIndex)"
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
import { computed, nextTick, onBeforeUnmount, ref, useId, useTemplateRef, watch } from 'vue';

import BaseAnchorBubble from '@/platform/ui/bubble/BaseAnchorBubble.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import { computeStringLabelAccidental, formatStringLabel } from '@/domains/chord/theory/theory';
import { useBarreBubble } from '@/domains/fretboard/composables/useBarreBubble';
import { isZeroFretWindow, showsFretNumber } from '@/domains/fretboard/model/fretGeometry';
import { INTERACTIVE_GEOMETRY, interactiveGeometryFor } from '@/domains/fretboard/model/interactiveGeometry';
import { canHover } from '@/platform/composables/useCanHover';
import { cloneGuitarStrings, range } from '@/platform/utils/common';
import { prefersReducedMotion } from '@/platform/utils/motion';

import FretboardNote from './FretboardNote.vue';
import {
  computeBarreExits,
  computeDisplayBarres,
  computeGhostBeamPlans,
  computeLiveBeamPlans,
  getBarreFill as getBarreFillOf,
  getBarreStroke as getBarreStrokeOf,
  getStringNoteY as getStringNoteYOf,
  sameBarreGeom,
} from './FretboardSvg.logic';

import type { BarreBeamGeom, BarreBeamPlan, DisplayBarre, LeaveToward, LeavingBarre } from './FretboardSvg.logic';
import type { BarreEntity, GuitarStringEntity, GuitarStringsModel } from '@/domains/fretboard/types';
import type { CSSProperties, Directive } from 'vue';

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
 * 品丝裁切矩形的 `clipPath` id：SVG 的 id 是**文档级**命名空间，同页多个实例若共用同一个字面量 id，
 * `url(#...)` 会解析到文档中第一个匹配项 —— 两图几何不同时，后一个会被前一个的裁切矩形错裁
 * （当前各实例几何恒等故未显形）。故按组件实例取唯一 id。
 */
const gridClipId = useId();

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
 * 相邻两条品线的纵向间距（px）：整列平移一行就是它。
 * 从几何现推而不引常量 —— 两张图（零品 / 偏移）行距相同，但都由 geometry 说了算。
 */
const fretRowHeight = computed(() => fretLineY(1) - fretLineY(0));

/**
 * 品号列渲染的**绝对品号**区间：可见带（行 1..fretCount−1）两侧各多一个。
 *
 * 多出来的这两个正是「正滑出 / 正滑入」的那两个 —— 它们靠不透明度归零、不靠卸载，
 * 否则过渡一开始就消失，看不出是滑出去的。
 */
const fretNumberValues = computed(() => range(fretOffset, fretOffset + fretCount + 1));

/**
 * 整条数字带的位移：把「绝对品号 n」送到行 n − fretOffset 上（行距恒为 fretRowHeight）。
 * 过渡（`transition-transform duration-slow ease-sidebar`）走模板上的工具类、不在这里内联：
 * 缓动的 CSS 变量名只有 Tailwind 主题知道，内联写错时整条 transition 会静默失效（滑动变瞬移）。
 *
 * ⚠️ 快速改品位偏移（如瞬间 0 → 7）时，数字会**滞后于目标位置**，跨的档位越多偏得越远。
 * 这不是错位、也**与过渡时长无关**：这条数字带按**绝对品号**排布，1..7 在 DOM 上就是实打实的 7 行距离，
 * 跨 7 行的改动必然要走过那 7 行 —— 位移距离是**布局量**，改时长只改「走多快」，不改「要走多远」。
 * 故**不要**为此加「大跨度就跳过过渡」之类的特例，也不要试图调时长把它抹掉；
 * 真按绝对品号排布就得认下这段距离（这也正是它比「每个品号原地换字」更贴近真实滚动的地方）。
 */
const fretNumberStripStyle = computed<CSSProperties>(() => ({
  transform: `translateY(${-fretOffset * fretRowHeight.value}px)`,
}));

/**
 * 绝对品号 `value` 的落位与字号：按**绝对**品线给 y（不掺当前偏移，偏移由整条带的平移承担），
 * 横向位置与字号同 Canvas —— 那边是 fillText 直接落笔，没有位移可言，
 * 故「整列滑动」是 SVG 侧独有的观感（见模板内品号层）。
 */
const getFretNumberStyleOfValue = (value: number): CSSProperties => {
  const g = geometry.value;
  return {
    top: `${g.fretLineY(value)}px`,
    left: `${(stringXPositions[0] ?? 0) - g.fretNumberXOffset}px`,
    fontSize: `${g.capoTextFontSize}px`,
  };
};

/**
 * 零品加粗枕条：矩形四边全由几何给出（横向左右各外扩半线宽、纵向落在骨架上），
 * 宽度与左沿走属性、高度与上沿走 style —— 只有 style 绑定才触发 CSS transition
 * （plain SVG attribute 不触发过渡）。
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

/**
 * 需要音符**位移过渡**的琴弦索引集合。两个窗口会开它：品位变更的沿弦滑行、零品加粗 ↔ 偏移切换的
 * 骨架位移（见 settleBoardShift）。其余时候一律 `transition: none` ——
 * 避免浏览器缩放 / 容器 resize 时变换矩阵亚像素重算误触发过渡，导致音符偏离琴弦抽动。
 */
const movingStringIndices = ref<Set<number>>(new Set());
/** 滑行过渡的解锁延时（ms）：略大于 $duration-base，保证滑行到位后才解除过渡锁定 */
const MOVING_UNLOCK_DELAY_MS = 250;
let movingTimer: ReturnType<typeof setTimeout> | null = null;
/** 在途的骨架位移「落定帧」（见 settleBoardShift）：卸载时取消，回调不写已销毁组件的 ref */
let settleFrame = 0;

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
  if (settleFrame) cancelAnimationFrame(settleFrame);
});

/**
 * 零品加粗 ↔ 偏移两档的**骨架顶差**（px）：切换时整块内容会瞬移这么多。
 *
 * 由两张图各自的 `gridTop` 现推。它**不是**「一个线宽」：`gridTop = top + (boldNut ? nutHeight : 0)
 * + gridTopShift`，而 `gridTopShift` 是 `±线宽/2` —— 加粗档多出整条枕条高、又反向垫了半线宽，
 * 两者相消后差值实际是 **`lineWidth − nutHeight`**（≈19px）。此前这里写「差值恰为一个线宽」，
 * 照那句去调补偿量会引入真偏差（代码本身是对的）。
 */
const GRID_TOP_SHIFT_PX = interactiveGeometryFor(false).gridTop - interactiveGeometryFor(true).gridTop;

/** 骨架位移补偿量（px）：切换那一帧垫上**反向**位移、下一帧放开过渡归零（FLIP） */
const boardShift = ref(0);
/** 是否处于「垫位移」那一帧：那一帧必须禁过渡，否则补偿值本身会被动画到（先抖一下再滑回去） */
const boardShiftInstant = ref(false);
/** 骨架容器（垫位移的落点）：只用来在放开过渡前强制一次同步重排，见下面的 watcher */
const boardFrameEl = useTemplateRef<HTMLElement>('boardFrameEl');

/**
 * 放开过渡并把补偿归零：**必须分帧**（挂下一帧）—— 同一帧里改回 0 会被合并成一次样式计算，
 * 「旧位置」这个起点就不存在了。
 *
 * 同时解锁音符的位移过渡（与品位滑行共用同一个窗口）：空弦标记位的**反向抵消**（见 noteCenterY）
 * 必须与容器**同步补间**才能逐帧相消 —— 容器还在动、抵消却瞬间归零，空弦音符就会跟着容器漂，
 * 那正是「空弦音符抽动」。两边同长同曲线时，容器补间的 `+Δ·(1−e(t))` 与抵消的 `−Δ·(1−e(t))`
 * 恒等相消，与缓动函数是什么无关。
 */
const settleBoardShift = () => {
  boardShiftInstant.value = false;
  boardShift.value = 0;
  movingStringIndices.value = new Set(range(0, strings.length));
  if (movingTimer) clearTimeout(movingTimer);
  movingTimer = setTimeout(() => {
    movingStringIndices.value = new Set();
    movingTimer = null;
  }, MOVING_UNLOCK_DELAY_MS);
};

/**
 * 两档几何的 `gridTop` 差是**烘进坐标**的（SVG 的 y 属性、品号层的 top），而坐标不参与过渡 ——
 * 于是切换时整块内容瞬移一个线宽。补偿只能走「反向垫位移再补间」这条路（FLIP）：
 * 切换那一帧把整块按旧位置钉住（禁过渡），下一帧放开过渡归零，看到的就是从旧位置平滑滑到新位置。
 *
 * 刻意**不**改几何本身把位移从坐标里挪出去：Canvas 与导出共用同一份几何，挪出去会连带改变那边的落笔位置。
 */
watch(
  () => isZeroFretWindow(fretOffset),
  (isZero, wasZero) => {
    // 首次求值不做补偿（wasZero 为 undefined）：挂载时就该落在正确位置
    if (wasZero === undefined || isZero === wasZero) return;
    boardShiftInstant.value = true;
    // 切到零品档时骨架顶上移一个线宽 → 先垫 +线宽把它按回旧位置；反向同理
    boardShift.value = isZero ? GRID_TOP_SHIFT_PX : -GRID_TOP_SHIFT_PX;
    if (settleFrame) cancelAnimationFrame(settleFrame);
    void nextTick(() => {
      settleFrame = requestAnimationFrame(() => {
        settleFrame = 0;
        // 读一次布局属性强制**同步重排**，把垫位移钉成「前一帧的样式」——
        // rAF 回调早于本帧的样式重算，不强制的话「垫上」与「归零」会被合并进同一次计算，
        // 浏览器只看见最终值，过渡没有起点可插值：补偿形同虚设，跳变原样还在。
        void boardFrameEl.value?.offsetWidth;
        settleBoardShift();
      });
    });
  }
);

/** 骨架位移样式：位移由内联给，过渡由 scoped 的 .fretboard-board-frame 补间（见样式块） */
const boardShiftStyle = computed<CSSProperties>(() => ({
  transform: `translateY(${boardShift.value}px)`,
  // 只在垫位移那一帧内联禁过渡（内联优先于类规则）；其余时候不设，交给类上的过渡
  transitionProperty: boardShiftInstant.value ? 'none' : undefined,
}));

/**
 * 音符中心 Y（含骨架位移补偿的反向抵消）。
 *
 * 空弦标记位（0 品 / 静音）的 y 取 `geometry.markerCenterY`，它**跨两档几何恒定**
 * （该位置不含弦枕，见 FretboardSvg.logic 的 getStringNoteY）；而品数撑开容器上的骨架位移补偿是
 * **整块**给的 —— 不减掉这一份，切换零品加粗档时空弦音符就会被容器推着走，看着像离开标记位抽动。
 *
 * ⚠️ 这一份抵消必须与容器**同步补间**（两边同长同曲线），故它只在「音符位移过渡窗口」内生效
 * （见 settleBoardShift）：抵消若是阶跃的，第 2 帧就归零、容器却还在动画中途，音符照样跟着漂 ——
 * 抽动只是从第 1 帧挪到第 2 帧。
 * 1 品及以上取 `fretCenterY`，那本身随网格顶移动、与容器补偿正好抵消，故不减。
 */
const noteCenterY = (fret: number): number => getStringNoteY(fret) - (fret <= 0 ? boardShift.value : 0);

/** 位移层定位：音符坐标由 transform 驱动（弦横向恒定、品位纵向平滑往返） */
const getStringNoteStyle = (sIdx: number, fret: number): CSSProperties => ({
  transform: `translate(${stringXPositions[sIdx] ?? 0}px, ${noteCenterY(fret)}px)`,
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
  Boolean(hoverPoint?.stringIndex === sIdx && hoverPoint.fretIndex === Math.max(0, fret));

/** 该按弦点是否处于键盘焦点位 */
const isNoteFocused = (sIdx: number, fret: number) =>
  Boolean(focusPoint?.stringIndex === sIdx && focusPoint.fretIndex === Math.max(0, fret));

// ==================== 横按梁几何与交互 ====================

/** 展示用横按集合（推导候选 + 已标记合并，纯函数见 FretboardSvg.logic.ts） */
const displayBarres = computed<DisplayBarre[]>(() => computeDisplayBarres(strings, barres, fretCount));

// ==================== 横按梁全生命周期动画：一份计划 + 一个播放器 ====================
//
// 入场 / 形变 / 退场统一成同一件事：把梁的 x / y / width 从「一个几何」插值到「另一个几何」。
//
// **为什么几何不用 CSS transition 播**：x / y / width 是 SVG 几何属性。给它们声明 transition 后，
// 值一变会被浏览器「创建即取消」（实测同一毫秒内 transitionrun → transitionstart →
// transitioncancel），形态变化全部退化为瞬变 —— 这正是「只有入场动画、其余都是生硬瞬变」的成因；
// 也是「左边那条横按闪一下」的成因（旧实现先把上一帧整梁几何写成内联值再清空、等 transition 接手，
// transition 没接住，那一帧就停在整梁宽度上）。WAAPI 不受这条规则约束（实测逐帧平滑）。
// `fill` / `stroke` 是普通属性，仍交给 CSS transition（见 .barre-transition）。
//
// **结构**：起点 / 终点几何由计划一次算好（「一份计划」，生成本体见 FretboardSvg.logic.ts 的
// computeLiveBeamPlans / computeGhostBeamPlans），模板只读结果，v-barre-beam 只负责把计划播出来
// （「一个播放器」）—— 模板里不再有任何动画分支。本节只保留响应式接线：快照落盘的 watch、
// ghost 队列与两条计划 computed 的取数。

/** 动画档位：与 --duration-base / --bezier-standard 对齐（WAAPI 读不到 CSS 变量，此处写成常量） */
const BEAM_ANIM_MS = 180;
const BEAM_ANIM_EASING = 'cubic-bezier(0.25, 0.1, 0.25, 1)';

/**
 * 上一帧的展示横按 / 按弦（post flush 落盘）：退场判定与入场锚点判定用。
 *
 * 这两个快照**必须是普通变量、不能是 ref**：计划 computed 在渲染期读它们，做成 ref 就等于让
 * 渲染订阅了它们 —— post flush 落盘时立刻触发**第二次渲染**，而那时快照已经包含刚出现的那条横按，
 * 于是「延续段」被认成它自己（起点几何 = 终点几何，动画整段消失）。
 *
 * 按弦必须**克隆**而不是存引用：写入端 `useChordDraftEditing.handleStringsChange` 是原地改写
 * （`draftChord.strings[i] = {...}`），数组与元素身份都不变 —— 存引用的话「上一帧按弦」会跟着
 * 变成「本帧按弦」，入场锚点（两端已有音符 → 中点 / 仅一端 → 该端）整段失效。
 */
let prevDisplayBarres: DisplayBarre[] = [];
let prevStrings: GuitarStringsModel = cloneGuitarStrings(strings);

watch(
  [displayBarres, () => strings],
  ([list, str]) => {
    // 退场判定本体（真消失 / 被吞并的分辨与收缩朝向）见 FretboardSvg.logic.ts 的 computeBarreExits
    for (const { barre, toward } of computeBarreExits(prevDisplayBarres, list)) pushLeavingBarre(barre, toward);

    prevDisplayBarres = list;
    prevStrings = cloneGuitarStrings(str);
  },
  // immediate：挂载即落盘一次初始快照。不落盘的话**组件挂载后的第一次变化**会拿到空快照 ——
  // 那一次里延续段认不出来（生长 / 收缩被当成新横按、重播入场动画）、消失的横按也收不到 ghost。
  { flush: 'post', immediate: true }
);

// ---------- 退场 ghost：消失 / 被吞并的横按留在列表里播完收缩淡出再驱逐 ----------

/** 已消失、正在播退场动画的横按（ghost：只渲染视觉梁，不参与交互与气泡），类型见 FretboardSvg.logic.ts */
const leavingBarres = ref<LeavingBarre[]>([]);
let leavingSeq = 0;

const pushLeavingBarre = (barre: DisplayBarre, toward?: LeaveToward) => {
  leavingBarres.value = [...leavingBarres.value, { ...barre, leaveId: ++leavingSeq, toward }];
};

/** 驱逐退场 ghost：由播放器在动画结束时回调 —— 时长与驱逐时机因此只有一个来源 */
const dropLeavingBarre = (leaveId: number) => {
  leavingBarres.value = leavingBarres.value.filter(b => b.leaveId !== leaveId);
};

/** 现存横按的动画计划：生成本体见 FretboardSvg.logic.ts 的 computeLiveBeamPlans */
const liveBeamPlans = computed<BarreBeamPlan[]>(() =>
  computeLiveBeamPlans({
    displayBarres: displayBarres.value,
    prevDisplayBarres,
    prevStrings,
    stringXPositions,
    geometry: geometry.value,
  })
);

/** 退场 ghost 的计划：生成本体见 FretboardSvg.logic.ts 的 computeGhostBeamPlans */
const ghostBeamPlans = computed<BarreBeamPlan[]>(() =>
  computeGhostBeamPlans({
    leavingBarres: leavingBarres.value,
    strings,
    stringXPositions,
    geometry: geometry.value,
  })
);

/**
 * 渲染列表 = 退场 ghost + 现存横按。
 *
 * **两半必须是两条 computed**：幽灵的增删只该影响幽灵自己。若合成一条，驱逐幽灵时会整条重算，
 * 而那时「上一帧快照」已经落盘，现存横按的延续判定退化成「认领自己」—— 起点几何 = 终点几何，
 * 正在播的形变被计划判成瞬变并当场取消（合并时那条被复用的梁就是这样跳到终值的）。
 *
 * ghost 排在前面 = 画在下面：被吞并的 ghost 与吞并方重叠时压在它之下，半透明填充不会叠深一档。
 */
const renderedBarres = computed<BarreBeamPlan[]>(() => [...ghostBeamPlans.value, ...liveBeamPlans.value]);

// ---------- 播放器：把计划里的几何插值播出来（WAAPI） ----------

/** 播放器挂在元素上的状态：在跑的动画句柄与已落到的目标几何 */
interface BeamElement extends SVGElement {
  __beamAnim?: Animation;
  __beamTo?: BarreBeamGeom;
}

/** 元素当前显示到的几何：运行中的 WAAPI 动画会体现在计算值上（据此续接被打断的形变） */
const readBeamGeom = (el: SVGElement): BarreBeamGeom => {
  const cs = getComputedStyle(el);
  return {
    x: Number.parseFloat(cs.getPropertyValue('x')) || 0,
    y: Number.parseFloat(cs.getPropertyValue('y')) || 0,
    width: Number.parseFloat(cs.getPropertyValue('width')) || 0,
  };
};

/**
 * 播放一段几何插值（可附带透明度）。起点为 null 时直接落到终点。
 *
 * 退场 ghost 播完由本函数负责驱逐：动画的 `finished` 取代了固定时长定时器，
 * 档位与驱逐时限从此是同一个来源，改一处不会漏另一处。
 */
const playBeamPlan = (el: SVGElement, plan: BarreBeamPlan, from: BarreBeamGeom | null) => {
  const target = el as BeamElement;
  // 目标没变就不重播：指令的 updated 在**每次**重渲染都会跑（例如退场 ghost 被驱逐时），
  // 照着重播会让刚播完的形变从起点再走一遍 —— 观感就是「没点音符，动画自己又播了一次」。
  if (target.__beamTo && sameBarreGeom(target.__beamTo, plan.to)) return;
  target.__beamTo = plan.to;

  target.__beamAnim?.cancel();
  target.__beamAnim = undefined;

  const start = from ?? plan.to;
  const settle = () => {
    if (plan.leaving) dropLeavingBarre(plan.leaveId);
  };

  // reduced-motion：不播动画，退场 ghost 直接隐身（等效于立即移除）。
  // 偏好判定走 motion.ts 的单一来源（该模块明令消费方不得自行 matchMedia：各写一份就是
  // 同一个偏好两条事实源）
  if (sameBarreGeom(start, plan.to) || prefersReducedMotion()) {
    settle();
    return;
  }

  const px = (geom: BarreBeamGeom, opacity: number) => ({
    x: `${geom.x}px`,
    y: `${geom.y}px`,
    width: `${geom.width}px`,
    ...(plan.fade ? { opacity } : {}),
  });

  const anim = el.animate([px(start, 1), px(plan.to, plan.fade ? 0 : 1)], {
    duration: BEAM_ANIM_MS,
    easing: BEAM_ANIM_EASING,
    fill: 'both',
  });
  target.__beamAnim = anim;

  void anim.finished
    .then(() => {
      // 已被更晚的形变接管：什么都不做，交还给那一段动画
      if (target.__beamAnim !== anim) return;
      target.__beamAnim = undefined;
      // 交还给 attribute（与动画终值相同，无跳变）；渐隐则保留终值直到被驱逐
      if (!plan.fade) anim.cancel();
      settle();
    })
    .catch(() => {
      /* 被取消（元素卸载 / 新动画接管）不是异常路径 */
    });
};

/**
 * 横按梁动画播放器：只做一件事 —— 把计划里的起点与终点播出来。
 *
 * 起点永远取计划给的（它就是元素此刻的几何：节点复用那条走 key 精确命中，重建那条走同品位
 * 相交，拆分则再按断点切一段），动画还在跑时改从当前插值位置起步，于是快速连点也不会跳。
 */
const vBarreBeam: Directive<SVGElement, BarreBeamPlan> = {
  mounted(el, binding) {
    playBeamPlan(el, binding.value, binding.value.from);
  },
  updated(el, binding) {
    const plan = binding.value;
    if (plan.leaving) return;
    const running = (el as BeamElement).__beamAnim?.playState === 'running';
    playBeamPlan(el, plan, running ? readBeamGeom(el) : plan.from);
  },
  unmounted(el) {
    const target = el as BeamElement;
    target.__beamAnim?.cancel();
    target.__beamAnim = undefined;
  },
};

/** 横按梁填充色 / 边框色：暗色模式与高对比主题的差异由纯函数处理 */
const getBarreFill = (isMarked: boolean) => getBarreFillOf(isMarked, isDarkMode, isHighContrast);

const getBarreStroke = (isMarked: boolean) => getBarreStrokeOf(isMarked, isDarkMode, isHighContrast);

// ==================== 浮动横按操作气泡交互 ====================

/**
 * 悬停横按梁浮现「标记 / 取消标记」气泡的整套局部状态机（激活键、延迟隐藏计时器、挂载态、
 * 以及离开动画期间不脱位用的缓存）已收进 useBarreBubble；此处只做几何与事件的接线。
 *
 * 无悬停能力的设备（触屏）改为**常驻**：气泡本由指针悬停激活，而触屏上不存在悬停 ——
 * 「标记横按」在手机上等于不可达。判据取 `(hover: hover)` 而不是宽度断点：桌面窗口拖窄时
 * 指针照样能悬停，常驻反而白挡视线。判据走单一来源（platform/composables/useCanHover），
 * 与 TopHeader 的 canHover、vTooltip 的 hasHoverCapability 同源。
 * 常驻档下**每条横按各挂一枚**，模板按 bubbleItems 一维列表渲染。
 */

const {
  bubbleItems,
  isBubbleHovered,
  handleBubbleAfterLeave,
  handleBubblePointerEnter,
  handleBubblePointerLeave,
  handleBarreMouseEnter,
  handleBarreMouseLeave,
  handleBarreBubbleClick,
} = useBarreBubble({
  displayBarres,
  alwaysShow: () => !canHover.value,
  // 三个 prop / 派生值都按取值器传入：props 解构绑定与 `strings.length` 在取值器内读取才保有响应性
  stringXPositions: () => stringXPositions,
  stringCount: () => strings.length,
  fretLineY,
  hoverPoint: () => hoverPoint,
  onToggleBarre: barre => emit('toggle-barre', barre),
});

/**
 * 气泡两态外观所依赖的「是否已标记」，直接读**条目自带的横按**（`item.barre.isMarked`）。
 *
 * 此前这里有一层 `isBubbleMarked` computed：那时模板只渲染一枚气泡、横按来自
 * `displayBubbleBarre: DisplayBarre | null`（离开动画期间靠缓存兜底），而模板里的内联表达式
 * 拿不到 `v-if` / `:visible` 的收窄，vue-tsc 一律判「可能为 null」。改为按条目渲染后，
 * `item.barre` 本身非空，那层收窄就不需要了。
 */

// ==================== 空品位预览环（悬停 / 键盘焦点落点） ====================

/** 空品位预览环填充色：与 FretboardNote 的高亮环同源 token，明暗主题随 tokens 切换 */
const hoverFillColor = computed(() => 'var(--fb-hover)');

/** 该弦的音符是否正落在给定品位（静音态归位到空弦位 0 品，与 isNoteFocused 的判定口径保持一致） */
const hasNoteAt = (sIdx: number, fretIndex: number) => Math.max(0, strings[sIdx]?.fret ?? 0) === fretIndex;

/**
 * 空品位悬停预览环：
 * 指针悬停在横按气泡上时坚决不绘制——气泡浮于指板上方，此时 hover 坐标会滞留在原格，环会误留在原地
 *
 * 空弦位（品位 0）不排除：该位并非恒有 FretboardNote 兜底——某弦已按品时它的圆点滑到了所按品位，
 * 空弦位本身就是空的，此时由本环承担落点反馈（有无圆点一律交给 hasNoteAt 判）。
 */
const showEmptyHoverRing = computed(() => {
  if (isBubbleHovered.value) return false;
  const hp = hoverPoint;
  if (!hp || hp.fretIndex < 0 || hp.fretIndex > fretCount) return false;
  return !hasNoteAt(hp.stringIndex, hp.fretIndex);
});

/**
 * 空品位键盘焦点预览环：
 * 与悬停点重合时让位给悬停环，避免两枚半透明填充环叠画导致该格填充色明显深于其它格
 *
 * 空弦位（品位 0）不排除，理由同 showEmptyHoverRing：Tab 进指板与 PageUp 都把焦点落在这里，
 * 弦上有按点时若不画环，焦点就停在一个画面上不存在的位置上，看不出焦点在哪。
 */
const showEmptyFocusRing = computed(() => {
  const fp = focusPoint;
  if (!fp || fp.fretIndex < 0 || fp.fretIndex > fretCount) return false;
  if (hoverPoint?.stringIndex === fp.stringIndex && hoverPoint.fretIndex === fp.fretIndex) return false;

  return !hasNoteAt(fp.stringIndex, fp.fretIndex);
});
</script>

<style scoped lang="scss">
@use '@/assets/token-vars' as *;

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

/* 横按梁颜色过渡：只有颜色留在这里 —— 位置与尺寸（x / y / width）是 SVG 几何属性，
   给它们声明 transition 会被浏览器「创建即取消」（见组件内「横按梁全生命周期动画」的说明），
   几何一律由 v-barre-beam 走 WAAPI 播。 */
.barre-transition {
  transition:
    fill $duration-base $bezier-standard,
    stroke $duration-base $bezier-standard;
}

/* 品数撑开容器的两条过渡：高度（品数增减，慢档）与骨架位移（零品加粗 ↔ 偏移切换的 FLIP 补偿，基础档）。
   收在一条声明里、而不是「Tailwind 类管高度 + scoped 规则管位移」：scoped 规则未进 @layer，
   会整体盖掉 @layer utilities 里的 transition-property，分两处写时后写的必然让另一条静默失效。
   位移与弦枕条同长同曲线 —— 两者由同一次切换触发，一个在长/收、一个在挪位，节奏不一致会看出是两件事。 */
.fretboard-board-frame {
  transition:
    height $duration-slow $bezier-sidebar,
    transform $duration-base $bezier-sidebar;
}

/* 零品加粗上琴枕：height 单向插值——顶边锚在「指板顶那条线」上、跨窗口恒定，故只有底缘在动：
   0 → 弦枕高是长满，反向是收没，天然不越界，无需 clipPath。触发路径是模板 nutBarStyle 上的
   height 变化（矩形常驻，非零品窗口不卸载）。y 不再列入：锚点恒定后它永不变化，列着只是空转。 */
.wide-nut-bar {
  transition: height $duration-base $bezier-sidebar;
  will-change: height;
}

/* reduced-motion：横按梁的几何动画由 v-barre-beam 自行判定并跳过（不播即落到终点，
   退场 ghost 当场驱逐），此处只需关掉剩下的颜色过渡 */
@media (prefers-reduced-motion: reduce) {
  .string-note-move,
  .barre-transition,
  .wide-nut-bar {
    transition: none;
  }
}
</style>
