<template>
  <BaseScrollArea
    :scrollbar="lineBubbleScrollbar"
    @scroll.passive="handleScroll()"
    close-popovers
    axis="both"
    class="interactive-score-zone relative min-w-0 flex-1 [touch-action:pan-x_pan-y] py-6 pr-0 pl-xl max-md:pt-sm max-md:pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] max-md:pl-sm"
    ref="scoreZoneAreaRef"
  >
    <div class="contents">
      <Feedback
        v-if="!scoreEditor.activeSong?.lyrics.trim()"
        description="请先在“编辑歌词”模式下输入文本内容"
        icon="file-text"
        size="lg"
      />
      <!-- 排列区：**一行一张 canvas**（见 ScoreLineCanvas）。
           行内不再有任何槽位 DOM —— 字符、指板图卡、两枚「+」、行末删除钮、以及全部状态高亮
           （行悬停 / 槽悬停 / 面板目标 / 拖拽落点 / 拖拽源 / 长按蓄势）都画在行画布上，
           交互按同一份排版表做几何命中（见 hitAt）。故本容器上只有三件事：指针事件委托、
           空档占位（撑高元素）、以及缩放手势层。

           键盘可达性**已随 canvas 化移除**（用户明确要求）：画布里没有可聚焦的槽位元素，
           行内不再有 Tab 序列，也不再监听 Enter / Delete —— 槽位的点击与拖拽仍照旧可用。

           `--score-font-scale` 这条 CSS 变量已不再由本容器下发：canvas 绘制消费不了 `var()`，
           字号系数（用户偏好 × 窄屏系数）改由宿主折算成 px 交给排版与画笔（见 scoreFontScale）。
           留着本注释是为了说明「字号只有一个来源」这条不变量没有变，只是它的出口从 CSS 换成了 JS。 -->
      <div
        v-else
        :style="viewZoomStyle"
        @click="handlePointerClick($event)"
        @pointerdown="handlePointerDown($event)"
        @pointerleave="handlePointerLeave()"
        @pointermove="handlePointerMove($event)"
        class="flex w-full max-w-[900px] flex-col gap-xs max-md:gap-3xs"
        ref="zoomLayerRef"
      >
        <ScoreLineCanvas
          v-for="lineData in visibleLines"
          v-memo="[
            lineData.lineId,
            lineData.lineIdx,
            lineData.chars,
            lineData.startChords,
            lineData.endChords,
            // 行级和弦绑定签名（见 lineChordSignatures）：本行任一槽位绑定变化 ⇒ 签名变 ⇒ 该行
            // 重排版重绘；别的行变更时本行签名不变，继续命中缓存
            lineChordSignatures.get(lineData.lineId),
            // 排版口径（字号 / 卡倍率 / 容器宽 / 钮尺寸 / 显示开关）：一变则所有行都要重排
            layoutEpoch,
            // 绘制口径（`paintOptions`）：与排版口径是两回事 —— 字号与卡倍率两边都吃（故 layoutEpoch
            // 已覆盖），而「符号简写」「显示大横按」只影响绘制、不进排版键。少了这一条，切这两个开关时
            // 本行 v-memo 全部命中、paint prop 还停在旧对象上，画面纹丝不动。
            // 依赖 `paintOptions` 本身（而不是逐个开关）：它就是子组件收到的那个值，「prop 变了 ⇒
            // 本行必须失效」由对象标识天然保证，日后新增绘制开关也不必回来补依赖。
            paintOptions,
            // 下面五条都按行归约（见 lineKeyOf）：只有「本行相关」的那一次状态变化才会让本行失效，
            // 指针在同一行的槽间移动不会波及别的行
            lineHoveredSlotKey(lineData.lineId),
            lineRemoveHoveredKey(lineData.lineId),
            linePickerTargetKey(lineData.lineId),
            lineDropTargetKey(lineData.lineId),
            lineDragSourceKey(lineData.lineId),
            linePressArmingKey(lineData.lineId),
            hoveredLineKey === lineData.lineId,
            hoveredDeleteLineId === lineData.lineId,
            isLineActiveDrop(lineData.lineId),
            isMobile,
            gapMarginOf(lineData.lineIdx),
          ]"
          :key="lineData.lineId"
          :layout="layoutOf(lineData)"
          :line-id="lineData.lineId"
          :paint="paintOptions"
          :state="visualStateOf(lineData)"
          :style="{ marginTop: gapMarginOf(lineData.lineIdx) }"
        />

        <!-- 滚动扩容哨兵：紧随当前已渲染行末尾，用户滚动接近当前底部时静默追加渲染。
             空档存在时不挂（hasGap）：尾部已含真实末尾、视口窗口更是悬在谱面中间，
             哨兵的位置与「前缀的末尾」不再对应，命中它只会把前缀挂到不需要的位置上 -->
        <div
          v-if="!hasGap && renderedLineCount < lyricsLinesWithEdges.length"
          aria-hidden="true"
          class="pointer-events-none h-8 w-full shrink-0"
          ref="sentinelRef"
        />

        <!-- 未挂载那一段的占位撑高：内容总高因此在分片挂载期间恒定 —— 挂进来一行，它就矮一行。
             高度取与空档同一份值（见 linePlaceholderHeight），故挂载前后两笔账逐行对得上。 -->
        <div
          v-if="tailPlaceholderHeight > 0"
          :style="{ height: `${tailPlaceholderHeight}px` }"
          aria-hidden="true"
          class="pointer-events-none w-full shrink-0"
        />
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="isDragging"
        :ref="setGhostEl"
        class="pointer-events-none fixed top-0 left-0 z-top will-change-transform"
      >
        <div
          class="flex -translate-1/2 scale-105 items-center justify-center rounded-md border-[1.5px] border-primary bg-surface-panel px-md py-sm shadow-floating"
        >
          <span class="text-sm leading-none font-extrabold text-primary">
            {{ ghostChordName }}
          </span>
        </div>
      </div>

      <!-- 取消投放区：位置固定（视口底部居中）、不跟手，指针落到它上面松手即取消本次拖拽。
           只在拖拽会话里出现 —— 常驻会平白占着谱面，而「取消」只在拖拽中有意义。
           刻意不吃指针事件（`pointer-events-none`）：命中判定走矩形（见 useLyricsDragDrop 的
           applyCancelZone），若在这里接管指针，它会先被 elementFromPoint 命中，
           反而把内部源的落点解析挡掉。纵向落位是**贴底**的 1.5rem（+ 安全区），落在边缘自动
           滚动的判定带宽（50px）之内 —— 故 useLyricsDragDrop 在指针悬到本区上时会停掉自动滚动。
           两档视觉刻意分开「待命」与「就绪」：待命态半透明，指针真正落到它上面才过渡为实色并轻微放大。 -->
      <Transition name="v-transition-scale">
        <div
          v-if="isDragging"
          class="pointer-events-none fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] left-1/2 z-fab -translate-x-1/2"
        >
          <div
            :class="
              isOverCancelZone
                ? 'scale-105 border-solid border-danger text-danger opacity-100'
                : 'border-dashed border-border-base text-fg-muted opacity-70'
            "
            :ref="setCancelZoneEl"
            class="flex items-center gap-sm rounded-lg border-[1.5px] bg-surface-panel px-lg py-md shadow-floating transition-all duration-fast ease-standard"
          >
            <BaseIcon name="trash-2" />
            <span class="text-xs leading-none font-bold whitespace-nowrap">拖到此处取消</span>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 两枚边缘滚动钮：窄屏贴边收一档（判据取脚本里的 isMobile，与本组件其它窄屏取舍同一处） -->
    <BaseFab
      :bottom="isMobile ? '5rem' : '7rem'"
      :hidden="!scrollTopVisible"
      :right="isMobile ? '1rem' : '2rem'"
      @click="scrollToTop()"
      align="end"
      aria-label="滚动到顶部"
      icon="chevron-up"
      tooltip="滚动到顶部"
    />
    <BaseFab
      :bottom="isMobile ? '2.5rem' : '4rem'"
      :hidden="!scrollBottomVisible"
      :right="isMobile ? '1rem' : '2rem'"
      @click="handleScrollToBottom()"
      align="end"
      aria-label="滚动到底部"
      icon="chevron-down"
      tooltip="滚动到底部"
    />

    <!-- 和弦选择面板（chord 域装配，外壳为 platform/ui 的 BaseFloatingPanel）：贴右侧、非模态，
         面板只作拖动来源，把卡片拖到字符槽即完成绑定；面板由点击槽位开启、
         关闭靠外壳本身的关闭按钮 / Escape 手动完成；
         context-key 传当前乐谱 id：换歌时清空面板的选择记忆（面板不读本域 store，保持与宿主解耦） -->
    <ChordPickerPanel
      v-model:visible="isPickerPanelOpen"
      :is-dragging
      :context-key="scoreEditor.activeSongId"
      :drag-chord-starter="startExternalChordDrag"
      @select="handlePickerSelect($event)"
    />
  </BaseScrollArea>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  useTemplateRef,
  watch,
} from 'vue';

