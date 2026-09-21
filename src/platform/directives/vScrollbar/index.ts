import { settleBubbleRoll } from './scrollbarBubbleRoll';
import {
  ensureGlobalStyle,
  hideBubble,
  HOST_CLASS,
  refreshAll,
  resolveAxes,
  resolveBubbleOptions,
  states,
} from './scrollbarCore';
import {
  attachHostScroll,
  attachHoverVisibility,
  attachInteractionStamps,
  attachSizeObservers,
  createAxisOverlays,
  resolveOverlayParent,
} from './scrollbarOverlay';
import { EDGE_OFFSET, END_INSET } from './scrollbarTypes';
import { cancelWheelAnim } from './scrollbarWheel';

import type { ScrollbarState } from './scrollbarCore';
import type { ScrollbarBinding } from './scrollbarTypes';
import type { Directive } from 'vue';

/**
 * v-scrollbar 指令：把宿主滚动容器的原生滚动条替换为自绘覆盖式滚动条。
 *
 * 用法：<div v-scrollbar>…</div>（指令自行注入 overflow 并隐藏原生滚动条，无需手写 overflow-* 类）
 * 不带修饰符/方向选项时默认同时渲染横、纵双轴滚动条，各轴仅在确有内容溢出时显示（对齐原生限制）。
 * 带选项/单向限制：<div v-scrollbar="{ direction: 'x', autoHide: 1200 }"> 或 v-scrollbar.vertical
 * 可选滚动气泡提示：<div v-scrollbar="{ bubble: true }">（默认关）；传选项对象可自定义读数与档位
 * （<div v-scrollbar="{ bubble: { size: 'md', format: d => `第 3 组 · ${Math.round(d.progressY * 100)}%` } }">），
 * 读数的变化默认逐字符翻页（复用 BaseRollingText 的对位算法与过渡类），见 ScrollbarBubbleOptions.roll。
 *
 * 结构（overlay 模式）：轨道与拇指不挂在滚动容器内，而是挂到宿主的父元素上，
 * 绝对定位覆盖宿主可视区——不随内容滚走、无需 scrollPos 叠加补偿，
 * 拇指位置按滚动比例实时映射，天然钉在可视区边缘。
 *
 * 边界处理：
 * - 内容不足一屏时拇指自动隐藏；ResizeObserver 缺失的环境降级为仅 scroll 事件驱动；
 * - 拇指带 ::after 扩展热区（可视 6px + 四向 4px），细条不难点；
 * - 拖拽拇指使用 pointer capture，拖拽目标显式钳制防越界；轨道点击按页滚动；
 * - 滚动气泡带指向滚动条的箭头（复用 Popover/Tooltip 的浮层箭头逻辑），寿命以滚动条可见期为上界；
 * - 卸载时完整清理（观察器/监听器/DOM/宿主样式），可重复挂载。
 *
 * 【本文件的职责边界】拆分后这里只剩「状态构造 + 挂载/卸载 + 指令定义 + 公开 API 重导出」：
 * 纯几何在 scrollbarGeometry、翻页器在 scrollbarBubbleRoll、共享内核在 scrollbarCore、
 * 各路交互分别在 scrollbarDrag / scrollbarWheel / scrollbarTrack / scrollbarOverlay。
 * 依赖严格单向：types ← geometry/roll ← core ← {drag→wheel,wheel} ← track ← overlay ← 本文件。
 */

