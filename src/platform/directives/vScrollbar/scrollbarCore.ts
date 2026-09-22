/**
 * 滚动条的共享内核：状态定义、量测/写入、显隐与气泡文案。
 *
 * 从 vScrollbar.ts 抽出（原 130~144、151、168~224、248~314、325~401、463~538、660~784、786~883 行）。
 *
 * 为什么这一层必须存在：drag / wheel / track / overlay 四个行为模块都要读写同一个 ScrollbarState，
 * 且都要触发 refreshAll / showThumb。把它们各自复制一份会造成循环依赖，
 * 故收敛成一个只依赖 geometry + roll 的枢纽；行为模块一律单向依赖本文件，依赖图保持无环。
 */

import { clamp } from '@/platform/utils/common';
import { SCROLL_INTERACTIVE_WINDOW_MS } from '@/platform/utils/constants';
import { alignRollCells } from '@/platform/utils/motion';

import { BUBBLE_ROLL_MS, makeBubbleCell, setBubbleCellChar, settleBubbleRoll } from './scrollbarBubbleRoll';
import {
  computeBubblePosition,
  computeThumbGeometry,
  getHostOffset,
  getLength,
  getScrollPos,
  THICKNESS,
} from './scrollbarGeometry';
import { BUBBLE_OFFSET } from './scrollbarTypes';

import type { BubbleRoller } from './scrollbarBubbleRoll';
import type { AxisMetrics, HostOffset } from './scrollbarGeometry';
import type {
  ScrollbarBubbleOptions,
  ScrollbarBubbleSize,
  ScrollbarOptions,
  ScrollbarScrollDetail,
} from './scrollbarTypes';

/** 气泡闲置自动隐藏的兜底时长（ms）：autoHide 为 false（拇指常显）时的默认值 */
const BUBBLE_FALLBACK_HIDE_MS = 1200;
/** 交互热区外扩（px）：可视粗细不变，命中范围四向扩展 */
const HIT_AREA = 4;

/** 归一化后的滚动气泡配置（buildState 内解析一次，运行态直接消费） */
export interface ResolvedBubbleOptions {
  enabled: boolean;
  format: (detail: ScrollbarScrollDetail) => string;
  axis: 'x' | 'y';
  offset: number;
  size: ScrollbarBubbleSize;
  roll: boolean;
  hideDelay: number | false;
  onlyInteractive: boolean;
}

/** 关闭态的气泡配置：bubble 省略 / false / { enabled:false } 都归一到此，运行态无需再判空值形态 */
const DISABLED_BUBBLE: ResolvedBubbleOptions = {
  enabled: false,
  format: () => '',
  axis: 'y',
  offset: BUBBLE_OFFSET,
  size: 'sm',
  roll: false,
  hideDelay: false,
  onlyInteractive: false,
};

/** 由修饰符与 options.direction 解析生效轴向（与 vScrollIntoView 约定一致）：
 *  - 同时写 .horizontal/.x 与 .vertical/.y → 双轴 ['x','y']
 *  - 仅写单一方向修饰符 → 该轴
 *  - 仅写 direction 选项 → 该轴
 *  - 均无（无修饰符、无 direction）→ 默认双轴 ['x','y']；各轴仅在确有溢出时由
 *    轴几何刷新（refreshAll）隐藏，对齐原生滚动条「仅在有可滚内容时出现」的限制 */
export const resolveAxes = (options: ScrollbarOptions, modifiers?: Record<string, boolean>): ('x' | 'y')[] => {
  const hasX = Boolean(modifiers?.['horizontal'] || modifiers?.['x']);
  const hasY = Boolean(modifiers?.['vertical'] || modifiers?.['y']);
  if (hasX && hasY) return ['x', 'y'];
  if (hasX) return ['x'];
  if (hasY) return ['y'];
  if (options.direction) return [options.direction];
  return ['x', 'y'];
};