import ChordPickerPanel from '@/domains/chord/components/ChordPickerPanel.vue';
import Feedback from '@/platform/ui/feedback/Feedback.vue';
import BaseFab from '@/platform/ui/floating-bar/BaseFab.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import BaseScrollArea from '@/platform/ui/scroll-area/BaseScrollArea.vue';
import { getChordName } from '@/domains/chord/theory/theory';
import { resolveHoverRow, snapToSlotInRow } from '@/domains/score/editor/composables/lyrics-drag/dropGeometry';
import { useLineChordSignatures } from '@/domains/score/editor/composables/useLineChordSignatures';
import { useLyricsDragDrop } from '@/domains/score/editor/composables/useLyricsDragDrop';
import { useScoreLinesData } from '@/domains/score/editor/composables/useScoreLinesData';
import { useScoreViewportRender } from '@/domains/score/editor/composables/useScoreViewportRender';
import { useViewZoomSettle } from '@/domains/score/editor/composables/useViewZoomSettle';
import { chordCardCanvasSizePx, resolveScoreCardScale } from '@/domains/score/editor/lineCardHeight';
import {
  formatArrangeLineIndex,
  hitSlotKey,
  hitTestArrangeLine,
  layoutArrangeLine,
  measureArrangeLineHeight,
} from '@/domains/score/editor/render/arrangeLineLayout';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { cloneChordMap } from '@/domains/score/model/chordSlots';
import { lineCharChord, lineSlots, parseSlotKey, slotKeyLinePrefix } from '@/domains/score/model/scoreModel';
import { useEdgeScroll } from '@/platform/composables/useEdgeScroll';
import { useResponsive } from '@/platform/composables/useResponsive';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { useUiStore } from '@/platform/store/uiStore';
import { CONTROL_HEIGHT_PRESETS } from '@/platform/ui/controlSizes';
import { useUndoableDeletionNotice } from '@/platform/ui/feedback/useUndoableDeletionNotice';
import { useScrollAreaElement } from '@/platform/ui/scroll-area/scrollAreaHandle';
import { observeResize, rootFontSizePx } from '@/platform/utils/dom';

import ScoreLineCanvas from './ScoreLineCanvas.vue';

import type { Chord } from '@/domains/chord/types';
import type { ArrangeRowGeometry } from '@/domains/score/editor/composables/lyrics-drag/dropGeometry';
import type { ArrangeHit, ArrangeLineLayout } from '@/domains/score/editor/render/arrangeLineLayout';
import type { ArrangeLineVisualState, ArrangePaintOptions } from '@/domains/score/editor/render/arrangeLinePainter';
import type { LineData } from '@/domains/score/preview/services/scoreExportCanvas';
import type { LineId, SlotKey } from '@/domains/score/types';
import type { ComponentSize } from '@/platform/types';
import type { ScrollAreaHandle, ScrollAreaScrollbar } from '@/platform/ui/scroll-area/scrollAreaHandle';

defineOptions({ name: 'ScoreInteractiveArea' });

const scoreEditor = useScoreEditorStore();
const settingsStore = useSettingsStore();
const uiStore = useUiStore();
const notifyUndoableDeletion = useUndoableDeletionNotice();
const { isMobile } = useResponsive();

