/**
 * v-scrollbar 指令：把宿主滚动容器的原生滚动条替换为自绘覆盖式滚动条。
 *
 * 用法：<div v-scrollbar>…</div>（指令自行注入 overflow 并隐藏原生滚动条，无需手写 overflow-* 类）
 * 不带修饰符/方向选项时默认同时渲染横、纵双轴滚动条，各轴仅在确有内容溢出时显示（对齐原生限制）。
 * 带选项/单向限制：<div v-scrollbar="{ direction: 'x', autoHide: 1200 }"> 或 v-scrollbar.vertical
 *
 * 结构（overlay 模式）：轨道与拇指不挂在滚动容器内，而是挂到宿主的父元素上，
 * 绝对定位覆盖宿主可视区——不随内容滚走、无需 scrollPos 叠加补偿，
 * 拇指位置按滚动比例实时映射，天然钉在可视区边缘。
 *
 * 边界处理：
 * - 内容不足一屏时拇指自动隐藏；ResizeObserver 缺失的环境降级为仅 scroll 事件驱动；
 * - 拇指带 ::after 扩展热区（可视 6px + 四向 4px），细条不难点；
 * - 拖拽拇指使用 pointer capture，拖拽目标显式钳制防越界；轨道点击按页滚动；
 * - 卸载时完整清理（观察器/监听器/DOM/宿主样式），可重复挂载。
 */
import { SCROLL_INTERACTIVE_WINDOW_MS } from '@/platform/utils/constants';

import type { Directive } from 'vue';

export interface ScrollbarOptions {
  /** 生效轴向：'y' 纵向 / 'x' 横向；与 vScrollIntoView 的 direction 约定一致。
   *  省略（且无方向修饰符）时默认启用双轴（x+y），各轴仅在确有溢出时显示，对齐原生滚动条限制 */
  direction?: 'x' | 'y';
  /** 闲置后自动隐藏拇指的毫秒数；false 表示常显。默认 400 */
  autoHide?: number | false;
  /** 拇指最小长度（px），默认 32 */
  minThumbSize?: number;
  /** 轨道点击行为：page 翻页滚动 / jump 直接跳到点击位 / none 无响应。默认 'page' */
  trackClick?: 'page' | 'jump' | 'none';
  /** 是否渲染轨道（拇指仍保留）；亦可直接用 `.no-track` 修饰符开启拇指-only 模式。默认 true */
  showTrack?: boolean;
  /** 轨道与拇指行程的首尾留白（px），默认 4；遇到大圆角容器时可适当增大（如 8）避免拇指端部被 overflow:hidden 裁切 */
  endInset?: number;
  /** 轨道与拇指距容器边缘的视觉间距（px），默认 4 */
  edgeOffset?: number;
  /** 每次滚动回调：携带位置与双轴进度（与派发的 scrollbar-scroll 事件同源，脚本消费更易获得类型提示） */
  onScroll?: (detail: ScrollbarScrollDetail) => void;
}

export type ScrollbarBinding = ScrollbarOptions | null | undefined;

/** v-scrollbar 滚动回调 onScroll 的事件详情：位置与各轴进度（0~1，无溢出时恒为 0） */
export interface ScrollbarScrollDetail {
  scrollTop: number;
  scrollLeft: number;
  /** 纵向最大可滚动量（scrollHeight - clientHeight，可能为 0） */
  maxScrollTop: number;
  /** 横向最大可滚动量（scrollWidth - clientWidth，可能为 0） */
  maxScrollLeft: number;
  /** 纵向滚动进度 0~1（无纵向溢出时恒 0） */
  progressY: number;
  /** 横向滚动进度 0~1（无横向溢出时恒 0） */
  progressX: number;
  /** 本次滚动是否由用户交互发起（最近的 pointerdown / wheel 落在 SCROLL_INTERACTIVE_WINDOW_MS
   *  窗口内）：false 表示布局钳位 / 程序化设位（如调整字号、内容增删、scrollTo），
   *  消费端可据此过滤掉非用户触发的滚动信号 */
  interactive: boolean;
}

/** 轴向修饰符：v-scrollbar.vertical / v-scrollbar.horizontal（x/y 为别名）；
 * `.no-track` 隐藏轨道只留拇指（拇指-only 模式） */
export type ScrollbarModifiers = 'vertical' | 'horizontal' | 'x' | 'y' | 'no-track' | (string & Record<never, never>);

/** 由修饰符与 options.direction 解析生效轴向（与 vScrollIntoView 约定一致）：
 *  - 同时写 .horizontal/.x 与 .vertical/.y → 双轴 ['x','y']
 *  - 仅写单一方向修饰符 → 该轴
 *  - 仅写 direction 选项 → 该轴
 *  - 均无（无修饰符、无 direction）→ 默认双轴 ['x','y']；各轴仅在确有溢出时由
 *    refreshAxis 隐藏，对齐原生滚动条「仅在有可滚内容时出现」的限制 */
const resolveAxes = (options: ScrollbarOptions, modifiers?: Record<string, boolean>): ('x' | 'y')[] => {
  const hasX = !!(modifiers?.['horizontal'] || modifiers?.['x']);
  const hasY = !!(modifiers?.['vertical'] || modifiers?.['y']);
  if (hasX && hasY) return ['x', 'y'];
  if (hasX) return ['x'];
  if (hasY) return ['y'];
  if (options.direction) return [options.direction];
  return ['x', 'y'];
};

/**
 * 纯几何：由滚动尺寸计算拇指长度与偏移。
 * scrollLength <= clientLength（内容不足一屏）时拇指尺寸为 0 即隐藏。
 * scrollLength/clientLength 为拇指行程尺寸（可含端部留白）；scrollable 为真实可滚动量
 * （scrollLength - clientLength 视口差），二者不等时必须显式传入，否则滚到底无法占满行程。
 */