/**
 * 解析气泡配置。
 * - 默认关闭：滚动气泡属观感增强，全局默认开启会改变所有既有滚动区的视觉；
 * - 默认轴取启用轴中的 'y'（只有横向滚动条时回落 'x'），与「纵轴为主」的直觉一致；
 * - 默认读数取所属轴进度百分比；默认隐藏时长跟随 autoHide（与滚动条同步淡出），
 *   拇指常显（autoHide:false）时回落 BUBBLE_FALLBACK_HIDE_MS——读数气泡本就该是瞬时的，
 *   跟随「常显」会让它永久停在屏幕上。
 */
export const resolveBubbleOptions = (
  value: ScrollbarOptions['bubble'],
  axes: ('x' | 'y')[],
  autoHide: number | false
): ResolvedBubbleOptions => {
  if (value === undefined || value === false) return DISABLED_BUBBLE;
  const opts: ScrollbarBubbleOptions = value === true ? {} : value;
  if (opts.enabled === false) return DISABLED_BUBBLE;
  const axis = opts.axis ?? (axes.includes('y') ? 'y' : 'x');
  return {
    enabled: true,
    // 参数显式标注类型：`??` 的上下文推导在部分 TS 版本下不会渗透到右侧箭头函数，会退化成隐式 any
    format:
      opts.format ??
      ((detail: ScrollbarScrollDetail) => `${Math.round((axis === 'y' ? detail.progressY : detail.progressX) * 100)}%`),
    axis,
    offset: opts.offset ?? BUBBLE_OFFSET,
    // 默认档位取 'sm'（既有观感，对齐 v-tooltip compact）；放大档由宿主显式声明
    size: opts.size ?? 'sm',
    // 翻页默认开：读数以「滚动条注释」身份出现，逐字符翻页让离散读数（页码等）的变化可辨，
    // 密集变化由 renderBubbleText 的间隔判据自动退化为直写
    roll: opts.roll ?? true,
    hideDelay: opts.hideDelay ?? (autoHide === false ? BUBBLE_FALLBACK_HIDE_MS : autoHide),
    onlyInteractive: opts.onlyInteractive ?? false,
  };
};