/**
 * 排列区在窄屏（< md）上的整体缩放：**字与指板一起缩到 0.7**。
 *
 * 手机上一个字符是 0.875rem（22.25px 根字号 ⇒ 19.5px，即本项目的 `text-sm` 档）、一张六弦四品
 * 指板图卡是 101 × 130px（scale 1.4），一行装不下几个字、也装不下几张图 —— 排列和弦要
 * 「一眼看到一行怎么排」，于是整块一起缩，比例才不会失衡（只缩字的话指板反而更显大）。
 * 0.7 是把字符落到 ≈ 13.7px、图卡落到 71 × 91px 的取值；再想微调由用户偏好承担
 *（顶栏偏好里的「字号 / 和弦缩放」，本系数与它相乘）。
 *
 * 两个消费方必须吃同一个系数：字走排版（`arrangeLineLayout` 的 fontScale），指板是画布、尺寸走
 * 同一个字号的乘积（`resolveScoreCardScale`）—— 故这里算一次，两处共用。
 *
 * 这是**叠加在用户设置之上**的视口系数，不写进 store：`arrangeFontScale` 是用户偏好
 *（换设备也该保留），本系数是同一份偏好在窄屏上的呈现，两者相乘。
 */
const NARROW_VIEW_SCALE = 0.7;
const viewScale = computed(() => (isMobile.value ? NARROW_VIEW_SCALE : 1));

/** 排版与绘制的字号系数：用户字号偏好（%）× 窄屏系数 —— 与容器上曾用的 `--score-font-scale` 同口径 */
const scoreFontScale = computed(() => (scoreEditor.effectiveFontScale / 100) * viewScale.value);

/**
 * 行内指板图卡的画布倍率：与 `chordCardCanvasSizePx`（排版算卡宽高用的那个）**同源** ——
 * 两处都走 `resolveScoreCardScale`，故排版出的卡片尺寸与实绘逐像素一致。
 */
const cardScale = computed(() => resolveScoreCardScale(scoreEditor.effectiveFretboardScale, viewScale.value));

/**
 * 行内三枚图标钮（行首「+」/ 行尾「+」/ 行末删除）共用的控件尺寸档。
 *
 * 档位取控件标尺（`CONTROL_HEIGHT_PRESETS`：sm 1.6rem / md 1.9rem / lg 2.3rem），由排版折算成 px ——
 * canvas 里没有工具类，尺寸只能走 JS。桌面取 **md**、窄屏再降一档取 **sm**：原先桌面是 lg 档
 *（2.3rem ≈ 51px），一行里三枚并排显得过大（按用户「行的三个按钮缩小一点」的要求各降一档）。
 * 三枚钮共用同一个值：它们是同一行里并列的三枚，各自读断点迟早会走散。
 */
const actionButtonSize = computed<ComponentSize>(() => (isMobile.value ? 'sm' : 'md'));
const buttonSizePx = computed(
  () => Number.parseFloat(CONTROL_HEIGHT_PRESETS[actionButtonSize.value]) * rootFontSizePx()
);

/**
 * 右侧留白栏宽（`.line-row-gutter` 的 `w-6` / 窄屏 `w-2`）：让内容区不贴着滚动条。
 *
 * 按 Tailwind 的 rem 值折算（`w-6` = 1.5rem、`w-2` = 0.5rem × 根字号）—— canvas 里没有工具类，
 * 尺寸只能走 JS，故这里必须与类上的标度同源（口径见 arrangeLineLayout 文件头的度量说明）。
 */
const gutterWidth = computed(() => (isMobile.value ? 0.5 : 1.5) * rootFontSizePx());

/** 行间间隙（容器上的 `gap-xs` / 窄屏 `gap-3xs`，0.375rem / 0.125rem）：进占位高度账，故与类上的值必须同源 */
const lineGapPx = computed(() => (isMobile.value ? 0.125 : 0.375) * rootFontSizePx());

const scoreZoneAreaRef = useTemplateRef<ScrollAreaHandle>('scoreZoneAreaRef');
/** 谱面滚动容器元素（虚拟化预加载 / 拖拽自动滚动 / 边缘滚动入口 / 滚动位置存档都需要元素本身） */
const scoreZoneRef = useScrollAreaElement(scoreZoneAreaRef);
/** 排版层：行画布都挂在它下面，命中测试与行几何都按它寻址 */
const zoomLayerRef = useTemplateRef<HTMLElement>('zoomLayerRef');

/** 边缘滚动入口：顶部/底部浮动按钮。内容可滚且未贴该边时可见，点击平滑滚至对应边 */
const {
  visible: edgeVisible,
  refresh: refreshEdgeVisibility,
  scrollToTop,
  scrollToBottom,
} = useEdgeScroll(scoreZoneRef, {
  edges: ['top', 'bottom'],
});
const scrollTopVisible = computed(() => edgeVisible.top);
const scrollBottomVisible = computed(() => edgeVisible.bottom);

const hoveredLineKey = ref<string | null>(null);
/** 指针所在的槽（槽级 hover 底色与字形染色）；拖拽中不更新。清除钮与槽本体算同一个槽 */
const hoveredSlotKey = ref<SlotKey | null>(null);
/** 指针压在槽上那枚清除钮上的槽位（悬停态：实心危险底 + 反色图标） */
const hoveredRemoveKey = ref<SlotKey | null>(null);
/** 指针压住行末删除钮的那一行（悬停态同上） */
const hoveredDeleteLineId = ref<string | null>(null);
/** 选器和弦浮动面板开关（非模态：不占布局、不作遮罩，支持拖拽和弦到字符槽） */
const isPickerPanelOpen = ref(false);

const { lyricsLinesWithEdges, chordsLookupMap } = useScoreLinesData();

/**
 * 单个和弦的行内图卡高度（px，容器局部 px）：`useLineChordSignatures` 按它算「行内最高那张卡」，
 * 再喂给占位高度算式。
 *
 * 与排版、与实绘**同源** —— 三者都走 `chordCardCanvasSizePx`（见 lineCardHeight.ts），
 * 故「占位」「排版」「画出来的卡片」是同一个数，改缩放口径只改那一处。
 * 用函数声明（而非箭头常量）：它被上面的 `useLineChordSignatures` 以回调形式引用，
 * 声明式提升让定义顺序不再有意义。
 */