export const computeThumbGeometry = (
  scrollLength: number,
  clientLength: number,
  scrollPos: number,
  minThumbSize: number,
  scrollable?: number
): { thumbSize: number; thumbOffset: number } => {
  if (scrollLength <= clientLength || clientLength <= 0) return { thumbSize: 0, thumbOffset: 0 };
  const track = Math.max(1, scrollable ?? scrollLength - clientLength);
  const ratio = clientLength / scrollLength;
  const thumbSize = Math.max(minThumbSize, Math.round(clientLength * ratio));
  const maxScrollOffset = Math.max(0, clientLength - thumbSize);
  const thumbOffset = Math.round((Math.min(scrollPos, track) / track) * maxScrollOffset);
  return { thumbSize, thumbOffset };
};

interface ScrollbarState {
  host: HTMLElement;
  parent: HTMLElement;
  tracks: { y: HTMLElement | null; x: HTMLElement | null };
  thumbs: { y: HTMLElement | null; x: HTMLElement | null };
  /** 各轴当前拇指长度（px），供拖拽比例换算 */
  thumbLens: { y: number; x: number };
  /** 当前启用的轴向集合：默认（无修饰符/无 direction）为双轴 ['x','y'] */
  axes: ('x' | 'y')[];
  options: {
    direction?: 'x' | 'y';
    autoHide: number | false;
    minThumbSize: number;
    trackClick: 'page' | 'jump' | 'none';
    showTrack: boolean;
    endInset: number;
    edgeOffset: number;
    onScroll?: (detail: ScrollbarScrollDetail) => void;
  };
  resizeObserver: ResizeObserver | null;
  mutationObserver: MutationObserver | null;
  hideTimer: ReturnType<typeof setTimeout> | null;
  /** 指针是否悬停在宿主内：悬停期间拇指常显，不启动自动隐藏 */
  hovering: boolean;
  /** 最近一次用户滚动手势（pointerdown / wheel）的时间戳，用于判定 scroll 事件是否由用户交互发起 */
  lastInteractionAt: number;
  /** 滚轮转发的缓动动画：目标位置累积 + rAF 渐近（避免 smooth scrollBy 连续触发时互相打断丢距离） */
  wheelAnim: { top: number; left: number; raf: number } | null;
  dragAxis: 'x' | 'y' | null;
  dragStartPos: number;
  dragStartScroll: number;
  /** 长按轨道跟随中的轴向与最新指针坐标；供 Resize/MutationObserver 在尺寸变化时补发 jumpToPointer，
   *  否则指针静止不动时内容尺寸变化不会触发重算，导致跟随位置与鼠标脱节 */
  trackPressAxis: 'x' | 'y' | null;
  trackPressPointer: { clientX: number; clientY: number } | null;
  /** 轨道长按等交互注册的兜底清理函数（如 document 级兜底监听），卸载时统一释放 */
  disposers: (() => void)[];
}

/** 粗细方向上轨道/拇指距容器边缘的视觉偏移（px）；导出供测试从常量推导期望值 */
export const EDGE_OFFSET = 4;
/** 轨道与拇指行程的首尾留白（px）；导出供测试从常量推导期望值 */
export const END_INSET = 4;
/** 拇指可视粗细（px） */
const THICKNESS = 6;
/** 交互热区外扩（px）：可视粗细不变，命中范围四向扩展 */
const HIT_AREA = 4;

const states = new WeakMap<HTMLElement, ScrollbarState>();
const HOST_CLASS = 'v-scrollbar-host';

/** 注入一次性的全局样式：隐藏宿主原生滚动条 + 轨道/拇指视觉（伪元素无法内联设置） */
const ensureGlobalStyle = (): void => {
  if (typeof document === 'undefined' || document.getElementById('v-scrollbar-style')) return;
  const style = document.createElement('style');
  style.id = 'v-scrollbar-style';
  style.textContent =
    `.${HOST_CLASS}{scrollbar-width:none;-ms-overflow-style:none;}` +
    `/* 滚动条专用拇指色：不复用 --text-disabled/--text-muted——暗色下后者因无障碍对比度被提亮导致两态几乎同色 */` +
    `:root{--v-scrollbar-thumb:#c7c7cc;--v-scrollbar-thumb-hover:#8e8e93;}` +
    `.dark{--v-scrollbar-thumb:#55555a;--v-scrollbar-thumb-hover:#a3a3ab;}` +
    `.${HOST_CLASS}::-webkit-scrollbar{display:none;}` +
    `/* 轨道颜色固定不随状态变化；默认仅透明隐藏（保留 visibility，否则收不到 hover/点击），悬停拇指/轨道时由指令切换可见类 */` +
    `.v-scrollbar-track{position:absolute;z-index:29;pointer-events:auto;cursor:pointer;` +
    `background:var(--border-light);opacity:0;border-radius:999px;` +
    `transition:opacity 250ms ease,width 150ms ease,height 150ms ease,transform 150ms ease;}` +
    `.v-scrollbar-track--visible{opacity:1;}` +
    `/* 轨道粗细由类控制，与拇指同步加宽内移（thumb:hover ~ track 兄弟选择器，保持同心） */` +
    `.v-scrollbar-track--y{width:${THICKNESS}px;}` +
    `.v-scrollbar-track--x{height:${THICKNESS}px;}` +
    `.v-scrollbar-thumb--y:hover ~ .v-scrollbar-track--y,.v-scrollbar-track--y:hover{width:${THICKNESS + 1}px;transform:translateX(-1px);}` +
    `.v-scrollbar-thumb--x:hover ~ .v-scrollbar-track--x,.v-scrollbar-track--x:hover{height:${THICKNESS + 1}px;transform:translateY(-1px);}` +
    `/* 轨道热区四向外扩：粗细方向上边缘侧的 EDGE 间隙也纳入交互区，不留死角 */` +
    `.v-scrollbar-track::after{content:'';position:absolute;inset:-${HIT_AREA}px;}` +
    `.v-scrollbar-thumb{position:absolute;z-index:30;border-radius:999px;pointer-events:auto;cursor:pointer;` +
    `background:var(--v-scrollbar-thumb);opacity:0;visibility:hidden;` +
    `transition:opacity 250ms ease,background 150ms ease,visibility 0s linear 250ms,width 150ms ease,height 150ms ease,transform 150ms ease;}` +
    `/* 粗细维度由类控制（hover 向容器内侧加宽 1px），长度维度由指令内联设置 */` +
    `.v-scrollbar-thumb--y{width:${THICKNESS}px;}` +
    `.v-scrollbar-thumb--x{height:${THICKNESS}px;}` +
    `.v-scrollbar-thumb--y:hover{width:${THICKNESS + 1}px;transform:translateX(-1px);background:var(--v-scrollbar-thumb-hover);}` +
    `.v-scrollbar-thumb--x:hover{height:${THICKNESS + 1}px;transform:translateY(-1px);background:var(--v-scrollbar-thumb-hover);}` +
    `/* 交互热区：可视粗细不变，四向外扩 HIT_AREA 提升可点性 */` +
    `.v-scrollbar-thumb::after{content:'';position:absolute;inset:-${HIT_AREA}px;}` +
    `/* overlay 是宿主的兄弟节点而非后代，显隐必须由指令直接切换可见类；visibility 延迟生效避免截断淡出 */` +
    `.v-scrollbar-thumb--visible{opacity:1;visibility:visible;transition:opacity 250ms ease,background 150ms ease,visibility 0s;}` +
    `/* 无可滚动区域：结构性隐藏，优先级高于可见类 */` +
    `.v-scrollbar-thumb--off{opacity:0 !important;visibility:hidden !important;pointer-events:none !important;}`;
  document.head.appendChild(style);
};