const buildState = (
  host: HTMLElement,
  parent: HTMLElement,
  binding: ScrollbarBinding,
  modifiers?: Record<string, boolean>
): ScrollbarState => {
  const options = binding ?? {};
  const axes = resolveAxes(options, modifiers);
  const autoHide = options.autoHide ?? 400;
  return {
    host,
    parent,
    tracks: { y: null, x: null },
    thumbs: { y: null, x: null },
    thumbLens: { y: 0, x: 0 },
    axes,
    bubble: null,
    bubbleLabel: null,
    bubbleText: '',
    bubbleRoller: null,
    // 所属轴基线（滚动位置的上一帧读数）：由 attachHostScroll 在挂载时取，取到之前为 null
    bubbleAxisPos: null,
    bubbleTimer: null,
    options: {
      direction: options.direction,
      autoHide,
      minThumbSize: options.minThumbSize ?? 32,
      trackClick: options.trackClick ?? 'page',
      showTrack: modifiers?.['no-track'] ? false : (options.showTrack ?? true),
      endInset: options.endInset ?? END_INSET,
      edgeOffset: options.edgeOffset ?? EDGE_OFFSET,
      // 气泡默认轴依赖最终启用轴，且默认隐藏时长跟随 autoHide，故须在解出 axes / autoHide 之后再解析
      bubble: resolveBubbleOptions(options.bubble, axes, autoHide),
      onScroll: options.onScroll,
    },
    resizeObserver: null,
    mutationObserver: null,
    observedChildren: new WeakSet(),
    refreshRaf: null,
    hideTimer: null,
    hovering: false,
    lastInteractionAt: 0,
    wheelAnim: null,
    overlayWheelAt: { y: null, x: null },
    overlayWheelHandedOff: { y: false, x: false },
    dragAxis: null,
    dragStartPos: 0,
    dragStartScroll: 0,
    trackPressAxis: null,
    trackPressPointer: null,
    disposers: [],
  };
};

const mountScrollbar = (host: HTMLElement, binding: ScrollbarBinding, modifiers?: Record<string, boolean>): void => {
  const options = binding ?? {};
  const parent = resolveOverlayParent(host, options);
  if (!parent) return;
  if (typeof document === 'undefined') return;
  ensureGlobalStyle();
  const state = buildState(host, parent, binding, modifiers);
  states.set(host, state);

  // overlay 元素挂宿主父元素；父元素需为定位容器（static 时补 relative）
  const pos = getComputedStyle(parent).position;
  if (pos === 'static') parent.style.position = 'relative';
  host.classList.add(HOST_CLASS);
  // 内联隐藏原生滚动条：Vue patch 会重写 className 抹掉宿主类（切换 tab 时原生滚动条闪现），
  // 内联属性不受 patch 影响；::-webkit-scrollbar 仍靠宿主类兜底（伪元素无法内联设置）
  host.style.scrollbarWidth = 'none';
  host.style.setProperty('-ms-overflow-style', 'none');
  // 注入滚动所必需的 overflow：指令托管哪个轴，就把哪个轴设为 auto，调用方无需再手写 overflow-* 工具类。
  // 同为内联设置（理由同上：className 会被 Vue patch 重写，内联不受影响）。
  // 注：CSS 规范下 overflow 一轴非 visible 时，另一轴的 visible 会计算为 auto——
  // 故对现有「只声明了单轴 overflow-*」的宿主，注入后计算值不变，无回归。
  if (state.axes.includes('y')) host.style.overflowY = 'auto';
  if (state.axes.includes('x')) host.style.overflowX = 'auto';

  createAxisOverlays(state, parent);
  attachHostScroll(state);
  attachInteractionStamps(state);
  attachSizeObservers(state);

  refreshAll(state);
  // 挂载时布局可能尚未稳定（如模态框开启动画/字体加载），连续两帧后再刷新一次
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      // 两帧后宿主可能已卸载（updated 重建 / 元素移除）：state 已失效则跳过刷新（同 scheduleRefresh 的守卫）
      if (states.get(state.host) === state) refreshAll(state);
    })
  );
  attachHoverVisibility(state);
};