function chordCardHeightForLayout(chord: Chord): number {
  return chordCardCanvasSizePx(chord, {
    scale: cardScale.value,
    trimEmptyEdgeFrets: settingsStore.scoreTrimEmptyEdgeFrets,
  }).height;
}

/** 行级和弦派生量：绑定签名、「本行有没有和弦」、行内最高指板图卡的画布高 */
const { lineChordSignatures, lineCardHeight } = useLineChordSignatures({
  chordsLookupMap,
  getChordMap: () => scoreEditor.activeSong?.chordMap,
  getCardHeightPx: chordCardHeightForLayout,
});

/**
 * 手势缩放（双指捏合 / 触控板捏合 / Ctrl+滚轮）与它的预览 / 提交两段式收口
 * —— 不变量与代价见 useViewZoomSettle 的文件头。
 *
 * `onGestureStart` 里取消拖拽：第一根手指可能已压在某个和弦上起了长按计时（LONG_PRESS_DELAY），
 * 不取消就会在捏合途中起拖、松手时把和弦丢到别处。
 * `onSettleExpand` 是沉降窗口收口之后的那一次补挂（提交会改内容总高，故必须按新几何算）。
 */
const { viewZoomStyle, toContainerPx, toVisualPx, isSettling, cancelViewZoomSettling } = useViewZoomSettle({
  scoreZoneRef,
  onSettleExpand: el => expandAtViewport(el),
  refreshEdgeVisibility,
  onGestureStart: () => cancelDrag(),
});

/**
 * 渐进式视口渲染：哪些行真正挂进 DOM、其余行怎么以占位高度参与布局，以及三条补挂路径
 * —— 分段模型与补挂让路两条不变量见 useScoreViewportRender 的文件头。
 *
 * 行高**不再实测**：canvas 行的高度由排版算式给出（见 lineHeightOf），故离屏行与已挂载行
 * 逐像素一致，内容总高不随分片挂载漂移。
 */
const {
  renderedLineCount,
  visibleLines,
  gapMarginOf,
  hasGap,
  tailPlaceholderHeight,
  handleScroll,
  handleScrollToBottom,
  expandNextBatch,
  expandAtViewport,
  ensureSufficientRenderedLines,
  setupSentinelObserver,
  disposeSentinelObserver,
  cancelPendingExpansion,
  syncSongState,
} = useScoreViewportRender({
  scoreZoneRef,
  lyricsLinesWithEdges,
  lineHeightOf,
  toContainerPx,
  toVisualPx,
  isZoomSettling: isSettling,
  refreshEdgeVisibility,
  scrollToBottom,
  getActiveSongId: () => scoreEditor.activeSongId,
});

/**
 * 行的完整占位高度（含行间间隙）：排版算式 + 间隙。
 *
 * 与实绘同源 —— 行画布的 CSS 高度就是算式里的那一截，间隙由 flex `gap` 提供。
 * 逐行调用（滚动帧里几百行），故只做算术、不做文本度量。
 */
function lineHeightOf(lineId: string): number {
  return (
    measureArrangeLineHeight({
      cardHeightPx: lineCardHeight(lineId),
      fontScale: scoreFontScale.value,
      buttonSize: buttonSizePx.value,
    }) + lineGapPx.value
  );
}

/* ---- 行排版：缓存 + 命中测试 ----
   排版产物（`ArrangeLineLayout`）是**同一份矩形表既用来画、也用来命中**的唯一来源，
   故宿主缓存它、行组件与命中测试共用（见 arrangeLineLayout 的文件头）。 */

/** 排版口径：任一变化都让全部行的缓存失效（见 layoutEpoch） */
const layoutEpoch = computed(
  () =>
    `${scoreFontScale.value}|${cardScale.value}|${settingsStore.scoreTrimEmptyEdgeFrets}|${containerWidth.value}|${buttonSizePx.value}|${gutterWidth.value}`
);

/**
 * 行可用宽（含右侧留白栏）：排版层元素的宽度。
 *
 * 取排版层而不是滚动容器的 clientWidth：排版层就是行的直接父级（`w-full max-w-[900px]`），
 * 它已经吃下了「窄屏留白」「最大宽」这些约束，读它不必再自己重算一遍内边距。
 * 由 ResizeObserver 维护 —— 窗口变化、侧栏开合、缩放手势都不需要另外通知。
 * 观察走 `platform/utils/dom` 的**共享 observer**（与指令 / 其它消费方复用同一个实例；
 * 环境无 ResizeObserver 时它自己静默降级，故这里不必再判）。
 */
const containerWidth = ref(0);
let stopObserveContainerWidth: (() => void) | null = null;

const observeContainerWidth = () => {
  const el = zoomLayerRef.value;
  if (!el) return;
  stopObserveContainerWidth?.();
  stopObserveContainerWidth = observeResize(el, entry => {
    const { width } = entry.contentRect;
    if (width > 0 && Math.abs(width - containerWidth.value) > 0.5) containerWidth.value = width;
  });
  containerWidth.value = el.clientWidth;
};

const layoutCache = new Map<string, { key: string; layout: ArrangeLineLayout }>();

/** 按槽位键实时解析当前绑定的和弦（字符槽与边槽通用；无绑定返回 null） */
const slotChordOf = (slotKey: SlotKey): Chord | null => {
  const song = scoreEditor.activeSong;
  if (!song) return null;
  const parsed = parseSlotKey(slotKey);
  if (!parsed) return null;
  const chordId =
    parsed.type === 'char'
      ? lineCharChord(song.chordMap, parsed.lineId, parsed.index)
      : (lineSlots(song.chordMap, parsed.lineId)[parsed.type][parsed.index] ?? null);
  return chordId ? (chordsLookupMap.value.get(chordId) ?? null) : null;
};