const getLength = (el: HTMLElement, axis: 'x' | 'y', kind: 'scroll' | 'client'): number =>
  axis === 'y'
    ? kind === 'scroll'
      ? el.scrollHeight
      : el.clientHeight
    : kind === 'scroll'
      ? el.scrollWidth
      : el.clientWidth;

const getScrollPos = (el: HTMLElement, axis: 'x' | 'y'): number => (axis === 'y' ? el.scrollTop : el.scrollLeft);

/**
 * 宿主在父元素内的布局偏移：沿 offsetParent 链累加（父元素已保证为定位容器，链必然终止于父元素）。
 * offset 值是纯布局坐标，不受 CSS transform（模态框开合动画等）影响；
 * getBoundingClientRect 在过渡期间量到的是变换中的视口坐标，会导致 overlay 大幅偏移。
 */
const getHostOffset = (
  host: HTMLElement,
  parent: HTMLElement
): { left: number; top: number; width: number; height: number } => {
  let left = 0;
  let top = 0;
  let el: HTMLElement | null = host;
  while (el && el !== parent) {
    left += el.offsetLeft;
    top += el.offsetTop;
    el = el.offsetParent as HTMLElement | null;
  }
  return { left, top, width: host.offsetWidth, height: host.offsetHeight };
};

/** 刷新单个轴的拇指几何（overlay 覆盖宿主可视区；拇指位置按滚动比例映射；no-track 模式下跳过轨道定位） */
const refreshAxis = (state: ScrollbarState, axis: 'x' | 'y'): void => {
  const { host, options } = state;
  const thumb = state.thumbs[axis];
  const track = state.tracks[axis];
  if (!thumb) return;
  const endInset = options.endInset;
  const edgeOffset = options.edgeOffset;
  // overlay 挂在宿主父元素上（absolute 定位参照父元素），坐标为父元素相对布局坐标
  const off = getHostOffset(host, state.parent);
  const relTop = off.top;
  const relLeft = off.left;
  const relRight = off.left + off.width;
  const relBottom = off.top + off.height;
  const scrollLength = getLength(host, axis, 'scroll');
  const clientLength = getLength(host, axis, 'client');
  const scrollPos = getScrollPos(host, axis);
  // 拇指行程两端各内缩 endInset，与轨道首尾留白对齐；滚动比例分母必须是真实可滚动量
  // （scrollLength - clientLength），否则行程内缩会让滚到底时拇指无法占满行程
  const { thumbSize, thumbOffset } = computeThumbGeometry(
    scrollLength,
    clientLength - 2 * endInset,
    scrollPos,
    options.minThumbSize,
    Math.max(0, scrollLength - clientLength)
  );
  const hidden = scrollLength <= clientLength || thumbSize <= 0;
  state.thumbLens[axis] = thumbSize;
  // 无可滚动区域时结构性隐藏（off 类硬切）；有滚动区域时交给可见类做淡入淡出
  thumb.classList.toggle(THUMB_OFF_CLASS, hidden);

  if (axis === 'y') {
    if (track) {
      // 轨道与拇指在粗细方向上重合（同心），距容器边缘留 edgeOffset 视觉间隙；首尾留 endInset
      track.style.top = `${relTop + endInset}px`;
      track.style.left = `${relRight - THICKNESS - edgeOffset}px`;
      track.style.height = `${off.height - 2 * endInset}px`;
      track.style.display = hidden ? 'none' : 'block';
    }
    // 拇指：钉在可视区，按滚动比例映射位移；粗细由类控制
    thumb.style.top = `${relTop + endInset + thumbOffset}px`;
    thumb.style.left = `${relRight - THICKNESS - edgeOffset}px`;
    thumb.style.height = `${thumbSize}px`;
  } else {
    if (track) {
      // 轨道：沿宿主下缘铺设，首尾留 endInset
      track.style.left = `${relLeft + endInset}px`;
      track.style.top = `${relBottom - THICKNESS - edgeOffset}px`;
      track.style.width = `${off.width - 2 * endInset}px`;
      track.style.display = hidden ? 'none' : 'block';
    }
    thumb.style.left = `${relLeft + endInset + thumbOffset}px`;
    thumb.style.top = `${relBottom - THICKNESS - edgeOffset}px`;
    thumb.style.width = `${thumbSize}px`;
  }
};