const unmountScrollbar = (host: HTMLElement): void => {
  const state = states.get(host);
  if (!state) return;
  cancelWheelAnim(state);
  if (state.refreshRaf !== null) {
    cancelAnimationFrame(state.refreshRaf);
    state.refreshRaf = null;
  }
  state.resizeObserver?.disconnect();
  state.mutationObserver?.disconnect();
  if (state.hideTimer !== null) clearTimeout(state.hideTimer);
  // 气泡收起与倒计时一并清掉：只摘 DOM 不撤定时器，会让定时器在卸载后仍持有 state 引用
  hideBubble(state);
  for (const dispose of state.disposers) dispose();
  state.disposers = [];
  state.thumbs.y?.remove();
  state.thumbs.x?.remove();
  state.tracks.y?.remove();
  state.tracks.x?.remove();
  state.bubble?.remove();
  state.bubble = null;
  // 翻页器持有收尾定时器与节点引用，随卸载一并作废（同 hideBubble：只摘 DOM 不撤定时器会漏引用）
  if (state.bubbleRoller) {
    settleBubbleRoll(state.bubbleRoller);
    state.bubbleRoller = null;
  }
  // 读数节点随气泡一起脱离 DOM，引用必须同步置空：否则 state 已删出 WeakMap，旧的 label 仍被闭包外的引用链挂着
  state.bubbleLabel = null;
  host.classList.remove(HOST_CLASS);
  host.style.removeProperty('scrollbar-width');
  host.style.removeProperty('-ms-overflow-style');
  // 刻意不摘 overflow-x / overflow-y：一旦把 overflow 还原为 visible，浏览器会立即销毁该元素的
  // scrolling box 并丢弃 scrollTop。而卸载发生时元素往往仍在 DOM 中、且正在播放离场动画
  // （如浮层关闭的 scale 淡出），内容会瞬间跳回顶部，肉眼可见。
  // 元素即将被移除，这些内联样式本就随节点一起消失，保留它们没有副作用。
  states.delete(host);
};

/**
 * 被动模式（enabled:false）：不挂自绘 overlay，但仍托管「可滚动」本身——
 * 注入 overflow 与隐藏原生滚动条。宿主（如 BaseScrollArea）因此无需为关闭自绘滚动条的
 * 场景再手写 overflow-* / no-scrollbar：启用与禁用两种形态下滚动基建都由指令统一注入。
 */
const mountPassiveScrollbar = (
  host: HTMLElement,
  binding: ScrollbarBinding,
  modifiers?: Record<string, boolean>
): void => {
  if (typeof document === 'undefined') return;
  ensureGlobalStyle();
  host.classList.add(HOST_CLASS);
  // 与完整挂载同款双保险：类会被 Vue patch 重写，内联属性不受影响（::-webkit-scrollbar 靠类兜底）
  host.style.scrollbarWidth = 'none';
  host.style.setProperty('-ms-overflow-style', 'none');
  const options = binding && typeof binding === 'object' ? binding : {};
  const axes = resolveAxes(options, modifiers);
  if (axes.includes('y')) host.style.overflowY = 'auto';
  if (axes.includes('x')) host.style.overflowX = 'auto';
};

/**
 * 影响挂载产物结构的运行态选项指纹（数组顺序即比较口径）。
 *
 * 早退守卫必须覆盖全部这类选项——漏一项的表现是「绑定新值被静默冻结在挂载初值」
 * （minThumbSize/autoHide/trackClick 曾就是这么漏掉的）。新增选项只在这数组里登记一处，
 * 不必再回到 updated 里补一条 &&。
 * - direction 不入指纹：其唯一运行态影响已由 resolveAxes 收敛进 axes；
 * - onScroll 与 bubble.format 不入指纹：纯回调只做引用替换，纳入判据会让滚动区随父组件
 *   每次重渲染整体重建（内联箭头函数每次都是新引用），代价远大于收益。
 */