export interface ScrollbarState {
  host: HTMLElement;
  parent: HTMLElement;
  tracks: { y: HTMLElement | null; x: HTMLElement | null };
  thumbs: { y: HTMLElement | null; x: HTMLElement | null };
  /** 各轴当前拇指长度（px），供拖拽比例换算 */
  thumbLens: { y: number; x: number };
  /** 当前启用的轴向集合：默认（无修饰符/无 direction）为双轴 ['x','y'] */
  axes: ('x' | 'y')[];
  /** 滚动气泡元素（未启用时恒为 null）；与拇指/轨道同为 overlay 兄弟节点 */
  bubble: HTMLElement | null;
  /** 气泡内承载读数的子节点：气泡本体必须 overflow:visible（否则把指向箭头裁掉），省略号与文本写入都落在它身上 */
  bubbleLabel: HTMLElement | null;
  /** 最近一次写入气泡的文本：textContent 每次赋值都会让该节点失效，而滚动帧内读数常常连续多帧不变，先比对再写 */
  bubbleText: string;
  /** 读数翻页器（bubble.roll 开启时创建，见 BubbleRoller）；关闭时为 null，读数退化为一次 textContent */
  bubbleRoller: BubbleRoller | null;
  /** 所属轴上一次的滚动位置读数（判据见 attachHostScroll）；挂载取基线前为 null */
  bubbleAxisPos: number | null;
  /** 气泡闲置隐藏定时器；独立于拇指的 hideTimer——两者隐藏时长可分别配置，合并会互相拖累 */
  bubbleTimer: ReturnType<typeof setTimeout> | null;
  options: {
    direction?: 'x' | 'y';
    autoHide: number | false;
    minThumbSize: number;
    trackClick: 'page' | 'jump' | 'none';
    showTrack: boolean;
    endInset: number;
    edgeOffset: number;
    bubble: ResolvedBubbleOptions;
    onScroll?: (detail: ScrollbarScrollDetail) => void;
  };
  resizeObserver: ResizeObserver | null;
  mutationObserver: MutationObserver | null;
  /** 已登记进 resizeObserver 的直接子元素：内容增删时只补观察新增项，不再每次全量重观察 */
  observedChildren: WeakSet<Element>;
  /** 进行中的合帧刷新句柄：观察者路径同帧多次触发合并为一次几何重算 */
  refreshRaf: number | null;
  hideTimer: ReturnType<typeof setTimeout> | null;
  /** 指针是否悬停在宿主内：悬停期间拇指常显，不启动自动隐藏 */
  hovering: boolean;
  /** 最近一次用户滚动手势（pointerdown / wheel）的时间戳，用于判定 scroll 事件是否由用户交互发起 */
  lastInteractionAt: number;
  /** 滚轮转发的缓动动画：目标位置累积 + rAF 渐近（避免 smooth scrollBy 连续触发时互相打断丢距离） */
  wheelAnim: { top: number; left: number; raf: number } | null;
  /**
   * overlay 兜底滚轮的「一轮手势」跟踪（分轴记：两轴的 overlay 各自独立接收事件）。
   *
   * 用途是复刻 v-wheel-scroll 的 edgeLock 语义——**单次滚动锁**：
   *  - 宿主触边后，同一轮手势内继续由宿主独占（拦截但不再位移），只有新手势才让位给外层；
   *  - 让位之后，本轮余下事件（含反向回滑）一律不回收，否则外层正滚着又被宿主抓回去。
   * 判据与常量（EDGE_LOCK_MS）都与 v-wheel-scroll 对齐，两个落点（内容区 / 滚动条）手感才一致。
   * 时间戳统一取 performance.now（不用 e.timeStamp：部分环境它是 epoch 毫秒，基准不同）。
   */
  overlayWheelAt: { y: number | null; x: number | null };
  /** 本轮 overlay 手势是否已让位给外层滚动容器（语义见 overlayWheelAt）；判出新手势时复位 */
  overlayWheelHandedOff: { y: boolean; x: boolean };
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

export const states = new WeakMap<HTMLElement, ScrollbarState>();
/** 宿主标记类：隐藏原生滚动条的伪元素规则靠它兜底（伪元素无法内联设置），挂载/卸载路径共用 */
export const HOST_CLASS = 'v-scrollbar-host';

/** 注入一次性的全局样式：隐藏宿主原生滚动条 + 轨道/拇指视觉（伪元素无法内联设置） */
export const ensureGlobalStyle = (): void => {
  if (typeof document === 'undefined' || document.getElementById('v-scrollbar-style')) return;
  const style = document.createElement('style');
  style.id = 'v-scrollbar-style';
  style.textContent =
    `.${HOST_CLASS}{scrollbar-width:none;-ms-overflow-style:none;}` +
    `/* 滚动条专用拇指色：不复用 --text-disabled/--text-muted——暗色下后者因无障碍对比度被提亮导致两态几乎同色 */` +
    `:root{--v-scrollbar-thumb:#c7c7cc;--v-scrollbar-thumb-hover:#8e8e93;}` +
    `.dark{--v-scrollbar-thumb:#55555a;--v-scrollbar-thumb-hover:#a3a3ab;}` +
    `.${HOST_CLASS}::-webkit-scrollbar{display:none;}` +
    `/* 轨道颜色固定不随状态变化；默认仅透明隐藏（保留 visibility，否则收不到 hover/点击），悬停拇指/轨道时由指令切换可见类。
       隐藏态必须 pointer-events:none：否则透明轨道常驻吞掉宿主内缘指针事件（点击/滚动被拦截，探针命中内缘 2~13px）；可见时恢复 */` +
    `.v-scrollbar-track{position:absolute;z-index:var(--z-scrollbar-track);pointer-events:none;cursor:pointer;` +
    `background:var(--border-light);opacity:0;border-radius:999px;` +
    `transition:opacity 250ms ease,width 150ms ease,height 150ms ease,transform 150ms ease;}` +
    `.v-scrollbar-track--visible{opacity:1;pointer-events:auto;}` +
    `/* 轨道粗细由类控制，与拇指同步加宽内移（thumb:hover ~ track 兄弟选择器，保持同心） */` +
    `.v-scrollbar-track--y{width:${THICKNESS}px;}` +
    `.v-scrollbar-track--x{height:${THICKNESS}px;}` +
    `.v-scrollbar-thumb--y:hover ~ .v-scrollbar-track--y,.v-scrollbar-track--y:hover{width:${THICKNESS + 1}px;transform:translateX(-1px);}` +
    `.v-scrollbar-thumb--x:hover ~ .v-scrollbar-track--x,.v-scrollbar-track--x:hover{height:${THICKNESS + 1}px;transform:translateY(-1px);}` +
    `/* 轨道热区四向外扩：粗细方向上边缘侧的 EDGE 间隙也纳入交互区，不留死角 */` +
    `.v-scrollbar-track::after{content:'';position:absolute;inset:-${HIT_AREA}px;}` +
    `.v-scrollbar-thumb{position:absolute;z-index:var(--z-scrollbar-thumb);border-radius:999px;pointer-events:auto;cursor:pointer;` +
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
    `.v-scrollbar-thumb--off{opacity:0 !important;visibility:hidden !important;pointer-events:none !important;}` +
    `/* 滚动气泡提示：同为 overlay 兄弟节点（绝对定位参照宿主父元素），随拇指中位移动；
       观感对齐 v-tooltip 的 compact 紧凑读数（同底色/描边/圆角/字号字重 + 同源的指向箭头），但刻意不复用 tooltip 单例——
       tooltip 在任意 scroll 事件上都会立即隐藏（vTooltip 的 window 捕获监听），承担不了「滚动期间持续可见」的读数职责。
       max-width:100%：超长自定义文案收敛在宿主可视区内（钳制按半高上界，见 BUBBLE_HALF_SIZE）；
       气泡自身 overflow:visible —— 箭头楔形朝滚动条一侧探出，若沿用 overflow:hidden 会被整个裁掉，
       故省略号另落内层 .v-scrollbar-bubble-text（读数本就写在它上面，见 applyBubble） */` +
    `.v-scrollbar-bubble{position:absolute;z-index:var(--z-scrollbar-bubble);pointer-events:none;white-space:nowrap;` +
    `overflow:visible;max-width:100%;` +
    `border:1px solid var(--glass-border);` +
    `background:var(--bg-panel);box-shadow:var(--shadow-md);color:var(--text-title);` +
    `font-weight:700;line-height:1.25;` +
    `opacity:0;visibility:hidden;transition:opacity 150ms ease,visibility 0s linear 150ms;}` +
    `/* 档位只管度量（字号/留白/圆角）：底色描边等观感两档共用，与 tooltip compact 逐值对齐（sm） */` +
    `.v-scrollbar-bubble--sm{padding:0.125rem 0.5rem;border-radius:0.375rem;font-size:0.625rem;}` +
    `.v-scrollbar-bubble--md{padding:0.25rem 0.75rem;border-radius:0.5rem;font-size:0.75rem;}` +
    `/* 读数承载节点（renderBubbleText 的写入目标）：省略号落在这里，气泡本体才能保持 overflow:visible；
       开启翻页时它是单元节点的宿主，关闭时就是一个纯文本节点。
       --br-duration 写在这里：全局 .br-roll-* 用它定时长，别处不再重复这个数字 */` +
    `.v-scrollbar-bubble-text{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;` +
    `--br-duration:${BUBBLE_ROLL_MS / 1000}s;}` +
    `/* 逐字符翻页的单元/字符两层：结构同 BaseRollingText 的逐字符模式（inline-block 窗口 + overflow:hidden 裁切上下滑行），
       line-height 继承气泡（窗口高即行高，字形位置与不开翻页时逐像素一致）；
       过渡类 .br-roll-* 在 transitions.scss——与组件共用的唯一来源，此处刻意不重复声明 */` +
    `.v-scrollbar-bubble-cell{position:relative;display:inline-block;overflow:hidden;white-space:pre;line-height:inherit;vertical-align:top;}` +
    `.v-scrollbar-bubble-char{display:inline-block;}` +
    `/* 指向箭头：方块尺寸/旋转/裁剪楔形/保留边框全部由 buildFloatingArrowStyle 内联写入
       （与 BasePopover、vTooltip 同一份逻辑），交叉轴居中偏移也在创建时按边长内联算出 */` +
    `.v-scrollbar-bubble-arrow{pointer-events:none;}` +
    `.v-scrollbar-bubble--visible{opacity:1;visibility:visible;transition:opacity 150ms ease,visibility 0s;}` +
    `/* 伸缩方向：纵向滚动条贴容器右缘，气泡整宽向左展开；横向滚动条贴容器下缘，气泡向上展开 */` +
    `.v-scrollbar-bubble--y{transform:translate(-100%,-50%);}` +
    `.v-scrollbar-bubble--x{transform:translate(-50%,-100%);}` +
    `/* 所属轴无溢出（与拇指同一判据）：结构性隐藏，优先级高于可见类 */` +
    `.v-scrollbar-bubble--off{opacity:0 !important;visibility:hidden !important;}`;
  document.head.appendChild(style);
};

/** 拇指可见类切换（overlay 与宿主是兄弟关系，显隐必须落在拇指自身类上） */
const THUMB_VISIBLE_CLASS = 'v-scrollbar-thumb--visible';
/** 无可滚动区域的结构性隐藏类（优先级高于可见类，transition:none 硬切） */
const THUMB_OFF_CLASS = 'v-scrollbar-thumb--off';
/** 轨道可见类：仅悬停拇指/轨道时显示 */
const TRACK_VISIBLE_CLASS = 'v-scrollbar-track--visible';
/** 气泡可见类（与拇指各管各的：气泡只在滚动时出现，不随悬停显形） */
const BUBBLE_VISIBLE_CLASS = 'v-scrollbar-bubble--visible';
/** 气泡所属轴无溢出的结构性隐藏类（与拇指同一判据，优先级高于可见类） */
const BUBBLE_OFF_CLASS = 'v-scrollbar-bubble--off';

/** 读数阶段：滚动尺寸 / 位置 + 拇指几何；thumb 缺失时返回 null（该轴不参与写入） */
const measureAxis = (state: ScrollbarState, axis: 'x' | 'y'): AxisMetrics | null => {
  const { host, options } = state;
  if (!state.thumbs[axis]) return null;
  const scrollLength = getLength(host, axis, 'scroll');
  const clientLength = getLength(host, axis, 'client');
  const scrollPos = getScrollPos(host, axis);
  // 拇指行程两端各内缩 endInset，与轨道首尾留白对齐；滚动比例分母必须是真实可滚动量
  // （scrollLength - clientLength），否则行程内缩会让滚到底时拇指无法占满行程
  const { thumbSize, thumbOffset } = computeThumbGeometry(
    scrollLength,
    clientLength - 2 * options.endInset,
    scrollPos,
    options.minThumbSize,
    Math.max(0, scrollLength - clientLength)
  );
  return {
    thumbSize,
    thumbOffset,
    hidden: scrollLength <= clientLength || thumbSize <= 0,
    scrollLength,
    clientLength,
    scrollPos,
  };
};

/** 写入阶段：按读数写 overlay 几何（overlay 覆盖宿主可视区；拇指位置按滚动比例映射；no-track 模式下跳过轨道定位）。
 *  本函数只做 style / class 写入，中间不再读任何布局属性——读全在 measureAxis 完成，见 refreshAll 注释。 */
const applyAxis = (state: ScrollbarState, axis: 'x' | 'y', off: HostOffset, m: AxisMetrics): void => {
  const { endInset, edgeOffset } = state.options;
  const thumb = state.thumbs[axis]!;
  const track = state.tracks[axis];
  const relTop = off.top;
  const relLeft = off.left;
  const relRight = off.left + off.width;
  const relBottom = off.top + off.height;
  const { thumbSize, thumbOffset, hidden } = m;
  state.thumbLens[axis] = thumbSize;
  // 无可滚动区域时结构性隐藏（off 类硬切）；有滚动区域时交给可见类做淡入淡出
  thumb.classList.toggle(THUMB_OFF_CLASS, hidden);
  // a11y（V11）：role=scrollbar 的动态值随每次几何刷新同步
  if (hidden) thumb.setAttribute('aria-valuenow', '0');
  else {
    const scrollLength = getLength(state.host, axis, 'scroll');
    const clientLength = getLength(state.host, axis, 'client');
    const max = Math.max(0, scrollLength - clientLength);
    thumb.setAttribute('aria-valuemax', String(max));
    thumb.setAttribute('aria-valuenow', String(Math.round(getScrollPos(state.host, axis))));
  }

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

/**
 * 把读数写进气泡读数节点。
 *
 * 开启翻页时按字符对位复用单元节点——未变的字符节点原地不动（天然静止），只有变化的字符翻页；
 * 关闭翻页时就是一次 textContent（与引入翻页前一致）。两种路径都不碰气泡本体：那里还挂着指向箭头，
 * 直接写 textContent 会把箭头一起抹掉。
 */
const renderBubbleText = (state: ScrollbarState, label: HTMLElement, text: string): void => {
  const roller = state.bubbleRoller;
  if (!roller) {
    label.textContent = text;
    return;
  }
  settleBubbleRoll(roller);
  // 变化间隔小于一次翻页时长的读数（如进度百分比逐帧跳字）不翻页：逐帧重启过渡只会变成持续抖动，
  // 而连续读数本就无「离散变化」可读。只在读数稳定后的下一次变化翻页——页码这类离散读数即此情形
  const now = Date.now();
  const roll = now - roller.lastChangeAt >= BUBBLE_ROLL_MS;
  roller.lastChangeAt = now;

  const aligned = alignRollCells(roller.cells, text, roller.nextKey);
  const prevNodes = new Map<number, HTMLElement>();
  const prevChars = new Map<number, string>();
  roller.cells.forEach((cell, i) => {
    prevNodes.set(cell.key, roller.nodes[i]!);
    prevChars.set(cell.key, cell.char);
  });

  const nodes: HTMLElement[] = [];
  for (const cell of aligned.cells) {
    const existing = prevNodes.get(cell.key);
    if (!existing) {
      // 新槽位（读数变长）：直接呈现、不播翻页——与组件版一致，新窗口是初始渲染
      nodes.push(makeBubbleCell(cell.char));
      continue;
    }
    if (prevChars.get(cell.key) !== cell.char) setBubbleCellChar(roller, existing, cell.char, roll);
    nodes.push(existing);
  }
  // 消失的单元（读数变短）：此时已 settle，节点内只剩当前字符，直接摘除
  for (const [key, node] of prevNodes) if (!aligned.cells.some(c => c.key === key)) node.remove();

  // 顺序对齐：只在真的错位时移动，未变字符的节点不重排（重排会让它们闪动）
  nodes.forEach((node, i) => {
    if (label.children[i] !== node) label.insertBefore(node, label.children[i] ?? null);
  });

  roller.cells = aligned.cells;
  roller.nodes = nodes;
  roller.nextKey = aligned.nextKey;
};

/**
 * 由本次已读到的轴读数拼装滚动明细（供气泡 format 消费）。
 *
 * 刻意复用 measureAxis 的读数而不是重新读宿主：refreshAll 是每帧热路径，任何额外布局读都可能
 * 触发强制同步回流；这里只做已读数字的算术。
 */
const buildBubbleDetail = (state: ScrollbarState, metrics: (AxisMetrics | null)[]): ScrollbarScrollDetail => {
  const pick = (axis: 'x' | 'y'): AxisMetrics | null => metrics[state.axes.indexOf(axis)] ?? null;
  const my = pick('y');
  const mx = pick('x');
  const maxScrollTop = my ? Math.max(0, my.scrollLength - my.clientLength) : 0;
  const maxScrollLeft = mx ? Math.max(0, mx.scrollLength - mx.clientLength) : 0;
  const scrollTop = my ? clamp(my.scrollPos, 0, maxScrollTop) : 0;
  const scrollLeft = mx ? clamp(mx.scrollPos, 0, maxScrollLeft) : 0;
  return {
    scrollTop,
    scrollLeft,
    maxScrollTop,
    maxScrollLeft,
    progressY: maxScrollTop > 0 ? scrollTop / maxScrollTop : 0,
    progressX: maxScrollLeft > 0 ? scrollLeft / maxScrollLeft : 0,
    interactive: Date.now() - state.lastInteractionAt < SCROLL_INTERACTIVE_WINDOW_MS,
  };
};

/**
 * 写入阶段：几何 + 文案。
 *
 * 与 applyAxis 同属「只写不读」——位置全部来自已测读数，文本仅在内容变化时赋值
 * （textContent 每次赋值都会让该节点失效，而滚动帧内读数常常连续多帧不变）。
 * 所属轴无溢出时与拇指一同结构性隐藏，避免气泡孤零零停在无滚动条的容器旁。
 */
const applyBubble = (state: ScrollbarState, off: HostOffset, metrics: (AxisMetrics | null)[]): void => {
  const { bubble } = state;
  if (!bubble) return;
  const { axis, offset, format } = state.options.bubble;
  const m = metrics[state.axes.indexOf(axis)];
  if (!m) return;
  bubble.classList.toggle(BUBBLE_OFF_CLASS, m.hidden);
  const pos = computeBubblePosition(axis, off, m, {
    endInset: state.options.endInset,
    edgeOffset: state.options.edgeOffset,
    offset,
  });
  bubble.style.left = `${pos.left}px`;
  bubble.style.top = `${pos.top}px`;
  const text = format(buildBubbleDetail(state, metrics));
  if (text !== state.bubbleText && state.bubbleLabel) {
    renderBubbleText(state, state.bubbleLabel, text);
    state.bubbleText = text;
  }
};

/**
 * 刷新全部启用轴：**先把读做完，再统一写**。
 *
 * refreshAll 挂在宿主 scroll 事件上（全指令调用频率最高的路径）。若按轴「读 → 写 → 读 → 写」，
 * 双轴时两次布局读之间夹着上一轴写下的 style，浏览器无法沿用上一次布局结果，两次读各要强制同步回流一次。
 * 读操作（宿主偏移 + 各轴滚动尺寸/位置）与轴无关地先取齐，写入阶段就只剩 style / class 赋值。
 * 宿主偏移沿 offsetParent 链累加，与轴无关，双轴共用一次即可（原来每轴各算一遍）。
 */
export const refreshAll = (state: ScrollbarState): void => {
  if (state.axes.length === 0) return;
  // overlay 挂在宿主父元素上（absolute 定位参照父元素），坐标为父元素相对布局坐标
  const off = getHostOffset(state.host, state.parent);
  const metrics = state.axes.map(axis => measureAxis(state, axis));
  for (let i = 0; i < state.axes.length; i++) {
    const m = metrics[i];
    if (m) applyAxis(state, state.axes[i]!, off, m);
  }
  // 气泡几何/文案随滚动与尺寸变化同步刷新：未启用时 state.bubble 为 null，热路径上零开销
  applyBubble(state, off, metrics);
};

/**
 * 拇指显隐切换：overlay 与宿主是兄弟关系，显隐必须落在拇指自身类上。
 *
 * 「拇指隐藏」同时把气泡一并收起：气泡是滚动条的注释，滚动条都已淡出，读数再停留就是孤悬的半截提示。
 * 两者各自计时且气泡侧可能长得多（宿主常按读数节奏把 hideDelay 配得比 autoHide 大，如页码读数 1200ms vs 400ms），
 * 各按各路走就会留下一段「滚动条没了、气泡还挂着」的残留窗口——把上界收敛在此处（而不是散在调用点），
 * 将来新增拇指隐藏路径也无需记得补一句。
 */
export const setThumbsVisible = (state: ScrollbarState, visible: boolean): void => {
  for (const t of [state.thumbs.y, state.thumbs.x]) t?.classList.toggle(THUMB_VISIBLE_CLASS, visible);

  if (!visible) hideBubble(state);
};

export const setTracksVisible = (state: ScrollbarState, visible: boolean): void => {
  for (const t of [state.tracks.y, state.tracks.x]) t?.classList.toggle(TRACK_VISIBLE_CLASS, visible);
};

/** 启动自动隐藏倒计时（仅离开宿主后） */
export const scheduleHide = (state: ScrollbarState): void => {
  if (state.options.autoHide === false) return;
  if (state.hideTimer !== null) clearTimeout(state.hideTimer);
  state.hideTimer = setTimeout(() => {
    // 气泡随拇指一并收起：本轮隐藏由 setThumbsVisible 统一兜住（见该函数注释）
    setThumbsVisible(state, false);
    state.hideTimer = null;
  }, state.options.autoHide);
};

/** 显示滚动条；悬停宿主或拖拽中常显，否则启动自动隐藏 */
export const showThumb = (state: ScrollbarState): void => {
  setThumbsVisible(state, true);
  if (state.hideTimer !== null) {
    clearTimeout(state.hideTimer);
    state.hideTimer = null;
  }
  if (!state.hovering && state.dragAxis === null) scheduleHide(state);
};

/**
 * 显示滚动气泡并重置其闲置倒计时。
 *
 * 只由「发生滚动」触发（宿主 scroll 事件上派发），不由悬停触发——把鼠标移进滚动区就弹读数会糊屏；
 * 隐藏时长按自身 hideDelay 计时（见 resolveBubbleOptions 的默认），但**上限是滚动条的可见期**：
 * 拇指一旦自动隐藏（scheduleHide）就一并把气泡收起，不存在「滚动条没了、读数还挂着」的窗口。
 */
export const showBubble = (state: ScrollbarState): void => {
  if (!state.bubble) return;
  const { hideDelay } = state.options.bubble;
  state.bubble.classList.add(BUBBLE_VISIBLE_CLASS);
  if (state.bubbleTimer !== null) {
    clearTimeout(state.bubbleTimer);
    state.bubbleTimer = null;
  }
  if (hideDelay === false) return;
  state.bubbleTimer = setTimeout(() => {
    state.bubbleTimer = null;
    state.bubble?.classList.remove(BUBBLE_VISIBLE_CLASS);
  }, hideDelay);
};

/** 立即收起气泡并清掉倒计时（卸载 / 无溢出 / 滚动条自动隐藏时调用；不直接摘可见类会留下游离定时器） */
export const hideBubble = (state: ScrollbarState): void => {
  if (state.bubbleTimer !== null) {
    clearTimeout(state.bubbleTimer);
    state.bubbleTimer = null;
  }
  state.bubble?.classList.remove(BUBBLE_VISIBLE_CLASS);
};

/**
 * 打上「最近一次用户滚动手势」时间戳，供 onScroll 明细与气泡的 interactive 判定。
 *
 * 除宿主自身的 pointerdown / wheel 外，拇指拖拽与轨道点击也必须打点：overlay 是宿主的**兄弟节点**，
 * 落在拇指 / 轨道上的指针事件不会冒泡到宿主，而它们引发的滚动同样是用户手势。
 * 拖拽与长按跟随还需在每次指针移动时补打——SCROLL_INTERACTIVE_WINDOW_MS 只有 120ms，
 * 远短于一次慢速拖拽，只在起点打点会让拖到一半就退化成「非交互滚动」（气泡随之提前淡出）。
 */
export const stampInteraction = (state: ScrollbarState): void => {
  state.lastInteractionAt = Date.now();
};