/** 取一行的排版产物（缓存键含行内容、行级和弦签名与排版口径） */
const layoutOf = (line: LineData): ArrangeLineLayout => {
  const key = `${layoutEpoch.value}|${line.lineId}|${line.chars.length}|${line.startChords.length}|${line.endChords.length}|${lineChordSignatures.value.get(line.lineId) ?? ''}`;
  const cached = layoutCache.get(line.lineId);
  if (cached && cached.key === key) return cached.layout;

  const layout = layoutArrangeLine(line, {
    fontScale: scoreFontScale.value,
    cardScale: cardScale.value,
    trimEmptyEdgeFrets: settingsStore.scoreTrimEmptyEdgeFrets,
    containerWidth: containerWidth.value,
    buttonSize: buttonSizePx.value,
    gutterWidth: gutterWidth.value,
    resolveChord: slotChordOf,
  });
  layoutCache.set(line.lineId, { key, layout });
  return layout;
};

/** 已挂载的行画布元素（按 DOM 顺序，即视觉自上而下） */
const rowCanvasElements = (): HTMLElement[] =>
  zoomLayerRef.value ? Array.from(zoomLayerRef.value.querySelectorAll<HTMLElement>('canvas[data-line-index]')) : [];

/**
 * 指针位置 → 命中的行与元件。
 *
 * 逐行比对行画布的矩形（行数 = 当前挂载行，通常几十行），命中后把指针换算成**行局部容器 px**
 * 再查同一份排版表 —— 与绘制逐像素同源，故「点得中」与「看得见」不会分叉。
 * 行矩形是**视觉 px**（容器带 zoom 时被整体缩放），而排版表是容器局部 px，故要按
 * `rect.width / layout.width` 折算（比读 zoom 状态更稳：它同时覆盖了任何其它缩放来源）。
 */
interface LineHit {
  lineId: string;
  layout: ArrangeLineLayout;
  /** 命中的元件（同一份排版表的几何命中结果）；落在行内空白处时为 null */
  hit: ArrangeHit | null;
  /** 行局部坐标（容器局部 px） */
  x: number;
  y: number;
}

const hitAt = (clientX: number, clientY: number): LineHit | null => {
  for (const el of rowCanvasElements()) {
    const rect = el.getBoundingClientRect();
    if (clientY < rect.top || clientY > rect.bottom) continue;
    const lineId = el.dataset['lineIndex'];
    if (!lineId) continue;
    const layout = layoutCache.get(lineId)?.layout;
    if (!layout || rect.width <= 0) continue;
    const ratio = layout.width / rect.width;
    const x = (clientX - rect.left) * ratio;
    const y = (clientY - rect.top) * ratio;
    return { lineId, layout, hit: hitTestArrangeLine(layout, x, y), x, y };
  }
  return null;
};

/** 行几何表（视口坐标）：拖拽落点判定用（宽容行判定 + 精确槽吸附，见 dropGeometry） */
const collectRowGeometries = (): ArrangeRowGeometry[] => {
  const rows: ArrangeRowGeometry[] = [];
  for (const el of rowCanvasElements()) {
    const lineId = el.dataset['lineIndex'];
    if (!lineId) continue;
    const layout = layoutCache.get(lineId)?.layout;
    const rect = el.getBoundingClientRect();
    if (!layout || rect.width <= 0) continue;
    const ratio = rect.width / layout.width;
    rows.push({
      lineId,
      top: rect.top,
      bottom: rect.bottom,
      slotsLeft: rect.left + layout.slotsLeft * ratio,
      slotsRight: rect.left + layout.slotsRight * ratio,
      slots: layout.slots.map(slot => ({
        slotKey: slot.slotKey,
        left: rect.left + slot.rect.x * ratio,
        right: rect.left + (slot.rect.x + slot.rect.w) * ratio,
      })),
    });
  }
  return rows;
};

/* ---- 拖拽 ---- */

/** 长按蓄势中的槽（触摸端起拖前的按压反馈）：由拖拽会话回调写入，绘制时读它 */
const pressArmingKey = ref<SlotKey | null>(null);
/** 拖拽源槽（整体淡化）：由拖拽会话回调写入，绘制时读它 */
const dragSourceKey = ref<SlotKey | null>(null);

/**
 * 拖拽落点解析（几何命中，注入给拖拽会话）。
 *
 * 与旧实现的差别：不再用 `elementFromPoint` 找槽位元素（canvas 行里没有），改走排版表。
 * 唯一保留的 `elementFromPoint` 用途是**浮层探测** —— 面板 / 抽屉盖在谱面上时不该产生落点，
 * 而这件事只有 DOM 层答得出来（判据取 platform/ui 的形状契约，不依赖任何具体业务面板）。
 */
const resolveDropTarget = (clientX: number, clientY: number): { slotKey: string | null; lineId: string | null } => {
  const hoverEl = document.elementFromPoint(clientX, clientY);
  if (hoverEl?.closest('[data-floating-panel], [data-floating-panel-scrim], .drawer-overlay-container'))
    return { slotKey: null, lineId: null };

  const zone = scoreZoneRef.value;
  if (!zone) return { slotKey: null, lineId: null };
  const zoneRect = zone.getBoundingClientRect();
  // 指针在谱面区外（含 24px 容差）不落地
  if (
    clientX < zoneRect.left - 24 ||
    clientX > zoneRect.right + 24 ||
    clientY < zoneRect.top - 24 ||
    clientY > zoneRect.bottom + 24
  )
    return { slotKey: null, lineId: null };

  const hovered = resolveHoverRow(collectRowGeometries(), clientY);
  const slotKey = hovered ? snapToSlotInRow(hovered, clientX) : null;
  return { slotKey, lineId: hovered?.lineId ?? null };
};

const {
  isDragging,
  isSuppressingClick,
  isOverCancelZone,
  activeDropLineId,
  dragOverSlotKey,
  ghostChordName,
  setGhostEl,
  setCancelZoneEl,
  handlePointerDown: beginSlotDragSession,
  startExternalChordDrag,
  cancelDrag,
} = useLyricsDragDrop(
  {
    resolveDropTarget,
    onPressArmingChange: (slotKey, arming) => {
      pressArmingKey.value = arming ? (slotKey as SlotKey) : null;
    },
    onDragSourceChange: slotKey => {
      dragSourceKey.value = slotKey ? (slotKey as SlotKey) : null;
    },
  },
  scoreZoneRef
);