/** 刷新全部启用轴 */
const refreshAll = (state: ScrollbarState): void => {
  for (const axis of state.axes) refreshAxis(state, axis);
};

/** 拇指可见类切换（overlay 与宿主是兄弟关系，显隐必须落在拇指自身类上） */
const THUMB_VISIBLE_CLASS = 'v-scrollbar-thumb--visible';
/** 无可滚动区域的结构性隐藏类（优先级高于可见类，transition:none 硬切） */
const THUMB_OFF_CLASS = 'v-scrollbar-thumb--off';
/** 轨道可见类：仅悬停拇指/轨道时显示 */
const TRACK_VISIBLE_CLASS = 'v-scrollbar-track--visible';

const setThumbsVisible = (state: ScrollbarState, visible: boolean): void => {
  for (const t of [state.thumbs.y, state.thumbs.x]) {
    t?.classList.toggle(THUMB_VISIBLE_CLASS, visible);
  }
};

const setTracksVisible = (state: ScrollbarState, visible: boolean): void => {
  for (const t of [state.tracks.y, state.tracks.x]) {
    t?.classList.toggle(TRACK_VISIBLE_CLASS, visible);
  }
};

/** 启动自动隐藏倒计时（仅离开宿主后） */
const scheduleHide = (state: ScrollbarState): void => {
  if (state.options.autoHide === false) return;
  if (state.hideTimer !== null) clearTimeout(state.hideTimer);
  state.hideTimer = setTimeout(() => {
    setThumbsVisible(state, false);
    state.hideTimer = null;
  }, state.options.autoHide);
};

/** 显示滚动条；悬停宿主或拖拽中常显，否则启动自动隐藏 */
const showThumb = (state: ScrollbarState): void => {
  setThumbsVisible(state, true);
  if (state.hideTimer !== null) {
    clearTimeout(state.hideTimer);
    state.hideTimer = null;
  }
  if (!state.hovering && state.dragAxis === null) scheduleHide(state);
};

/**
 * 拖拽拇指：与 computeThumbGeometry 完全互逆的映射——
 * 拇指位移 / 最大拇指位移 = 滚动位移 / 最大滚动位移，显式钳制防越界
 */
const handleThumbPointerMove = (state: ScrollbarState, e: PointerEvent, axis: 'x' | 'y'): void => {
  const host = state.host;
  const endInset = state.options.endInset;
  const realClient = getLength(host, axis, 'client');
  const clientLength = realClient - 2 * endInset;
  const scrollLength = getLength(host, axis, 'scroll');
  // 真实可滚动量：行程内缩不改变内容可滚距离
  const maxScroll = Math.max(0, scrollLength - realClient);
  const maxThumbOffset = Math.max(0, clientLength - state.thumbLens[axis]);
  if (maxThumbOffset <= 0 || maxScroll <= 0) return;
  const delta = (axis === 'y' ? e.clientY : e.clientX) - state.dragStartPos;
  const target = Math.min(Math.max(state.dragStartScroll + (delta / maxThumbOffset) * maxScroll, 0), maxScroll);
  if (axis === 'y') host.scrollTop = target;
  else host.scrollLeft = target;
};

const attachThumbDrag = (state: ScrollbarState, axis: 'x' | 'y'): void => {
  const thumb = state.thumbs[axis];
  if (!thumb) return;
  thumb.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    cancelWheelAnim(state);
    state.dragAxis = axis;
    state.dragStartPos = axis === 'y' ? e.clientY : e.clientX;
    state.dragStartScroll = getScrollPos(state.host, axis);
    try {
      thumb.setPointerCapture(e.pointerId);
    } catch {
      // jsdom 等环境无 pointer capture 能力，忽略
    }
    // 拖拽期间常显，不受自动隐藏影响
    setThumbsVisible(state, true);
    if (state.hideTimer !== null) {
      clearTimeout(state.hideTimer);
      state.hideTimer = null;
    }
  });
  thumb.addEventListener('pointermove', (e: PointerEvent) => {
    if (state.dragAxis !== axis) return;
    handleThumbPointerMove(state, e, axis);
    showThumb(state);
  });
  const endDrag = () => {
    // 守卫：endDrag 同时挂在 thumb 与 document 捕获阶段；
    // 未处于拖拽时（如页面其它位置的 pointerup）直接返回，避免误触发 showThumb
    // 导致所有实例滚动条一起显形（回归：之前无守卫，侧栏点击会让其它滚动条也显示）。
    if (state.dragAxis === null) return;
    state.dragAxis = null;
    showThumb(state);
  };
  thumb.addEventListener('pointerup', endDrag);
  thumb.addEventListener('pointercancel', endDrag);
  document.addEventListener('pointerup', endDrag, true);
  document.addEventListener('pointercancel', endDrag, true);
  state.disposers.push(() => {
    document.removeEventListener('pointerup', endDrag, true);
    document.removeEventListener('pointercancel', endDrag, true);
  });
};

/** 取消进行中的滚轮缓动动画 */
const cancelWheelAnim = (state: ScrollbarState): void => {
  if (state.wheelAnim !== null) {
    cancelAnimationFrame(state.wheelAnim.raf);
    state.wheelAnim = null;
  }
};

