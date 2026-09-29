import { computed, nextTick, useTemplateRef } from 'vue';

import {
  ARRANGE_VIEW_MAX_ZOOM_PERCENT,
  ARRANGE_VIEW_MIN_PINCH_SPAN_PX,
  ARRANGE_VIEW_MIN_ZOOM_PERCENT,
  ARRANGE_VIEW_WHEEL_ZOOM_SENSITIVITY,
} from '@/domains/score/constants';
import { usePinchZoom } from '@/domains/score/editor/composables/usePinchZoom';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';

import type { Ref } from 'vue';

export interface UseViewZoomSettleOptions {
  /** 谱面滚动容器：手势监听的落点，也是缩放锚点回位所需的滚动几何来源 */
  scoreZoneRef: Ref<HTMLElement | null>;
  /**
   * 沉降收口后（写 store + 锚点回位之后）要补的一次挂载。
   *
   * 提交会改内容总高、可能补发 scroll 事件，补挂必须按**新几何**算，故整段排在 nextTick 之后
   * 由本 composable 回调，具体补挂策略属 useScoreViewportRender。
   */
  onSettleExpand: (el: HTMLElement) => void;
  /** 沉降收口后刷新边缘滚动按钮的可见性（内容总高变了，可滚 / 贴边判定随之变） */
  refreshEdgeVisibility: () => void;
  /**
   * 捏合会话真正开始时回调一次：让调用方撤掉同一手势下**已经登记**的其它意图
   * （第一根手指可能已压在某个和弦上起了长按计时，不撤掉就会在捏合途中起拖）。
   */
  onGestureStart?: () => void;
}

/**
 * 手势缩放（双指捏合 / 触控板捏合 / Ctrl+滚轮）与它的**预览 / 提交两段式**收口。
 *
 * 三条不变量（改动本文件前先读这三条）：
 * 1. **手势期间只写 `transform`，绝不写 `zoom`** —— `zoom` 会改整棵子树的光栅化倍率，逐帧写就是
 *    逐帧全可视区重光栅化；`transform` 只改合成层矩阵，由合成器缩放已有的光栅结果。故 store 在
 *    手势期间保持不动（Vue 一次都不重渲），只在沉降窗口收口时提交一次。
 * 2. **锚点必须显式放回**（见 keepZoomAnchor）—— 滚动几何是容器 px、不随倍率换算，不补就是松手一跳。
 * 3. **沉降窗口内一切补挂让路**（`isSettling`）—— 提交那一帧若照常走进补挂，会在提交帧上再叠一整批行。
 *
 * 两件事必须与本 composable 成对，缺一都会坏：
 * - 容器上的 `[touch-action:pan-x_pan-y]`：禁掉浏览器自己的页面级捏合缩放，双指手势才轮得到
 *   usePinchZoom（理由见那边）；
 * - `onGestureStart` 里取消拖拽：第一根手指可能已压在某个和弦上起了长按计时（LONG_PRESS_DELAY），
 *   不取消就会在捏合途中起拖、松手时把和弦丢到别处。
 */