/**
 * 本行是否为当前拖拽落点所在的行。
 *
 * 判据取拖拽会话给的 `activeDropLineId`（**宽容**判定：指针落在该行的垂直范围内即算，行内水平位置
 * 不影响），而不是「落点槽位所属的行」—— 后者在指针划过字符之间的空隙时会瞬断，行首 / 行尾两枚「+」
 * 会跟着一闪一闪。落点槽位（`dragOverSlotKey`）是**精确**判定，用来画那一格上的实线框。
 */
const isLineActiveDrop = (lineId: string): boolean => isDragging.value && activeDropLineId.value === lineId;

/* ---- 视觉状态：按行归约，供 v-memo 精确失效 ---- */

/**
 * 把「全局的某个槽位键」归约到本行：属于本行则原样返回，否则 null（供 v-memo 按行粒度失效）。
 *
 * 入参刻意收 `string | null` 而不是 `SlotKey | null` —— 拖拽系统的落点键（`dragOverSlotKey`）
 * 来自几何命中、跨模块流动，类型上是裸 `string`（不该为了品牌类型反向约束拖拽模块）。
 * 返回类型仍是 `SlotKey | null`：前缀判定成立即证明它就是一个槽位键。
 */
const lineKeyOf = (slotKey: string | null, lineId: string): SlotKey | null =>
  slotKey?.startsWith(slotKeyLinePrefix(lineId)) ? (slotKey as SlotKey) : null;

const lineHoveredSlotKey = (lineId: string): SlotKey | null => lineKeyOf(hoveredSlotKey.value, lineId);
const lineRemoveHoveredKey = (lineId: string): SlotKey | null => lineKeyOf(hoveredRemoveKey.value, lineId);
const linePickerTargetKey = (lineId: string): SlotKey | null => lineKeyOf(pickerTargetSlotKey.value, lineId);
const lineDropTargetKey = (lineId: string): SlotKey | null => lineKeyOf(dragOverSlotKey.value, lineId);
const lineDragSourceKey = (lineId: string): SlotKey | null => lineKeyOf(dragSourceKey.value, lineId);
const linePressArmingKey = (lineId: string): SlotKey | null => lineKeyOf(pressArmingKey.value, lineId);

/** 没有悬停能力的设备（触屏）：三枚图标钮常驻可见 —— 否则「行首行尾可以加和弦」这件事完全不可发现 */
const alwaysShowActionButtons = computed(() => isMobile.value);

const paintOptions = computed<ArrangePaintOptions>(() => ({
  fontScale: scoreFontScale.value,
  cardScale: cardScale.value,
  trimEmptyEdgeFrets: settingsStore.scoreTrimEmptyEdgeFrets,
  showBarre: settingsStore.scoreShowBarre,
  shorthand: settingsStore.scoreChordShorthand,
}));

/** 组装某一行的视觉状态（对象只在宿主重渲染该行时才重建，行组件按引用变化重绘） */
const visualStateOf = (line: LineData): ArrangeLineVisualState => {
  const { lineId } = line;
  // 拖拽中不显示槽级 hover：指针此刻在拖 ghost，槽上的 hover 底色与字形染色只会干扰落点框
  const hoveredSlot = isDragging.value ? null : lineHoveredSlotKey(lineId);
  return {
    hoveredLine: hoveredLineKey.value === lineId,
    hoveredSlotKey: hoveredSlot,
    pickerTargetKey: linePickerTargetKey(lineId),
    dropTargetKey: lineDropTargetKey(lineId),
    dragSourceKey: lineDragSourceKey(lineId),
    pressArmingKey: linePressArmingKey(lineId),
    deleteVisible: hoveredLineKey.value === lineId || alwaysShowActionButtons.value,
    deleteHovered: hoveredDeleteLineId.value === lineId,
    // 清除钮按**槽**归约（不是「本行有没有槽被 hover」）：给成行级布尔的话，指针移到同行任意一格上
    // （含两枚「+」）整行和弦卡片的清除钮会一起冒出来 —— 观感就是「闪一下」。
    // DOM 版里它是槽根上的 `group-hover`，本来就只作用于指针所在的那一格。
    removeVisibleKey: hoveredSlot,
    removeAlwaysVisible: alwaysShowActionButtons.value,
    removeHoveredKey: lineRemoveHoveredKey(lineId),
    addButtonVisible: hoveredLineKey.value === lineId || isLineActiveDrop(lineId) || alwaysShowActionButtons.value,
  };
};

/* ---- 指针交互 ---- */

/**
 * 悬停判定合帧：指针每移动一次都要读一遍行矩形，逐 move 同步执行会把布局读压在热路径上。
 * 只在状态真的变化时写响应式值，避免同一行内移动也触发重绘。
 */
let hoverFrame = 0;
let lastPointer = { x: 0, y: 0 };

const updateHoverAt = (clientX: number, clientY: number) => {
  const found = hitAt(clientX, clientY);
  const hit = found?.hit ?? null;
  const nextLine = found?.lineId ?? null;
  // 清除钮与槽本体算**同一个槽**（见 hitSlotKey）：只认槽本体的话，指针一移到清除钮上就会被判成
  // 「不在任何槽上」，那枚钮当场消失、槽级 hover 也闪断。
  const nextSlot = hitSlotKey(hit);
  const nextRemove = hit?.kind === 'slot-remove' ? hit.slot.slotKey : null;
  const nextDeleteLine = hit?.kind === 'delete-line' ? nextLine : null;
  if (nextLine !== hoveredLineKey.value) hoveredLineKey.value = nextLine;
  if (nextSlot !== hoveredSlotKey.value) hoveredSlotKey.value = nextSlot;
  if (nextRemove !== hoveredRemoveKey.value) hoveredRemoveKey.value = nextRemove;
  if (nextDeleteLine !== hoveredDeleteLineId.value) hoveredDeleteLineId.value = nextDeleteLine;
};