const structuralFingerprintOf = (state: ScrollbarState): unknown[] => [
  JSON.stringify(state.axes),
  state.options.showTrack,
  state.options.endInset,
  state.options.edgeOffset,
  state.options.minThumbSize,
  state.options.autoHide,
  state.options.trackClick,
  state.options.bubble.enabled,
  state.options.bubble.axis,
  state.options.bubble.offset,
  state.options.bubble.hideDelay,
  // size 决定气泡档位类与箭头边长，两者都在挂载时落到 DOM/内联样式上
  state.options.bubble.size,
  // roll 决定读数节点是「单元宿主」还是纯文本节点，同样只在挂载时定型
  state.options.bubble.roll,
  state.options.bubble.onlyInteractive,
];

const sameStructuralFingerprint = (a: unknown[], b: unknown[]): boolean =>
  a.length === b.length && a.every((value, i) => value === b[i]);

export const vScrollbar: Directive<HTMLElement, ScrollbarBinding> = {
  mounted: (el, binding) => {
    // enabled=false：被动挂载（只注入 overflow 与隐藏原生滚动条，不注册状态、不挂 overlay），
    // 翻转为启用时由 updated 增量挂载；关闭时由 updated 完整卸载
    if (binding.value?.enabled === false) {
      mountPassiveScrollbar(el, binding.value, binding.modifiers);
      return;
    }
    mountScrollbar(el, binding.value, binding.modifiers);
  },
  updated: (el, binding) => {
    if (binding.value?.enabled === false) {
      // 启用 → 禁用：完整卸载；本就未挂载时为幂等空操作。
      // 卸载后回放被动注入：Vue patch 会重写 className 抹掉宿主类，内联注入需幂等补挂
      unmountScrollbar(el);
      mountPassiveScrollbar(el, binding.value, binding.modifiers);
      return;
    }
    // Vue patch class 时会重写 className，把挂载时外加的宿主类抹掉（原生滚动条闪现），幂等补挂
    el.classList.add(HOST_CLASS);
    // 选项/修饰符变化时整体重建（指令选项变更频率低，重建成本可忽略）
    const prev = states.get(el);
    const next = el.parentElement ? buildState(el, el.parentElement, binding.value, binding.modifiers) : null;
    // 回调选项随渲染更新：onScroll 变化只做引用替换，无需销毁重建滚动条；
    // 典型场景：绑定值里的模板 ref 在挂载时尚未就绪（?. 取到 undefined），后续渲染传入真实回调，
    // 若不在此同步，早退分支会沿用挂载时的 undefined 导致 onScroll 永不触发。
    if (prev && next && prev.options.onScroll !== next.options.onScroll) prev.options.onScroll = next.options.onScroll;

    // 气泡文案回调同理只做引用替换：宿主常用内联箭头函数（每次渲染都是新引用），
    // 若纳入重建判据，滚动区会在父组件每次重渲染时整体重建（摘挂 overlay + 重挂监听），代价远大于收益。
    // 文案以外（启用态/轴/间距/隐藏时长/交互过滤）都是结构性选项，纳入下方早退比较。
    if (prev && next && prev.options.bubble.format !== next.options.bubble.format)
      prev.options.bubble.format = next.options.bubble.format;

    if (prev && next && sameStructuralFingerprint(structuralFingerprintOf(prev), structuralFingerprintOf(next))) return;

    unmountScrollbar(el);
    mountScrollbar(el, binding.value, binding.modifiers);
  },
  beforeUnmount: el => unmountScrollbar(el),
};

// ── 公开 API 重导出：保持与本文件拆分前完全一致，现有 `import { ... } from '.../vScrollbar'` 不受影响 ──
export type {
  ScrollbarBinding,
  ScrollbarBubbleOptions,
  ScrollbarBubbleSize,
  ScrollbarModifiers,
  ScrollbarOptions,
  ScrollbarScrollDetail,
} from './scrollbarTypes';
export { BUBBLE_ARROW_SIZE, BUBBLE_OFFSET, EDGE_OFFSET, END_INSET } from './scrollbarTypes';
export { computeBubblePosition, computeThumbGeometry } from './scrollbarGeometry';