/**
 * 滚轮转发：目标位置累积 + rAF 每帧向目标渐近。
 * 不用 scrollBy smooth——连续滚轮事件会不断重启平滑动画互相打断，实际位移远小于原生。
 */
const wheelScroll = (state: ScrollbarState, dx: number, dy: number): void => {
  const host = state.host;
  let anim = state.wheelAnim;
  if (anim === null) {
    anim = { top: host.scrollTop, left: host.scrollLeft, raf: 0 };
    state.wheelAnim = anim;
    const step = (): void => {
      const a = state.wheelAnim;
      if (!a) return;
      const maxTop = Math.max(0, host.scrollHeight - host.clientHeight);
      const maxLeft = Math.max(0, host.scrollWidth - host.clientWidth);
      a.top = Math.min(Math.max(a.top, 0), maxTop);
      a.left = Math.min(Math.max(a.left, 0), maxLeft);
      const dTop = a.top - host.scrollTop;
      const dLeft = a.left - host.scrollLeft;
      if (Math.abs(dTop) < 1 && Math.abs(dLeft) < 1) {
        host.scrollTop = a.top;
        host.scrollLeft = a.left;
        state.wheelAnim = null;
        return;
      }
      host.scrollTop += dTop * 0.35;
      host.scrollLeft += dLeft * 0.35;
      a.raf = requestAnimationFrame(step);
    };
    anim.raf = requestAnimationFrame(step);
  }
  anim.top += dy;
  anim.left += dx;
};

/** 轨道 jump：滚动到使拇指居中于指针位置。behavior 默认 'smooth'；
 *  长按连续跟随（含激活首跳、指针移动、静止时尺寸变化补发）也统一传 'smooth'，
 *  让滚动以缓动方式贴到鼠标处，而非瞬时裸跳 */
const jumpToPointer = (
  state: ScrollbarState,
  axis: 'x' | 'y',
  e: { clientX: number; clientY: number },
  behavior: ScrollBehavior = 'smooth'
): void => {
  const host = state.host;
  const endInset = state.options.endInset;
  const realClient = axis === 'y' ? host.clientHeight : host.clientWidth;
  const clientLength = realClient - 2 * endInset;
  const scrollLength = getLength(host, axis, 'scroll');
  const maxScroll = Math.max(0, scrollLength - realClient);
  if (maxScroll <= 0) return;
  const hostRect = host.getBoundingClientRect();
  const rawPos = axis === 'y' ? e.clientY - hostRect.top : e.clientX - hostRect.left;
  const clickPos = Math.min(Math.max(rawPos - endInset, 0), clientLength);
  // 与显示映射互逆：点击位 → 拇指行程占比 → 滚动量（拇指居中于点击位）。
  // 偏移量用实际 thumbSize（可能被 minThumbSize 钳制）的一半，保证超长内容下落点仍贴合指针；
  // 旧的 realClient/2 写法仅在拇指未被钳制时近似成立，长内容下误差随可滚动长度线性放大。
  const { thumbSize } = computeThumbGeometry(scrollLength, clientLength, 0, state.options.minThumbSize, maxScroll);
  const maxThumbOffset = Math.max(1, clientLength - thumbSize);
  const target = Math.min(Math.max(((clickPos - thumbSize / 2) / maxThumbOffset) * maxScroll, 0), maxScroll);
  cancelWheelAnim(state);
  host.scrollTo(axis === 'y' ? { top: target, behavior } : { left: target, behavior });
};

/** 轨道点击：thumb 之外的区域按策略翻页或跳转（监听挂在 track overlay 上）；
 *  长按轨道时持续滚动到指针位置——按住期间用指针捕获把整个手势事件稳定钉在 track 上，
 *  即使光标移出细窄轨道甚至移到内容区也继续「滚到此处」；每次移动都用最新指针位置与最新滚动
 *  度量重算目标，因此可滚动高度/宽度在按住期间变化也能持续正确跟随（修复高度变化后不再跟随的缺陷）。 */