export function useViewZoomSettle({
  scoreZoneRef,
  onSettleExpand,
  refreshEdgeVisibility,
  onGestureStart,
}: UseViewZoomSettleOptions) {
  const scoreEditor = useScoreEditorStore();

  /**
   * 界面缩放（`arrangeViewZoom` 的倍率形式）：**只作用在容器上** —— 内容包裹层的 CSS `zoom`（见模板）。
   *
   * 为什么不逐个节点改尺寸（字号走 `--score-font-scale`、指板走 `:scale`）：捏合中每一帧都要重渲
   * 每个和弦槽、重画每块指板画布（用户实测「很卡」，且长谱面越明显）；容器级 `zoom` 由浏览器一次
   * 缩放**已渲染的结果**，子组件一个都不重渲，手势才跟得上手。代价是缩放是纯视觉的：容器内的
   * 间距、控件、热区都跟着放大缩小（这正是「整个容器放大」的字面含义）。
   *
   * 生效时机：手势期间**不写**这里 —— 每帧写一次就是每帧一次全可视区重光栅化（实测 50~490ms/帧），
   * 只在沉降窗口收口时提交一次，手势中由包裹层的 `transform` 预览（口径见 markViewZoomSettling）。
   *
   * `zoom` 的语义（Chromium 实测，见 changelog）：容器内所有长度都按倍率渲染 —— 百分比尺寸仍占满
   * 容器（`min-w-full` 不会溢出）、`offsetHeight` 报**局部** px、`getBoundingClientRect()` 报
   * **视觉** px、滚动容器的 `scrollWidth/scrollHeight` 报缩放后的总尺寸（滚动范围因此是对的）。
   */
  const viewZoom = computed(() => scoreEditor.arrangeViewZoom / 100);

  /**
   * 视觉 px → 容器局部 px（容器带 `zoom` 时两者差一个倍率）。
   *
   * 容器内的**一切长度**都按倍率渲染：写进去的 px（`contain-intrinsic-size`、`margin-top`）会被
   * 浏览器再乘一次倍率，而 `getBoundingClientRect()` 报的是已乘过的视觉 px。故凡是「量出来的值要
   * 落回容器内」的地方（行高、空档高度）都得除回来；反过来「容器内的值与滚动几何比较」用
   * toVisualPx。漏掉任一方向的换算，占位高度就会被放大 zoom 倍 —— 内容总高偏大、滚动到底部
   * 永远差一截，正是调用方反复警告的那类偏差。
   */
  const toContainerPx = (visualPx: number): number => visualPx / viewZoom.value;

  /** 容器局部 px → 视觉 px：用于把容器内的长度与滚动几何（scrollTop / clientHeight）放在同一尺度上比 */
  const toVisualPx = (containerPx: number): number => containerPx * viewZoom.value;

  /** 容器缩放的内联样式：倍率为 1（默认值）时**不下发** —— 「没缩放过」的 DOM 与改动前逐字一致 */
  const viewZoomStyle = computed(() => (viewZoom.value === 1 ? undefined : { zoom: viewZoom.value }));

  /**
   * 手势缩放的「沉降」窗口句柄（非 null 即窗口内）：窗口里**任何**补挂一律让路。
   *
   * 普通变量而非 ref（不驱动渲染）。为什么必须让路见 markViewZoomSettling：闸门经 `isSettling`
   * 交给 useScoreViewportRender —— 它的扩容哨兵与两条滚动路径都要按它让路。
   */
  let zoomSettleTimer: ReturnType<typeof setTimeout> | null = null;

  /** 沉降窗口是否打开（窗口内一律不补挂） */
  const isSettling = (): boolean => zoomSettleTimer !== null;

  /**
   * 手势缩放的「预览 / 提交」两段式：捏合期间只改 `transform`，停下才写 `zoom`。
   *
   * **为什么不能每帧改 `zoom`（用户实测 + LoAF 归因）。** `zoom` 会改整棵子树的**光栅化倍率**，
   * 浏览器每帧都得把可视区重新光栅化一遍。实测长帧 50~490ms，而同一帧里的脚本时间只有 0~21ms
   * （`long-animation-frame` 的脚本归因只点到 `useRafThrottle` 与 v-scrollbar 的 `onwheel`，
   * 各 8~21ms）—— 时间全花在**渲染**上，脚本这边没有可优化的余地。`wheel` 事件因此排在队里等一秒，
   * 控制台报「delayed for N ms due to main thread being busy」。
   *
   * **改法。** 手势期间只在包裹层上写 `transform: scale()`：`transform` 只改合成层的变换矩阵，
   * 既不碰布局、也不改光栅化倍率；先挂 `will-change: transform` 让它独立成层，逐帧改矩阵由合成器
   * 缩放**已有的光栅结果**（代价是手势中略微发虚，提交后恢复清晰）。变换原点锚在**可视区中心**
   * （按容器局部 px 算），内容于是在手指下原地缩放，而不是从内容左上角甩出去。
   *
   * 顺带的好处：手势期间 `zoom` 没变 → 内容总高没变 → 不会钳位补发 scroll 事件，平台的滚动条几何
   * 刷新、边缘羽化与补挂全都不会被惊动；store 也不写，Vue 一次都不重渲。整段手势是**零 JS 渲染**的。
   *（容器上那路 ResizeObserver 本来也不会被惊动：RO 报的是元素自身坐标系的局部尺寸，改 zoom 不改它 ——
   * 探针实测过，改 zoom 前后各元素的通知计数与读数完全一致。）
   *
   * **收口。** 最后一笔之后 ZOOM_SETTLE_MS 提交一次（写 `zoom` + 把锚点放回可视区中心 + 补一次挂载
   * + 边缘态刷新，后三步都排在 `nextTick` 之后、按新几何算）：提交那一帧照旧要重光栅化一次（这是拿
   * 清晰度必须付的），但只付一次。触摸端与滚轮端共用这一条 —— Ctrl+滚轮没有「结束」事件，按时长收口
   * 比按事件收口可靠。
   *
   * 锚点必须显式放回（见 keepZoomAnchor）：滚动几何是容器 px，不随倍率换算，不补就是松手一跳。
   *
   * 收口前的这段时间里，滚动驱动的补挂与边缘态刷新一律不跑：提交会改内容总高、可能补发 scroll 事件，
   * 若照常走进补挂，就会在提交那一帧再叠上一整批行（一批 10 行、每行含指板图卡约十几毫秒）。
   */
  const ZOOM_SETTLE_MS = 200;

  /** 预览层（内容包裹层）：手势期间 `transform` 就写在它身上 */
  const zoomLayerRef = useTemplateRef<HTMLElement>('zoomLayerRef');

  /**
   * 预览中的倍率（**百分比**，与 store / usePinchZoom 同单位；null = 当前没有手势在预览）。
   * 手势期间 store 里那个值保持不动。
   */
  let zoomPreviewValue: number | null = null;
  /**
   * 预览基准：手势开始那一刻已提交的倍率，同样取**百分比**。
   *
   * ⚠️ 单位必须与 `usePinchZoom` 的读数一致（百分比）：写 `transform` 时直接拿它当分母
   *（百分比 ÷ 百分比 = 倍率），算变换原点时才 `/ 100` 换成倍率。混用会让 `scale()` 收到一个
   * 百分比字面量（`scale(105)`）—— 画面直接放大百倍，且后续每帧只在这个百倍基数上微调，
   * 看起来就是「预览不跟手」。
   */
  let zoomPreviewBase = 100;

  /**
   * 「可视区中心」落在包裹层**局部 px** 的哪一点 —— 本文件里所有围绕中心的换算都走这一处。
   *
   * 取「中心相对包裹层左 / 上边缘的视觉偏移」再除倍率。用两边 `getBoundingClientRect` 之差量，而不是拿
   * `scrollLeft` 反推：包裹层窄于容器时会被 `mx-auto` 居中、容器自己还带内边距，它的左边缘并不在内容原点，
   * 按 scrollLeft 算出来的点会整体偏一个居中量（缩放时看得见漂移）。
   *
   * `scale` 传「包裹层**此刻实际**渲染出的倍率」：手势期间传预览倍率（`transform` 已按它缩放，量到的 rect
   * 就是缩放后的），提交后传已提交倍率 —— 两处各传各的，传错就是整段偏移。
   */
  const readCenterPoint = (el: HTMLElement, scale: number): { x: number; y: number } => {
    const zone = scoreZoneRef.value;
    if (!zone || scale <= 0) return { x: 0, y: 0 };
    const zoneRect = zone.getBoundingClientRect();
    const layerRect = el.getBoundingClientRect();
    return {
      x: (zone.clientWidth / 2 - (layerRect.left - zoneRect.left)) / scale,
      y: (zone.clientHeight / 2 - (layerRect.top - zoneRect.top)) / scale,
    };
  };

  /** 撤掉预览层的一切痕迹（幂等）：让 `transform` 与合成层提示一起回到未缩放的状态 */
  const clearZoomPreview = (el: HTMLElement | null) => {
    if (!el) return;
    el.style.transform = '';
    el.style.transformOrigin = '';
    el.style.willChange = '';
  };

  /** 起手势：记基准、把变换原点锚在可视区中心、把包裹层提成合成层 */
  const beginZoomPreview = (el: HTMLElement) => {
    zoomPreviewBase = scoreEditor.arrangeViewZoom;
    zoomPreviewValue = zoomPreviewBase;
    // 原点按**本元素的局部 px** 给（口径见 readCenterPoint）：手势期间内容以这一点为轴缩放，
    // 于是它在手指下原地变大变小，而不是从内容左上角甩出去
    const origin = readCenterPoint(el, zoomPreviewBase / 100);
    el.style.transformOrigin = `${origin.x}px ${origin.y}px`;
    el.style.willChange = 'transform';
  };

  /** 预览一帧：只写 `transform`，不写 store、不碰 `zoom` */
  const applyZoomPreview = (el: HTMLElement, value: number) => {
    el.style.transform = `scale(${value / zoomPreviewBase})`;
  };

  /**
   * 提交：写 store（`zoom` 由此生效）并撤掉预览层。
   *
   * 返回「撤掉 `transform` **之前**落在可视区中心的那一点」（包裹层局部 px），供 keepZoomAnchor 在 DOM
   * 带上新 `zoom` 之后把它放回中心。必须在撤预览之前量 —— 量到的就是用户正看着的那一帧。
   */
  const commitZoomPreview = (): { x: number; y: number } | null => {
    const value = zoomPreviewValue;
    const el = zoomLayerRef.value;
    zoomPreviewValue = null;
    const anchor = el && value !== null ? readCenterPoint(el, value / 100) : null;
    clearZoomPreview(el);
    if (value !== null && value !== scoreEditor.arrangeViewZoom) scoreEditor.arrangeViewZoom = value;
    return anchor;
  };

  /**
   * 把提交前落在可视区中心的那一点放回中心 —— 不补就是松手一跳。
   *
   * **为什么必须补。** `zoom` 改的是内容的渲染尺度，而滚动几何（`scrollTop` / `scrollLeft`）是**容器 px**、
   * 浏览器不会跟着倍率换算：倍率一变，同一段 `scrollTop` 就对应到另一处内容。手势期间预览把中心锚住，
   * 提交后若不显式补，松手那一刻画面整体漂走（用户实测「松手后位置变化了，滚动位置没有停在放大的位置」）。
   * 补回同一点，松手才是无缝的：手势里看到的最后一帧与提交后的第一帧落在同一处。
   *
   * **口径。** 补的量 = 「提交前中心点」与「提交后中心点」之差 × 已提交倍率（两点都在包裹层局部 px 里，
   * 由 readCenterPoint 量，同一套口径）。写出界时由浏览器钳位（内容缩小、滚不到那么远）—— 这正是
   * 「缩小时贴边」的期望行为，不额外判。
   *
   * **时机。** 必须在 DOM 带上新 `zoom` 之后量：写 store 只是排队，DOM 要到下一个微任务才更新，早量一步
   * 拿到的是旧倍率的几何（补挂 / 边缘态同理）。故由沉降窗口在 `nextTick` 之后调用。
   */
  const keepZoomAnchor = (anchor: { x: number; y: number } | null) => {
    const zone = scoreZoneRef.value;
    const el = zoomLayerRef.value;
    if (!anchor || !zone || !el) return;
    const scale = scoreEditor.arrangeViewZoom / 100;
    const current = readCenterPoint(el, scale);
    zone.scrollLeft += (anchor.x - current.x) * scale;
    zone.scrollTop += (anchor.y - current.y) * scale;
  };

  /** 记一笔「缩放刚写过」：重置沉降窗口，窗口结束时提交预览、把锚点放回中心、补一次挂载与边缘态 */
  const markViewZoomSettling = () => {
    if (zoomSettleTimer !== null) clearTimeout(zoomSettleTimer);
    zoomSettleTimer = setTimeout(() => {
      zoomSettleTimer = null;
      const el = scoreZoneRef.value;
      const anchor = commitZoomPreview();
      // 写 store 只是排队：`zoom` 要到下一个微任务才落到 DOM 上。锚点回位、补挂与边缘态刷新都按**新几何**
      // 算，故整段推到 nextTick 之后（此前这几步跑在提交前，量到的是旧倍率的几何）。
      void nextTick().then(() => {
        // 失活 / 隐藏（clientHeight 为 0）时几何无意义，直接跳过 —— 那几条路径的滚动位置另有存档恢复
        if (!el || !el.isConnected || el.clientHeight === 0) return;
        keepZoomAnchor(anchor);
        onSettleExpand(el);
        refreshEdgeVisibility();
      });
    }, ZOOM_SETTLE_MS);
  };

  /** 取消沉降窗口（幂等）：切歌 / 失活 / 卸载时调用。预览一并撤掉 —— 这几条收尾路径不提交手势值 */
  const cancelViewZoomSettling = () => {
    if (zoomSettleTimer !== null) {
      clearTimeout(zoomSettleTimer);
      zoomSettleTimer = null;
    }
    zoomPreviewValue = null;
    clearZoomPreview(zoomLayerRef.value);
  };

  /**
   * 排列区的手势缩放（双指捏合 / 触控板捏合 / Ctrl+滚轮）：把「手势」翻译成 store 里的
   * `arrangeViewZoom`，由它经 `viewZoom` 落到**内容包裹层的 CSS `zoom`** 上 —— 容器级缩放，
   * 子组件一个都不重渲（口径与理由见 viewZoom）。
   *
   * 手势值**不写进 arrangeFontScale / arrangeFretboardScale**：那两条是用户各自调好的比例，
   * 手势只在容器上叠一个整体倍率（口径见 store 里 arrangeViewZoom 的说明）。
   *
   * 写入**不直接落 store**，而是走预览层（见 markViewZoomSettling）：手势期间只改 `transform`、
   * 停下才提交 `zoom`。故 `getValue` 必须先读预览值 —— 手势期间 store 是**旧值**，读它会拿已提交的
   * 基准去算增量（同帧内多发的位移会被整段丢掉）。
   */
  usePinchZoom(scoreZoneRef, {
    min: ARRANGE_VIEW_MIN_ZOOM_PERCENT,
    max: ARRANGE_VIEW_MAX_ZOOM_PERCENT,
    minPinchSpan: ARRANGE_VIEW_MIN_PINCH_SPAN_PX,
    wheelSensitivity: ARRANGE_VIEW_WHEEL_ZOOM_SENSITIVITY,
    getValue: () => zoomPreviewValue ?? scoreEditor.arrangeViewZoom,
    setValue: value => {
      const el = zoomLayerRef.value;
      if (el) {
        if (zoomPreviewValue === null) beginZoomPreview(el);
        zoomPreviewValue = value;
        applyZoomPreview(el, value);
      }
      // 包裹层还没挂上（歌词为空、v-else 未渲染）：退回直接写 store，至少不丢手势
      else scoreEditor.arrangeViewZoom = value;
      markViewZoomSettling();
    },
    onGestureStart: () => onGestureStart?.(),
  });

  return {
    viewZoomStyle,
    toContainerPx,
    toVisualPx,
    zoomLayerRef,
    isSettling,
    cancelViewZoomSettling,
  };
}