const handlePointerMove = (e: PointerEvent) => {
  // 位置**始终**记下来（含拖拽中）：拖拽期间不做 hover 判定，但会话结束时要按「最后位置」重算一次
  // —— 松手那一刻用户往往没再动指针，没有这一次重算，hover 会停在拖拽前的旧槽上
  lastPointer = { x: e.clientX, y: e.clientY };
  if (isDragging.value) return;
  if (hoverFrame) return;
  hoverFrame = requestAnimationFrame(() => {
    hoverFrame = 0;
    updateHoverAt(lastPointer.x, lastPointer.y);
  });
};

const handlePointerLeave = () => {
  if (hoverFrame) {
    cancelAnimationFrame(hoverFrame);
    hoverFrame = 0;
  }
  hoveredLineKey.value = null;
  hoveredSlotKey.value = null;
  hoveredRemoveKey.value = null;
  hoveredDeleteLineId.value = null;
};

/** 槽位按下：仅当该槽确实绑定了和弦时登记「移动」拖拽会话（空槽没有可拖动的内容） */
const handlePointerDown = (e: PointerEvent) => {
  const found = hitAt(e.clientX, e.clientY);
  if (!found?.hit || found.hit.kind !== 'slot') return;
  const { chord, slotKey } = found.hit.slot;
  if (!chord) return;
  beginSlotDragSession({ event: e, slotKey, chord });
};

/** 槽位点击：打开选器和弦面板；删除钮 / 清除钮就地执行（不走面板） */
const handlePointerClick = (e: MouseEvent) => {
  if (isDragging.value || isSuppressingClick.value) return;
  const found = hitAt(e.clientX, e.clientY);
  if (!found?.hit) return;
  if (found.hit.kind === 'delete-line') {
    deleteLine(found.lineId);
    return;
  }
  if (found.hit.kind === 'slot-remove') {
    handleRemoveSlotChord(found.hit.slot.slotKey);
    return;
  }
  handleOpenPicker(found.hit.slot.slotKey);
};

/* ---- 编辑动作 ---- */

/**
 * 清除某槽位上的和弦（槽上的清除钮与拖拽落地两条入口共用）。
 *
 * 和弦名必须在清除**之前**取：store 一落库，slotChordOf 就查不到了。
 * 槽位本就没有绑定（重复点击等）时早退：既不空推一次撤销栈，也不弹「已清除」的假提示。
 */
const handleRemoveSlotChord = (slotKey: SlotKey) => {
  const chord = slotChordOf(slotKey);
  if (!chord) return;
  const snapshot = { slotKey, chordId: chord.id };
  scoreEditor.removeSlotChord(slotKey);
  notifyUndoableDeletion({
    title: `已清除和弦「${getChordName(chord)}」`,
    restoredTip: `已恢复和弦「${getChordName(chord)}」`,
    undo: () => scoreEditor.restoreDeletedSlot(snapshot),
  });
};

/** 删除歌词行：按 lineId 实时反查索引，避免缓存里陈旧的 lineIdx 删错行 */
const deleteLine = (lineId: string) => {
  const song = scoreEditor.activeSong;
  if (!song) return;
  const lines = song.lyrics.split('\n');
  const lineIdx = song.lineIds.indexOf(lineId as LineId);
  if (lineIdx < 0 || lineIdx >= lines.length) return;
  // 精确快照：文本 / lineId / 该行的槽位表。槽位表取深克隆 —— 删除会原地改写这些容器
  //（shiftCharSlotsForEditedLines 就地增删 char 条目），只留引用的话快照会跟着变。
  const snapshot = {
    lineIdx,
    lineId: lineId as LineId,
    lineText: lines[lineIdx]!,
    slots: cloneChordMap(song.chordMap).get(lineId as LineId),
  };
  lines.splice(lineIdx, 1);
  scoreEditor.updateLyrics(lines.join('\n'));
  notifyUndoableDeletion({
    title: `已删除第 ${lineIdx + 1} 行`,
    restoredTip: `已恢复第 ${lineIdx + 1} 行`,
    undo: () => scoreEditor.restoreDeletedLine(snapshot),
  });
};

// 拖拽中的落地规则提示：neutral message 常驻不自动消失、无转圈（非后台任务），拖拽结束手动移除
let dragHintMessageId: number | null = null;
watch(isDragging, dragging => {
  if (dragging) {
    dragHintMessageId = uiStore.message.neutral('拖到空槽：移动  拖到和弦：替换', {
      closable: false,
      customClass: 'drag-hint-toast',
    });
    // 起拖时清掉槽级 hover 与两处按钮的悬停态：指针接下来在拖 ghost，槽上的 hover 底色、
    // 字形染色与删除钮的悬停态只会干扰落点框。拖拽期间不再更新 hover（见 handlePointerMove 的早退），
    // 故这次清空要一直保持到会话结束。
    hoveredSlotKey.value = null;
    hoveredRemoveKey.value = null;
    hoveredDeleteLineId.value = null;
    return;
  }
  if (dragHintMessageId !== null) {
    uiStore.removeMessage(dragHintMessageId);
    dragHintMessageId = null;
  }
  // 松手后指针可能已经落在别的槽上，而那时不会有新的 pointermove（用户没再动）——
  // 就地按最后位置重算一次，避免 hover 停在拖拽前的旧槽上
  updateHoverAt(lastPointer.x, lastPointer.y);
});

const clearDragHintMessage = () => {
  if (dragHintMessageId !== null) {
    uiStore.removeMessage(dragHintMessageId);
    dragHintMessageId = null;
  }
};

let isAreaActive = true;

onDeactivated(() => {
  isAreaActive = false;
  // 离开本区（切路由 / 切页签被 KeepAlive 缓存）时收起选器和弦面板：
  // 面板与其中的编辑抽屉都 Teleport 到 body，而渲染器对 Teleport 一律按 REORDER 搬移
  //（只挪锚点、不动已被传送的内容），宿主停用时它们不会随组件树一起摘除，
  // 结果就是切到别的页面后浮层仍挂在 body 上继续显示。故此处主动闭合成关闭态。
  isPickerPanelOpen.value = false;
  cancelPendingExpansion();
  cancelViewZoomSettling();
  clearDragHintMessage();
  disposeSentinelObserver();
  const el = scoreZoneRef.value;
  if (el) {
    savedScroll.top = el.scrollTop;
    savedScroll.left = el.scrollLeft;
  }
});