const attachTrackClick = (state: ScrollbarState, axis: 'x' | 'y'): void => {
  const track = state.tracks[axis];
  if (!track) return;
  const LONG_PRESS_MS = 300;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let suppressClick = false;
  let longPressActive = false;
  const cancelLongPress = (): void => {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };
  // 长按激活后，按住期间持续把滚动贴住鼠标：事件经指针捕获已稳定落在 track 上，
  // 每次移动都用最新指针位置与最新滚动度量（scrollHeight/Width、clientHeight/Width）重算目标，
  // 因此可滚动高度/宽度在按住期间变化也能持续正确跟随。
  const reJump = (e: { clientX: number; clientY: number }): void => {
    if (!longPressActive) return;
    state.trackPressPointer = { clientX: e.clientX, clientY: e.clientY };
    jumpToPointer(state, axis, e, 'smooth');
  };
  const onMove = (e: PointerEvent): void => {
    reJump(e);
  };
  const endPress = (e: PointerEvent): void => {
    cancelLongPress();
    if (!longPressActive) return;
    longPressActive = false;
    state.trackPressAxis = null;
    state.trackPressPointer = null;
    state.host.style.userSelect = '';
    try {
      track.releasePointerCapture(e.pointerId);
    } catch {
      // 部分环境无 pointer capture，忽略
    }
    // 松手后紧随的 click 由 click 处理器用 suppressClick 抑制；延后清空避免污染下一次点击。
    setTimeout(() => {
      suppressClick = false;
    }, 0);
  };
  track.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0 || state.options.trackClick === 'none') return;
    // 事件落到轨道说明指针处不是拇指；长按（300ms）后开始「滚到此处」并持续跟随
    suppressClick = false;
    longPressActive = false;
    cancelLongPress();
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      suppressClick = true;
      longPressActive = true;
      state.trackPressAxis = axis;
      state.trackPressPointer = { clientX: e.clientX, clientY: e.clientY };
      state.host.style.userSelect = 'none'; // 按住拖拽期间禁止选中文本
      // 指针捕获：把后续 pointermove/up 稳定重定向到 track，光标移出细窄轨道或移到内容区仍持续响应，
      // 避免此前「指针移出轨道即取消长按、跟随中断」的缺陷。
      try {
        track.setPointerCapture(e.pointerId);
      } catch {
        // 部分环境无 pointer capture，忽略（退化为仅 track 内跟随）
      }
      reJump(e);
    }, LONG_PRESS_MS);
  });
  // 注意：不再在 pointerleave 上取消长按——细窄轨道指针轻微移出即误取消；改用指针捕获后
  // 按住期间事件稳定落在 track 上，跟随不受指针移出轨道影响。
  track.addEventListener('pointermove', onMove);
  track.addEventListener('pointerup', endPress);
  track.addEventListener('pointercancel', endPress);
  // 兜底：pointer capture 在极少数场景下可能未能把 up/cancel 重定向回 track
  // （例如快速二次按下打断了捕获），届时 track 自身的 up/cancel 监听不会触发，
  // longPressActive 会永久卡 true，之后任何静止悬停都会被 reJump 误判为长按跟随。
  // 在 document 捕获阶段兜底调用同一个 endPress（内部已按 longPressActive 判空，幂等安全）。
  document.addEventListener('pointerup', endPress, true);
  document.addEventListener('pointercancel', endPress, true);
  state.disposers.push(() => {
    document.removeEventListener('pointerup', endPress, true);
    document.removeEventListener('pointercancel', endPress, true);
  });
  track.addEventListener('click', (e: MouseEvent) => {
    if (state.options.trackClick === 'none') return;
    const thumb = state.thumbs[axis];
    if (thumb && (thumb === e.target || thumb.contains(e.target as Node))) return;
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const host = state.host;
    const endInset = state.options.endInset;
    const realClient = axis === 'y' ? host.clientHeight : host.clientWidth;
    // 有效轨道长度扣除两侧留白，点击位同样扣除上/左缘留白
    const clientLength = realClient - 2 * endInset;
    const scrollLength = getLength(host, axis, 'scroll');
    if (scrollLength <= clientLength) return;
    const current = getScrollPos(host, axis);
    if (state.options.trackClick === 'jump') {
      jumpToPointer(state, axis, e);
      return;
    }
    const hostRect = host.getBoundingClientRect();
    const rawPos = axis === 'y' ? e.clientY - hostRect.top : e.clientX - hostRect.left;
    const clickPos = Math.min(Math.max(rawPos - endInset, 0), clientLength);
    // 翻页方向以拇指当前位置为界（同原生滚动条）：点在拇指上方/左侧 = 向回翻，反之向前翻
    const geo = computeThumbGeometry(
      scrollLength,
      clientLength,
      current,
      state.options.minThumbSize,
      Math.max(0, scrollLength - realClient)
    );
    const thumbCenter = endInset + geo.thumbOffset + geo.thumbSize / 2;
    const forward = clickPos > thumbCenter;
    const page = realClient * 0.8;
    const next = current + (forward ? page : -page);
    cancelWheelAnim(state);
    host.scrollTo({
      [axis === 'y' ? 'top' : 'left']: Math.min(Math.max(next, 0), Math.max(0, scrollLength - realClient)),
      behavior: 'smooth',
    });
  });
};

const buildState = (
  host: HTMLElement,
  parent: HTMLElement,
  binding: ScrollbarBinding,
  modifiers?: Record<string, boolean>
): ScrollbarState => {
  const options = binding ?? {};
  return {
    host,
    parent,
    tracks: { y: null, x: null },
    thumbs: { y: null, x: null },
    thumbLens: { y: 0, x: 0 },
    axes: resolveAxes(options, modifiers),
    options: {
      direction: options.direction,
      autoHide: options.autoHide ?? 400,
      minThumbSize: options.minThumbSize ?? 32,
      trackClick: options.trackClick ?? 'page',
      showTrack: modifiers?.['no-track'] ? false : (options.showTrack ?? true),
      endInset: options.endInset ?? END_INSET,
      edgeOffset: options.edgeOffset ?? EDGE_OFFSET,
      onScroll: options.onScroll,
    },
    resizeObserver: null,
    mutationObserver: null,
    hideTimer: null,
    hovering: false,
    lastInteractionAt: 0,
    wheelAnim: null,
    dragAxis: null,
    dragStartPos: 0,
    dragStartScroll: 0,
    trackPressAxis: null,
    trackPressPointer: null,
    disposers: [],
  };
};

const mountScrollbar = (host: HTMLElement, binding: ScrollbarBinding, modifiers?: Record<string, boolean>): void => {
  const parent = host.parentElement;
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

  const makeEl = (cls: string) => {
    const el = document.createElement('div');
    el.className = cls;
    parent.appendChild(el);
    return el;
  };
  // 无修饰符且未指定 direction 时默认双轴（x+y）：各轴仅在确有溢出时由 refreshAxis 隐藏，
  // 对齐原生滚动条「仅在有可滚内容时出现」的限制。
  for (const axis of state.axes) {
    // no-track 模式：不创建轨道 overlay，只保留拇指（轨道点击/长按跟随随之不可用）
    if (state.options.showTrack) {
      // 拇指在前、轨道在后：z-index 控制层叠（拇指在上），兄弟选择器 thumb:hover ~ track 依赖此顺序
      state.thumbs[axis] = makeEl(`v-scrollbar-thumb v-scrollbar-thumb--${axis}`);
      state.tracks[axis] = makeEl(`v-scrollbar-track v-scrollbar-track--${axis}`);
      attachTrackClick(state, axis);
    } else {
      state.thumbs[axis] = makeEl(`v-scrollbar-thumb v-scrollbar-thumb--${axis}`);
    }
    attachThumbDrag(state, axis);

    // overlay 是宿主的兄弟节点：指针落在轨道/拇指上时宿主已 mouseleave，
    // 需由 overlay 自身接管悬停状态，否则会误启动自动隐藏；轨道仅在这两种悬停下显示
    const overlay = state.thumbs[axis]!;
    const trackOverlay = state.tracks[axis];
    for (const el of [overlay, trackOverlay]) {
      if (!el) continue;
      el.addEventListener('mouseenter', () => {
        state.hovering = true;
        setTracksVisible(state, true);
        showThumb(state);
      });
      el.addEventListener('mouseleave', () => {
        state.hovering = false;
        setTracksVisible(state, false);
        if (state.dragAxis === null) scheduleHide(state);
      });
      // wheel 不会冒泡到宿主（兄弟节点）：同参重派发到宿主元素，宿主上的滚动监听/指令
      // （如 v-wheel-scroll）按自身策略消费，以 defaultPrevented 判定消费与否；
      // 无人消费才走自身兜底转发。ctrl/meta/alt 交还浏览器默认（缩放等组合键）
      // 合成事件刻意 bubbles:false：只投递给宿主自身消费，不向上冒泡，
      // 避免宿主祖先上依赖 wheel 冒泡的委托（若存在）被这份转发事件二次处理。
      // 注意：真实事件不能在探测前无条件 preventDefault——若宿主策略选择放行
      // （如 v-wheel-scroll 的 overscroll:'auto' 在边界处），需要让真实事件保留默认行为，
      // 浏览器才能对非受信合成事件无法执行的「原生滚动链」进行兜底（穿透到祖先滚动容器）。
      el.addEventListener(
        'wheel',
        (e: WheelEvent) => {
          if (e.ctrlKey || e.metaKey || e.altKey) return;
          const resent = new WheelEvent('wheel', {
            deltaX: e.deltaX,
            deltaY: e.deltaY,
            deltaZ: e.deltaZ,
            deltaMode: e.deltaMode,
            shiftKey: e.shiftKey,
            bubbles: false,
            cancelable: true,
          });
          state.host.dispatchEvent(resent);
          if (resent.defaultPrevented) {
            // 宿主侧已消费：把消费决定镜像回真实事件，抑制其默认滚动
            e.preventDefault();
            return;
          }
          // 宿主侧放行（如边界穿透）：真实事件默认行为不被抑制，浏览器原生滚动链可继续生效；
          // 同时走自身兜底转发驱动宿主轴（边界放行场景下该轴已无可滚余量，等价于空操作）
          const scale = e.deltaMode === 1 ? 40 : 1; // 行模式（Firefox）按行高近似换算
          // 滚动条所在轴决定驱动哪条轴：纵向滚动条→纵向、横向滚动条→横向，
          // 不再双向同时滚动（避免停在横向滚动条上时纵向内容被误带）。
          // 横向滚动条同时接纳鼠标滚轮（deltaY）与触控板横向滑动（deltaX），保证鼠标可用。
          if (axis === 'y') {
            wheelScroll(state, 0, e.deltaY * scale);
          } else {
            wheelScroll(state, (e.deltaX + e.deltaY) * scale, 0);
          }
        },
        { passive: false }
      );
    }
  }

  // 宿主监听统一登记进 disposers：updated 重建路径会先 unmount 再 mount，
  // 若不摘除旧监听，同一宿主会累积多份 scroll/mouseenter/mouseleave（闭包持有旧 state）
  const onHostScroll = (): void => {
    refreshAll(state);
    showThumb(state);
    // 对外暴露滚动：位置 + 双轴进度 + 是否用户交互。覆盖原生 scroll、拇指拖拽、轨道点击跳转、
    // 滚轮转发（wheelScroll 通过修改 scrollTop/Left 同样触发原生 scroll）等全部滚动途径。
    // interactive 用于区分「用户滚动手势」与「布局钳位 / 程序化设位」：调整字号、内容增删、
    // scrollTo 等引发的滚动在此为 false，消费端据此过滤非用户触发的信号。
    const host = state.host;
    const maxTop = Math.max(0, host.scrollHeight - host.clientHeight);
    const maxLeft = Math.max(0, host.scrollWidth - host.clientWidth);
    const detail: ScrollbarScrollDetail = {
      scrollTop: host.scrollTop,
      scrollLeft: host.scrollLeft,
      maxScrollTop: maxTop,
      maxScrollLeft: maxLeft,
      progressY: maxTop > 0 ? host.scrollTop / maxTop : 0,
      progressX: maxLeft > 0 ? host.scrollLeft / maxLeft : 0,
      interactive: Date.now() - state.lastInteractionAt < SCROLL_INTERACTIVE_WINDOW_MS,
    };
    state.options.onScroll?.(detail);
  };
  host.addEventListener('scroll', onHostScroll, { passive: true });
  state.disposers.push(() => host.removeEventListener('scroll', onHostScroll));

  // 用户滚动手势埋点：pointerdown（滚轮拖拽/轨道点击/拇指拖拽/触屏）与 wheel 均视为用户发起，
  // 供 onScroll 判定 interactive；gesturestart 兜底触屏双臂缩放类滚动
  const stampInteraction = (): void => {
    state.lastInteractionAt = Date.now();
  };
  host.addEventListener('pointerdown', stampInteraction, { passive: true });
  host.addEventListener('wheel', stampInteraction, { passive: true });
  state.disposers.push(() => host.removeEventListener('pointerdown', stampInteraction));
  state.disposers.push(() => host.removeEventListener('wheel', stampInteraction));

  // 尺寸观测：宿主与全部子元素任一尺寸变化都刷新几何；
  // 内容增删（MutationObserver）触发后需把新子元素补进观察集（缺失环境降级为仅 scroll 驱动）
  if (typeof ResizeObserver !== 'undefined') {
    state.resizeObserver = new ResizeObserver(() => {
      refreshAll(state);
      // 长按轨道跟随期间，尺寸变化（如子元素增长/图片加载）需补发 jumpToPointer，
      // 否则指针静止时内容尺寸变化不会重算，跟随位置与鼠标脱节。
      if (state.trackPressAxis && state.trackPressPointer) {
        jumpToPointer(state, state.trackPressAxis, state.trackPressPointer, 'smooth');
      }
    });
    state.resizeObserver.observe(host);
    for (const child of host.children) state.resizeObserver.observe(child);
  }
  if (typeof MutationObserver !== 'undefined') {
    state.mutationObserver = new MutationObserver(mutations => {
      if (state.resizeObserver) {
        // 被移除的子元素不再观察：ResizeObserver 不会因元素脱离 DOM 自动停止，
        // 高频增删列表若不显式 unobserve，会持续持有已移除节点的引用形成泄漏
        for (const mutation of mutations) {
          for (const node of mutation.removedNodes) {
            if (node instanceof Element) state.resizeObserver.unobserve(node);
          }
        }
        // 新增的子元素补进观察集
        for (const child of host.children) state.resizeObserver.observe(child);
      }
      refreshAll(state);
      // 同上：长按跟随期间内容增删也需补发 jumpToPointer（smooth 过渡）
      if (state.trackPressAxis && state.trackPressPointer) {
        jumpToPointer(state, state.trackPressAxis, state.trackPressPointer, 'smooth');
      }
    });
    state.mutationObserver.observe(host, { childList: true, subtree: true, characterData: true });
  }

  refreshAll(state);
  // 挂载时布局可能尚未稳定（如模态框开启动画/字体加载），连续两帧后再刷新一次
  requestAnimationFrame(() => requestAnimationFrame(() => refreshAll(state)));
  // 悬停宿主即显示且常显（overlay 与宿主是兄弟节点，无法用 CSS :hover 后代选择器表达）；离开后倒计时隐藏
  const onHostMouseEnter = (): void => {
    state.hovering = true;
    refreshAll(state);
    showThumb(state);
  };
  const onHostMouseLeave = (): void => {
    state.hovering = false;
    if (state.dragAxis === null) scheduleHide(state);
  };
  host.addEventListener('mouseenter', onHostMouseEnter);
  host.addEventListener('mouseleave', onHostMouseLeave);
  state.disposers.push(() => {
    host.removeEventListener('mouseenter', onHostMouseEnter);
    host.removeEventListener('mouseleave', onHostMouseLeave);
  });
  if (state.options.autoHide === false) setThumbsVisible(state, true);
};