onBeforeUnmount(() => {
  stopObserveContainerWidth?.();
  stopObserveContainerWidth = null;
  if (hoverFrame) cancelAnimationFrame(hoverFrame);
  cancelPendingExpansion();
  cancelViewZoomSettling();
  clearDragHintMessage();
  disposeSentinelObserver();
});

// —— 排列区滚动位置保持 ——
// 打点实证：KeepAlive 缓存本已命中（切回仅触发 onActivated、不重建），但浏览器会在元素 detach 后再
// attach 时把其 scrollTop/scrollLeft 清零。故在 deactivate 时保存偏移，activate 时显式恢复；
// 采用固定 key="interactive-area" 实例复用后，切歌（activeSongId 变化）需主动重置滚动偏移。
const savedScroll = { top: 0, left: 0 };

// 首帧就要有行宽：排版按容器实际宽算（内容宽不足时行被拉伸到容器宽），而 ResizeObserver 的首报
// 落在挂载之后 —— 不先量一次，首帧会按 containerWidth = 0 排一遍、再整体重排一次（可见的一闪）
onMounted(observeContainerWidth);

onActivated(async () => {
  isAreaActive = true;
  observeContainerWidth();
  setupSentinelObserver();
  // 渲染窗口锚在行下标上，切歌即失效（见 syncSongState）：重置之后滚动偏移与视口一并归零
  if (syncSongState()) {
    savedScroll.top = 0;
    savedScroll.left = 0;
    const el = scoreZoneRef.value;
    if (el) {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }
  }
  void ensureSufficientRenderedLines();
  const el = scoreZoneRef.value;
  if (!el || (savedScroll.top === 0 && savedScroll.left === 0)) return;
  await nextTick();
  el.scrollTo({ top: savedScroll.top, left: savedScroll.left, behavior: 'auto' });
});

// 切歌时清空保存的滚动位置，重置渐进渲染行数（含尾部窗口），并将视口滚回顶部（复用了固定 key 的实例）
watch(
  () => scoreEditor.activeSongId,
  () => {
    if (!isAreaActive) return;
    cancelPendingExpansion();
    cancelViewZoomSettling();
    syncSongState();
    // 排版缓存锚在 lineId 上：换歌后旧 id 不会再来，留着只是白占内存
    layoutCache.clear();
    hoveredLineKey.value = null;
    hoveredSlotKey.value = null;
    hoveredRemoveKey.value = null;
    hoveredDeleteLineId.value = null;
    savedScroll.top = 0;
    savedScroll.left = 0;
    const el = scoreZoneRef.value;
    if (el) {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }
    void ensureSufficientRenderedLines();
  }
);

/**
 * 打开面板时点中的目标槽位：面板内点击卡片即把和弦落到这里。
 * 面板仍是拖拽落位的主路径（可拖到任意槽），这里补的是「点一下就填」的直给路径。
 * 置 null 表示面板不是由槽位点击打开的，此时点卡片不落位。
 */
const pickerTargetSlotKey = ref<SlotKey | null>(null);

/** 面板关闭（关闭按钮 / Escape / 离开本区）即清空目标高亮：避免面板已收、字符仍高亮的残留状态 */
watch(isPickerPanelOpen, open => {
  if (!open) pickerTargetSlotKey.value = null;
});

/** 用户点击槽位：打开选器和弦浮动面板并记住本次点中的槽位。
 *  面板已开时再点槽位只把目标切到新槽、不切换开关；关闭走手动（外壳关闭按钮 / Escape）。
 *  拖拽中或点击抑制期忽略，避免拖拽松手误触发 */
const handleOpenPicker = (slotKey: SlotKey) => {
  if (isDragging.value || isSuppressingClick.value) return;
  isPickerPanelOpen.value = true;
  pickerTargetSlotKey.value = slotKey;
};

/**
 * 面板内点击 / 回车选中卡片：把和弦落到当前目标槽位，然后保持面板打开。
 * 目标槽位（高亮的字符）不随填充移动，再点卡片会覆盖它；要换填别的字符需先点对应字符把高亮切过去。
 */
const handlePickerSelect = (chord: Chord) => {
  const slotKey = pickerTargetSlotKey.value;
  if (!slotKey) return;
  scoreEditor.setSlotChord(slotKey, chord);
};

/** 行号展示为两位数字（01、02…）—— 与行内排版共用同一份实现（见 formatArrangeLineIndex） */

/* ---- 纵向滚动气泡：行号读数 ----
   长谱面纵向可达数百行，滚动中「现在在第几行」只能靠行号逐行扫。气泡本体由 vScrollbar 托管
   （随拇指移动、读数逐字符翻页、闲置随滚动条淡出；size 取 lg——行号是谱面的主读数），本组件只
   回答一个问题：当前滚动位置对应第几行。 */

/** 当前滚动位置对应的行号读数（「当前行 / 总行数」）：由**滚动进度**换算，滚动帧里一次 DOM 查询
 *  都不做。谱面行的占位高度已由排版算式给出，内容总高不随分片挂载变化、进度因此稳定 ——
 *  这是换用比例换算的前提。代价是**行高不均时读数只是近似**（精确到行请以行内行号为准）。 */
const resolveLineLabelFromProgress = (progress: number): string => {
  const total = lyricsLinesWithEdges.value.length;
  if (total === 0) return '';
  const ratio = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  return `${formatArrangeLineIndex(Math.round(ratio * (total - 1)))} / ${total}`;
};

/** 排列和弦区滚动条绑定：纵向气泡显示行号读数；横向滚动不触发（bubble 轴锁 y）。
 *  静态对象即可：无响应式依赖，引用恒定，指令的 updated 路径零重建 */
const lineBubbleScrollbar: ScrollAreaScrollbar = {
  bubble: {
    axis: 'y',
    size: 'lg',
    format: ({ progressY }) => resolveLineLabelFromProgress(progressY),
    hideDelay: 1500,
  },
} as const;

defineExpose({ scoreZoneRef, expandNextBatch, handleScrollToBottom });
</script>