const unmountScrollbar = (host: HTMLElement): void => {
  const state = states.get(host);
  if (!state) return;
  cancelWheelAnim(state);
  state.resizeObserver?.disconnect();
  state.mutationObserver?.disconnect();
  if (state.hideTimer !== null) clearTimeout(state.hideTimer);
  for (const dispose of state.disposers) dispose();
  state.disposers = [];
  state.thumbs.y?.remove();
  state.thumbs.x?.remove();
  state.tracks.y?.remove();
  state.tracks.x?.remove();
  host.classList.remove(HOST_CLASS);
  host.style.removeProperty('scrollbar-width');
  host.style.removeProperty('-ms-overflow-style');
  host.style.removeProperty('overflow-x');
  host.style.removeProperty('overflow-y');
  states.delete(host);
};

export const vScrollbar: Directive<HTMLElement, ScrollbarBinding> = {
  mounted: (el, binding) => {
    mountScrollbar(el, binding.value, binding.modifiers);
  },
  updated: (el, binding) => {
    // Vue patch class 时会重写 className，把挂载时外加的宿主类抹掉（原生滚动条闪现），幂等补挂
    el.classList.add(HOST_CLASS);
    // 选项/修饰符变化时整体重建（指令选项变更频率低，重建成本可忽略）
    const prev = states.get(el);
    const next = el.parentElement ? buildState(el, el.parentElement, binding.value, binding.modifiers) : null;
    // 回调选项随渲染更新：onScroll 变化只做引用替换，无需销毁重建滚动条；
    // 典型场景：绑定值里的模板 ref 在挂载时尚未就绪（?. 取到 undefined），后续渲染传入真实回调，
    // 若不在此同步，早退分支会沿用挂载时的 undefined 导致 onScroll 永不触发。
    if (prev && next && prev.options.onScroll !== next.options.onScroll) {
      prev.options.onScroll = next.options.onScroll;
    }
    // 早退守卫须覆盖全部运行态选项：minThumbSize/autoHide/trackClick 任一变化若不重建，
    // 绑定新值会被静默冻结在挂载初值（此前的比较漏了这三项）。
    // direction 不在此比较——其唯一运行态影响已通过 resolveAxes 收敛进下方 axes 的 JSON 比较。
    if (
      prev &&
      next &&
      JSON.stringify(prev.axes) === JSON.stringify(next.axes) &&
      prev.options.showTrack === next.options.showTrack &&
      prev.options.endInset === next.options.endInset &&
      prev.options.edgeOffset === next.options.edgeOffset &&
      prev.options.minThumbSize === next.options.minThumbSize &&
      prev.options.autoHide === next.options.autoHide &&
      prev.options.trackClick === next.options.trackClick
    ) {
      return;
    }
    unmountScrollbar(el);
    mountScrollbar(el, binding.value, binding.modifiers);
  },
  beforeUnmount: el => unmountScrollbar(el),
};
