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
 */
import { isWheelScrollSeen } from '@/platform/directives/vWheelScroll';
import { buildFloatingArrowStyle } from '@/platform/ui/popover/floatingArrow';
import { SCROLL_INTERACTIVE_WINDOW_MS } from '@/platform/utils/constants';
import { resolveScrollBehavior } from '@/platform/utils/motion';
import { alignRollCells } from '@/platform/utils/rollingText';

import type { RollCell } from '@/platform/utils/rollingText';
import type { CSSProperties, Directive } from 'vue';

export interface ScrollbarOptions {
  /** 轨道/拇指 overlay 的挂载容器：默认取宿主父元素。
   *  Vue 托管的容器（其子节点由 v-if/Transition 动态切换，如浮层面板宿主）必须显式传入一个
   *  独立的、模板内无子节点的稳定容器——把外来节点追加进 Vue 会 diff 的容器，
   *  会破坏补丁锚点（切换子节点时触发 insertBefore NotFoundError） */
  overlayParent?: HTMLElement | null | (() => HTMLElement | null | undefined);
  /** 是否启用指令；false 时整体惰性——不注入样式、不挂 overlay、不注册状态（默认 true）。
   *  供「指令必须常驻模板、启用与否由运行时 prop 决定」的宿主（如 BasePopover 面板）使用，
   *  避免在 <Transition> 内用 v-if/v-else 双分支切换指令挂载（会触发锚点补丁错误） */
  enabled?: boolean;
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
  /** 滚动气泡提示：true 默认档（滚动进度百分比）/ false·省略 关闭（默认关，避免改变既有滚动区观感）/
   *  选项对象自定义文案与观感，见 ScrollbarBubbleOptions */
  bubble?: boolean | ScrollbarBubbleOptions;
  /** 每次滚动回调：携带位置与双轴进度（原生 scroll 事件只有裸位置、无进度与手势判定，此处集中提供） */
  onScroll?: (detail: ScrollbarScrollDetail) => void;
}

/**
 * 滚动气泡提示：滚动期间在滚动条旁浮出一枚读数气泡，随拇指中位移动，带指向滚动条的箭头，
 * 读数变化时逐字符翻页，闲置后随滚动条一起淡出——生命周期以滚动条的可见期为上界（拇指隐藏即一并收起，见 setThumbsVisible）。
 *
 * 触发与「拇指常显 / 轨道悬停显形」解耦——气泡只在发生滚动时出现，单纯把鼠标移进滚动区不会弹提示，
 * 避免每一次指向滚动区都糊上一块读数。且只认所属轴（见 axis）：双轴可滚的宿主里滚另一轴时读数没变，
 * 那时显形等于展示一份陈旧读数。默认读数取所属轴的滚动进度百分比。
 */
export interface ScrollbarBubbleOptions {
  /** 是否启用；对象形式下显式传 false 可关闭（省略即开启） */
  enabled?: boolean;
  /**
   * 文案生成：入参为本次滚动明细（位置 + 双轴进度 + 是否用户手势），返回气泡文本。
   * 返回值按纯文本写入（textContent，不解析 HTML），故可安全承载外部数据。
   * 默认显示所属轴进度百分比（如 "42%"）；宿主可据此渲染「第 3 组 · 42%」等自算读数。
   */
  format?: (detail: ScrollbarScrollDetail) => string;
  /** 气泡所属轴（同时也是读数归属轴）：默认取启用轴中的 'y'（只有横向滚动条时回落 'x'）。
   *  只有该轴真的位移时气泡才显形——见 ScrollbarBubbleOptions 的说明 */
  axis?: 'x' | 'y';
  /** 气泡与滚动条之间的间距（px），默认 12；箭头由气泡朝滚动条一侧探出，占其中的一小段 */
  offset?: number;
  /** 观感档位：'sm' 紧凑读数（默认，对齐 v-tooltip 的 compact）/ 'md' 放大一档（字号与留白各进一级） */
  size?: ScrollbarBubbleSize;
  /** 读数变化时逐字符翻页（旧字上滑离场、新字自下滑入），复用 BaseRollingText 的对位算法与过渡类。
   *  默认开。变化密集时（如逐帧跳字的百分比读数）自动退化为直接换字——逐帧重启过渡只会变成持续抖动；
   *  长文案（读数本身比气泡宽、依赖省略号收敛）也建议关掉：翻页要求逐字成格，省略号的表现会打折。 */
  roll?: boolean;
  /** 闲置后自动淡出的毫秒数；false 表示不按自身节奏倒计时。
   *  默认跟随 autoHide（与滚动条同步淡出）；autoHide 为 false（拇指常显）时回落 1200ms。
   *  注意与拇指 autoHide 独立计时：气泡自身时限再长也活不过滚动条，拇指一隐藏即被一并收起 */
  hideDelay?: number | false;
  /** 仅在用户滚动手势（滚轮 / 拖拽拇指 / 轨道点击）引发的滚动中显示，
   *  过滤掉程序化 scrollTo、布局钳位、选中项 scrollIntoView 等非手势滚动；默认 false */
  onlyInteractive?: boolean;
}

/** 气泡观感档位：'sm' 紧凑读数（默认）/ 'md' 放大一档；两档均在注入样式里各有一条规则，见 ensureGlobalStyle */
export type ScrollbarBubbleSize = 'sm' | 'md';

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
  /** 本次滚动是否由用户交互发起（最近一次用户手势落在 SCROLL_INTERACTIVE_WINDOW_MS 窗口内）：
   *  用户手势含宿主内 pointerdown / wheel、拇指拖拽、轨道点击与长按跟随（后两者持续补打点，
   *  故整个手势过程恒为 true）；false 表示布局钳位 / 程序化设位（如调整字号、内容增删、scrollTo），
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
 *    轴几何刷新（refreshAll）隐藏，对齐原生滚动条「仅在有可滚内容时出现」的限制 */
const resolveAxes = (options: ScrollbarOptions, modifiers?: Record<string, boolean>): ('x' | 'y')[] => {
  const hasX = !!(modifiers?.['horizontal'] || modifiers?.['x']);
  const hasY = !!(modifiers?.['vertical'] || modifiers?.['y']);
  if (hasX && hasY) return ['x', 'y'];
  if (hasX) return ['x'];
  if (hasY) return ['y'];
  if (options.direction) return [options.direction];
  return ['x', 'y'];
};

/** 滚动气泡与滚动条之间的默认间距（px）；导出供测试从常量推导期望值 */
export const BUBBLE_OFFSET = 12;
/** 气泡指向箭头的边长（px，按档位取）：随气泡高度成比例——小气泡挂 12px 大箭头会盖住读数 */
export const BUBBLE_ARROW_SIZE: Record<ScrollbarBubbleSize, number> = { sm: 8, md: 10 };
/** 气泡闲置自动隐藏的兜底时长（ms）：autoHide 为 false（拇指常显）时的默认值 */
const BUBBLE_FALLBACK_HIDE_MS = 1200;
/** 气泡读数单次翻页的时长（ms）：注入样式把它写成读数节点上的 --br-duration，
 *  供全局 .br-roll-*（与 BaseRollingText 共用的那份过渡规则）读取——不复用其兜底值，
 *  免得时长这个数字在两处各写一份。与 BaseRollingText 的默认 duration 一致 */
const BUBBLE_ROLL_MS = 200;
/** 翻页收尾宽限（ms）：过渡结束与摘除离场节点之间留一点余量，不在动画最后一帧抢跑 */
const BUBBLE_ROLL_SETTLE_SLACK_MS = 40;
/** 翻页过渡的类名：与 transitions.scss 的 .br-roll-* 逐字同名（全局规则按名匹配，改这里必须同步改那边） */
const ROLL_ENTER_FROM_CLASS = 'br-roll-enter-from';
const ROLL_ENTER_ACTIVE_CLASS = 'br-roll-enter-active';
const ROLL_LEAVE_ACTIVE_CLASS = 'br-roll-leave-active';
const ROLL_LEAVE_TO_CLASS = 'br-roll-leave-to';
/** 气泡单行读数的半高上界（px）：仅用于两端钳制——单行 nowrap 读数实际半高更小，
 *  取上界可保证钳制后气泡完整落在宿主可视区内（宁可多留白，不可越界被裁） */
const BUBBLE_HALF_SIZE = 16;

/** 归一化后的滚动气泡配置（buildState 内解析一次，运行态直接消费） */
interface ResolvedBubbleOptions {
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

/**
 * 解析气泡配置。
 * - 默认关闭：滚动气泡属观感增强，全局默认开启会改变所有既有滚动区的视觉；
 * - 默认轴取启用轴中的 'y'（只有横向滚动条时回落 'x'），与「纵轴为主」的直觉一致；
 * - 默认读数取所属轴进度百分比；默认隐藏时长跟随 autoHide（与滚动条同步淡出），
 *   拇指常显（autoHide:false）时回落 BUBBLE_FALLBACK_HIDE_MS——读数气泡本就该是瞬时的，
 *   跟随「常显」会让它永久停在屏幕上。
 */
const resolveBubbleOptions = (
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
    `/* 轨道颜色固定不随状态变化；默认仅透明隐藏（保留 visibility，否则收不到 hover/点击），悬停拇指/轨道时由指令切换可见类。
       隐藏态必须 pointer-events:none：否则透明轨道常驻吞掉宿主内缘指针事件（点击/滚动被拦截，探针命中内缘 2~13px）；可见时恢复 */` +
    `.v-scrollbar-track{position:absolute;z-index:29;pointer-events:none;cursor:pointer;` +
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
    `.v-scrollbar-thumb--off{opacity:0 !important;visibility:hidden !important;pointer-events:none !important;}` +
    `/* 滚动气泡提示：同为 overlay 兄弟节点（绝对定位参照宿主父元素），随拇指中位移动；
       观感对齐 v-tooltip 的 compact 紧凑读数（同底色/描边/圆角/字号字重 + 同源的指向箭头），但刻意不复用 tooltip 单例——
       tooltip 在任意 scroll 事件上都会立即隐藏（vTooltip 的 window 捕获监听），承担不了「滚动期间持续可见」的读数职责。
       max-width:100%：超长自定义文案收敛在宿主可视区内（钳制按半高上界，见 BUBBLE_HALF_SIZE）；
       气泡自身 overflow:visible —— 箭头楔形朝滚动条一侧探出，若沿用 overflow:hidden 会被整个裁掉，
       故省略号另落内层 .v-scrollbar-bubble-text（读数本就写在它上面，见 applyBubble） */` +
    `.v-scrollbar-bubble{position:absolute;z-index:31;pointer-events:none;white-space:nowrap;` +
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
  let reachedParent = false;
  while (el) {
    if (el === parent) {
      reachedParent = true;
      break;
    }
    left += el.offsetLeft;
    top += el.offsetTop;
    el = el.offsetParent as HTMLElement | null;
  }
  if (!reachedParent) {
    // 不变式兜底（V7）：offsetParent 链未终止于 parent（如 overlayParent 指向非定位祖先、
    // 或中间有 transform/fixed 元素改变 offsetParent 链）时，链式累加结果是错的。
    // 回落到 rect 差值：无过渡变换时结果正确；过渡期间可能有偏差，但好于必然错误的累加值。
    const hr = host.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    left = hr.left - pr.left;
    top = hr.top - pr.top;
  }
  return { left, top, width: host.offsetWidth, height: host.offsetHeight };
};

/** 宿主在父元素内的布局坐标与可视尺寸（一次读数，双轴共用） */
type HostOffset = ReturnType<typeof getHostOffset>;

/** 单轴几何读数（纯读，不写 DOM） */
interface AxisMetrics {
  thumbSize: number;
  thumbOffset: number;
  hidden: boolean;
  /** 该轴本次读到的滚动长度 / 视口长度 / 滚动位置：刷新路径已经读过一次，气泡读数直接取用，
   *  避免在每帧刷新里为拼装滚动明细再读一遍布局（多一次读就多一次强制同步回流风险） */
  scrollLength: number;
  clientLength: number;
  scrollPos: number;
}

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
  if (hidden) {
    thumb.setAttribute('aria-valuenow', '0');
  } else {
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
 * 纯几何：滚动气泡在 overlay 坐标系中的落点（元素自身用 left/top 定位，伸缩方向由类上的
 * translate 固定：纵向滚动条贴容器右缘、气泡整宽向左展开；横向滚动条贴下缘、气泡向上展开）。
 *
 * 沿轴坐标吸附在拇指中位，并按 BUBBLE_HALF_SIZE 两端钳制：滚到顶/底时气泡改贴宿主边缘而不越界
 * ——overlay 的父元素常带 overflow:hidden，越界即被裁掉半个气泡。
 */
export const computeBubblePosition = (
  axis: 'x' | 'y',
  off: HostOffset,
  m: Pick<AxisMetrics, 'thumbSize' | 'thumbOffset'>,
  opts: { endInset: number; edgeOffset: number; offset: number }
): { left: number; top: number } => {
  const { endInset, edgeOffset, offset } = opts;
  const thumbCenter = m.thumbOffset + m.thumbSize / 2;
  const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);
  if (axis === 'y') {
    // 轨道/拇指贴容器右缘，几何与 applyAxis 的 track.left 同源
    const railLeft = off.left + off.width - THICKNESS - edgeOffset;
    return {
      left: railLeft - offset,
      top: clamp(off.top + endInset + thumbCenter, off.top + BUBBLE_HALF_SIZE, off.top + off.height - BUBBLE_HALF_SIZE),
    };
  }
  const railTop = off.top + off.height - THICKNESS - edgeOffset;
  return {
    left: clamp(
      off.left + endInset + thumbCenter,
      off.left + BUBBLE_HALF_SIZE,
      off.left + off.width - BUBBLE_HALF_SIZE
    ),
    top: railTop - offset,
  };
};

/** 进行一次翻页的单元记录：该单元内的离场/入场字符节点 */
interface PendingRoll {
  leaving: HTMLElement;
  entering: HTMLElement;
}

/**
 * 气泡读数的翻页器：把读数变化渲染成「旧字上滑离场、新字自下滑入」，观感与 BaseRollingText 逐字符模式一致。
 *
 * 为什么不直接复用它那个组件：气泡是指令内 document.createElement 造出来的纯 DOM 节点，不在 Vue 组件树里，
 * 要用组件就得为每个滚动区单开一个 Vue 应用（createApp + 响应式实例），既让底层指令反向依赖 UI 组件，
 * 又把「谁拥有这段 DOM」搅成两套所有权。所以这里复用的是**可复用的那部分**：
 * 过渡规则（全局 .br-roll-*，见 transitions.scss）与字符对位算法（alignRollCells，见 rollingText.ts），
 * 只有「怎么驱动过渡」这一层是各写各的——Vue 侧交给 <Transition>，这里手工按帧切类。
 */
interface BubbleRoller {
  /** 当前字符单元（与 nodes 一一对应，供 alignRollCells 对位） */
  cells: RollCell[];
  /** 与 cells 一一对应的单元节点 */
  nodes: HTMLElement[];
  /** 新槽位的 key 游标：让 alignRollCells 保持无状态 */
  nextKey: number;
  /** 最近一次读数变化的时刻：变化密集时不翻页（见 renderBubbleText） */
  lastChangeAt: number;
  /** 进行中的翻页：新读数到来时先收尾，让节点结构回到「一单元一字符」 */
  pending: PendingRoll[];
  /** 收尾定时器（过渡结束后摘除离场节点） */
  timer: ReturnType<typeof setTimeout> | null;
}

/** 造一个单元节点：窗口 + 字符两层（静态样式见注入样式里的 .v-scrollbar-bubble-cell/char） */
const makeBubbleCell = (char: string): HTMLElement => {
  const cell = document.createElement('span');
  cell.className = BUBBLE_CELL_CLASS;
  const ch = document.createElement('span');
  ch.className = BUBBLE_CHAR_CLASS;
  ch.textContent = char;
  cell.appendChild(ch);
  return cell;
};

/**
 * 结束进行中的翻页：摘除离场节点、去掉入场节点的过渡类（此刻它已是当前字符），并撤销收尾定时器。
 * 提前收尾（新读数在动画中途到来）会让做了一半的翻页瞬移到终态——读数即时性优先于动画完整，
 * 且此处只由「新读数」或「卸载」调用，静止时不会有人清它，不会留下半张的节点。
 */
const settleBubbleRoll = (roller: BubbleRoller): void => {
  if (roller.timer !== null) {
    clearTimeout(roller.timer);
    roller.timer = null;
  }
  for (const p of roller.pending) {
    p.leaving.remove();
    p.entering.classList.remove(ROLL_ENTER_ACTIVE_CLASS);
  }
  roller.pending = [];
};

/** 单元内换字：roll 为真播翻页，否则就地替换字符（读数密集变化时的退化路径） */
const setBubbleCellChar = (roller: BubbleRoller, cell: HTMLElement, char: string, roll: boolean): void => {
  // 调用前必已 settle，故首个子节点就是当前字符
  const current = cell.firstElementChild as HTMLElement;
  if (!roll) {
    current.textContent = char;
    return;
  }
  const entering = document.createElement('span');
  entering.className = `${BUBBLE_CHAR_CLASS} ${ROLL_ENTER_FROM_CLASS} ${ROLL_ENTER_ACTIVE_CLASS}`;
  entering.textContent = char;
  cell.appendChild(entering);
  roller.pending.push({ leaving: current, entering });
  // 插入与切类必须分帧：同一帧内完成的话浏览器只做一次样式计算，「from」与目标态被合并，过渡没有起点
  // （Vue <Transition> 的 nextFrame 同理）。收尾可能先于本帧回调发生，故用 pending 归属当门闩
  requestAnimationFrame(() => {
    if (!roller.pending.some(p => p.entering === entering)) return;
    entering.classList.remove(ROLL_ENTER_FROM_CLASS);
    current.classList.add(ROLL_LEAVE_ACTIVE_CLASS, ROLL_LEAVE_TO_CLASS);
  });
  if (roller.timer !== null) clearTimeout(roller.timer);
  roller.timer = setTimeout(() => {
    roller.timer = null;
    settleBubbleRoll(roller);
  }, BUBBLE_ROLL_MS + BUBBLE_ROLL_SETTLE_SLACK_MS);
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
  for (const [key, node] of prevNodes) {
    if (!aligned.cells.some(c => c.key === key)) node.remove();
  }
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
  const scrollTop = my ? Math.min(Math.max(my.scrollPos, 0), maxScrollTop) : 0;
  const scrollLeft = mx ? Math.min(Math.max(mx.scrollPos, 0), maxScrollLeft) : 0;
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
  const bubble = state.bubble;
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
const refreshAll = (state: ScrollbarState): void => {
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
/** 翻页单元与字符的类名（静态样式在注入样式里；结构对齐 BaseRollingText 的逐字符窗口） */
const BUBBLE_CELL_CLASS = 'v-scrollbar-bubble-cell';
const BUBBLE_CHAR_CLASS = 'v-scrollbar-bubble-char';

/**
 * 拇指显隐切换：overlay 与宿主是兄弟关系，显隐必须落在拇指自身类上。
 *
 * 「拇指隐藏」同时把气泡一并收起：气泡是滚动条的注释，滚动条都已淡出，读数再停留就是孤悬的半截提示。
 * 两者各自计时且气泡侧可能长得多（宿主常按读数节奏把 hideDelay 配得比 autoHide 大，如页码读数 1200ms vs 400ms），
 * 各按各路走就会留下一段「滚动条没了、气泡还挂着」的残留窗口——把上界收敛在此处（而不是散在调用点），
 * 将来新增拇指隐藏路径也无需记得补一句。
 */
const setThumbsVisible = (state: ScrollbarState, visible: boolean): void => {
  for (const t of [state.thumbs.y, state.thumbs.x]) {
    t?.classList.toggle(THUMB_VISIBLE_CLASS, visible);
  }
  if (!visible) hideBubble(state);
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
    // 气泡随拇指一并收起：本轮隐藏由 setThumbsVisible 统一兜住（见该函数注释）
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
 * 显示滚动气泡并重置其闲置倒计时。
 *
 * 只由「发生滚动」触发（宿主 scroll 事件上派发），不由悬停触发——把鼠标移进滚动区就弹读数会糊屏；
 * 隐藏时长按自身 hideDelay 计时（见 resolveBubbleOptions 的默认），但**上限是滚动条的可见期**：
 * 拇指一旦自动隐藏（scheduleHide）就一并把气泡收起，不存在「滚动条没了、读数还挂着」的窗口。
 */
const showBubble = (state: ScrollbarState): void => {
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
const hideBubble = (state: ScrollbarState): void => {
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
const stampInteraction = (state: ScrollbarState): void => {
  state.lastInteractionAt = Date.now();
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
    // 拇指上的指针事件不冒泡到宿主（overlay 是兄弟节点），用户手势埋点必须在此自打
    stampInteraction(state);
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
    // 拖拽过程持续补打：判定窗口（120ms）短于拖拽时长，只在起点打点会让后半程被判为非交互
    stampInteraction(state);
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

/** 轨道点击（thumb 之外、非抑制态）：'jump' 直接跳到指针处，'page' 以拇指当前位置为界翻页（同原生滚动条）。 */
const handleTrackAreaClick = (state: ScrollbarState, axis: 'x' | 'y', e: MouseEvent): void => {
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
    behavior: resolveScrollBehavior('smooth'),
  });
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
    // 长按跟随的每次重算都补打用户手势时间戳：判定窗口短于按住时长
    stampInteraction(state);
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
    // 轨道上的指针事件不冒泡到宿主（overlay 是兄弟节点），用户手势埋点必须在此自打
    stampInteraction(state);
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
    // 兜底清理：updated 重建路径摘除监听时，若长按定时器仍挂起或 userSelect 写死，必须一并复位，
    // 否则旧宿主残留 userSelect:'none'（V5）。
    cancelLongPress();
    if (longPressActive) {
      longPressActive = false;
      state.host.style.userSelect = '';
    }
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
    handleTrackAreaClick(state, axis, e);
  });
};

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
    dragAxis: null,
    dragStartPos: 0,
    dragStartScroll: 0,
    trackPressAxis: null,
    trackPressPointer: null,
    disposers: [],
  };
};

/** overlay 挂载容器：显式指定优先，缺省回落到宿主父元素（见 options.overlayParent 注释） */
const resolveOverlayParent = (host: HTMLElement, options: ScrollbarOptions): HTMLElement | null => {
  const target = typeof options.overlayParent === 'function' ? options.overlayParent() : options.overlayParent;
  return target ?? host.parentElement;
};

/** 创建各轴 overlay（拇指/轨道）并挂事件：轨道点击与长按跟随、overlay 悬停显隐、wheel 同参重派发到宿主。 */
const createAxisOverlays = (state: ScrollbarState, parent: HTMLElement): void => {
  const makeEl = (cls: string) => {
    const el = document.createElement('div');
    el.className = cls;
    parent.appendChild(el);
    return el;
  };
  // 无修饰符且未指定 direction 时默认双轴（x+y）：各轴仅在确有溢出时由轴几何刷新隐藏，
  // 对齐原生滚动条「仅在有可滚内容时出现」的限制。
  for (const axis of state.axes) {
    // no-track 模式：不创建轨道 overlay，只保留拇指（轨道点击/长按跟随随之不可用）
    if (state.options.showTrack) {
      // 拇指在前、轨道在后：z-index 控制层叠（拇指在上），兄弟选择器 thumb:hover ~ track 依赖此顺序
      state.thumbs[axis] = makeEl(`v-scrollbar-thumb v-scrollbar-thumb--${axis}`);
      state.tracks[axis] = makeEl(`v-scrollbar-track v-scrollbar-track--${axis}`);
      // trackClick:'none'：轨道纯视觉，永久撤掉指针事件（可见类的 pointer-events:auto 不覆盖内联样式）
      if (state.options.trackClick === 'none') state.tracks[axis]!.style.pointerEvents = 'none';
      attachTrackClick(state, axis);
    } else {
      state.thumbs[axis] = makeEl(`v-scrollbar-thumb v-scrollbar-thumb--${axis}`);
    }
    attachThumbDrag(state, axis);

    // a11y（V11）：拇指承载 role=scrollbar + 键盘滚动（方向键/PageUp/Down/Home/End）。
    // aria-controls 需要宿主有 id 才有意义：宿主无 id 时生成一个并回填（空串等于未设，
    // AT 会认为控件不关联任何可滚区域——P1 审计 N 系）
    const hostEl = state.host;
    if (!hostEl.id) hostEl.id = `v-scrollbar-host-${Math.random().toString(36).slice(2, 8)}`;
    const thumbEl = state.thumbs[axis]!;
    thumbEl.setAttribute('role', 'scrollbar');
    thumbEl.setAttribute('aria-orientation', axis === 'y' ? 'vertical' : 'horizontal');
    thumbEl.setAttribute('aria-controls', hostEl.id);
    thumbEl.setAttribute('tabindex', '0');
    thumbEl.addEventListener('keydown', (e: KeyboardEvent) => {
      const host = state.host;
      const step = getLength(host, axis, 'client') * 0.1;
      let delta = 0;
      if (axis === 'y') {
        if (e.key === 'ArrowDown') delta = step;
        else if (e.key === 'ArrowUp') delta = -step;
        else if (e.key === 'PageDown') delta = getLength(host, 'y', 'client');
        else if (e.key === 'PageUp') delta = -getLength(host, 'y', 'client');
        else if (e.key === 'Home') delta = -Infinity;
        else if (e.key === 'End') delta = Infinity;
      } else {
        if (e.key === 'ArrowRight') delta = step;
        else if (e.key === 'ArrowLeft') delta = -step;
        else if (e.key === 'Home') delta = -Infinity;
        else if (e.key === 'End') delta = Infinity;
      }
      if (delta === 0) return;
      e.preventDefault();
      const max = Math.max(0, getLength(host, axis, 'scroll') - getLength(host, axis, 'client'));
      const cur = getScrollPos(host, axis);
      const next = delta === Infinity ? max : delta === -Infinity ? 0 : Math.min(max, Math.max(0, cur + delta));
      if (axis === 'y') host.scrollTop = next;
      else host.scrollLeft = next;
    });

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
      attachOverlayWheelForward(state, axis, el);
    }
  }

  // 滚动气泡：全局单枚（只服务配置指定的轴，不是每轴一枚），但仍与拇指/轨道同为 overlay 兄弟节点，
  // 因此同样不随内容滚走、无需 scrollPos 补偿。
  // 所属轴必须真在启用轴内：否则 applyBubble 取不到该轴读数（会早退），气泡既不定位也不写文案，
  // 却在滚动时被 showBubble 加上可见类——一枚空气泡滞留在父元素左上角。显式写错轴时宁可不建。
  if (state.options.bubble.enabled && state.axes.includes(state.options.bubble.axis)) {
    const { axis, size } = state.options.bubble;
    // 档位类两档都写在注入样式里（各管一套度量），此处按解出的档位直接挂上，无需分支
    const bubble = makeEl(`v-scrollbar-bubble v-scrollbar-bubble--${axis} v-scrollbar-bubble--${size}`);
    // 纯视觉读数：同一信息消费端可由滚动位置得到，重复播报只会干扰读屏
    bubble.setAttribute('aria-hidden', 'true');
    // 读数节点：气泡本体保持 overflow:visible 供箭头探出，省略号与文本都落在它身上（见 renderBubbleText）
    const label = document.createElement('span');
    label.className = 'v-scrollbar-bubble-text';
    bubble.appendChild(label);
    state.bubbleLabel = label;
    // 翻页器：单元节点直接挂在读数节点下（结构见 makeBubbleCell）；未开 roll 时读数节点退回纯文本节点
    if (state.options.bubble.roll) {
      state.bubbleRoller = {
        cells: [],
        nodes: [],
        nextKey: 0,
        lastChangeAt: Date.now(),
        pending: [],
        timer: null,
      };
    }
    // 指向箭头：贴在气泡朝滚动条的那条边，随气泡一起被 showBubble/hideBubble 控制显隐
    const arrow = document.createElement('div');
    arrow.className = 'v-scrollbar-bubble-arrow';
    applyArrowStyle(arrow, buildBubbleArrowStyle(axis, BUBBLE_ARROW_SIZE[size]));
    bubble.appendChild(arrow);
    state.bubble = bubble;
  }
};

/**
 * 气泡指向箭头的样式：**复用 Popover/Tooltip 的浮层箭头逻辑**（buildFloatingArrowStyle——
 * 45° 旋转方块 + 裁掉插入面板内的那一半 + 只保留楔形两侧边框），保证三处箭头观感一致。
 *
 * 与那两处不同，气泡方位是恒定的（纵向滚动条的气泡恒在轨道左侧、横向的恒在轨道上方），不存在 flip，
 * 因此不需要 floating-ui 的 arrow middleware：用假 placement 表达「贴哪条边」即可——
 * 气泡在锚点左侧 → placement 'left' → 箭头贴气泡右缘（朝滚动条一侧），
 * 交叉轴居中偏移在创建时按边长直接写 calc（尺寸像素级已知，省掉一次测量与一整套中间件）。
 */
const buildBubbleArrowStyle = (axis: 'x' | 'y', size: number): CSSProperties => {
  const style = buildFloatingArrowStyle({
    placement: axis === 'y' ? 'left' : 'top',
    background: 'var(--bg-panel)',
    borderColor: 'var(--glass-border)',
    size,
    // 气泡自带 1px 边框，与 BasePopover 传同款修正，把箭头原点对齐回 border-box 边缘
    borderWidth: 1,
  });
  // 交叉轴居中：纵向气泡的箭头贴右缘靠 top 居中，横向气泡的箭头贴下缘靠 left 居中
  if (axis === 'y') style.top = `calc(50% - ${size / 2}px)`;
  else style.left = `calc(50% - ${size / 2}px)`;
  return style;
};

/** 把箭头样式对象写入元素：写法与 vTooltip 一致（-webkit- 前缀属性只能走 setProperty，其余按 camelCase 直赋） */
const applyArrowStyle = (el: HTMLElement, style: CSSProperties): void => {
  for (const [key, value] of Object.entries(style)) {
    if (value == null) continue;
    if (key === 'WebkitBackdropFilter') el.style.setProperty('-webkit-backdrop-filter', String(value));
    else (el.style as unknown as Record<string, string>)[key] = String(value);
  }
};

/** overlay 的 wheel 转发：wheel 不会冒泡到宿主（兄弟节点），同参重派发到宿主元素由指令按策略消费；
 *  宿主侧**没有生效策略**时才由自身兜底驱动本轴（有策略而选择放行时不得二次驱动，见下）。 */
const attachOverlayWheelForward = (state: ScrollbarState, axis: 'x' | 'y', el: HTMLElement): void => {
  // 三种归宿，按序判定：
  // ① 宿主侧消费（defaultPrevented）→ 把消费决定镜像回真实事件，抑制其默认滚动；
  // ② 宿主侧有生效策略但刻意放行（如 v-wheel-scroll 的 overscroll:'auto' 在边界处让位、
  //    或本轮已让位给外层）→ 结论就是「交给外层滚动链」，兜底不得再驱动本轴；
  // ③ 宿主侧无策略（未挂 v-wheel-scroll，或挂了但 disabled）→ 兜底接手驱动本轴。
  // 注意：真实事件不能在探测前无条件 preventDefault——② 需要让真实事件保留默认行为，
  // 浏览器才能对非受信合成事件无法执行的「原生滚动链」进行兜底（穿透到祖先滚动容器）。
  // ctrl/meta/alt 交还浏览器默认（缩放等组合键）；
  // 合成事件刻意 bubbles:false：只投递给宿主自身消费，不向上冒泡，
  // 避免宿主祖先上依赖 wheel 冒泡的委托（若存在）被这份转发事件二次处理。
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
      // 宿主侧没拦截，但可能正是「有策略、且策略选择放行」：让位给外层滚动是本轮结论，
      // 兜底不得再驱动本轴——否则宿主被兜底拖着动、外层同时也在滚（两者同时位移）。
      // 兜底只服务真的没人管的场景（宿主未挂 v-wheel-scroll，或挂了但 disabled）
      if (isWheelScrollSeen(resent)) return;
      // 宿主侧无策略：真实事件默认行为不被抑制，浏览器原生滚动链可继续生效（穿透到祖先滚动容器），
      // 同时由兜底补上原生那套轴回退（事件到不了宿主，只能在这里代为驱动）
      // deltaMode 归一化：行模式（Firefox）按约一行高度近似；页模式按宿主该轴可视尺寸折算
      //（否则页单位被当 1px、几乎不动。口径与 v-wheel-scroll 的 toPixelDelta 对齐）
      const scale =
        e.deltaMode === 1
          ? 40
          : e.deltaMode === 2
            ? axis === 'y'
              ? state.host.clientHeight
              : state.host.clientWidth
            : 1;
      const fallbackDelta = axis === 'y' ? e.deltaY * scale : (e.deltaX + e.deltaY) * scale;
      // 滚动条所在轴决定驱动哪条轴：纵向滚动条→纵向、横向滚动条→横向，
      // 不再双向同时滚动（避免停在横向滚动条上时纵向内容被误带）。
      // 横向滚动条同时接纳鼠标滚轮（deltaY）与触控板横向滑动（deltaX），保证鼠标可用。
      if (axis === 'y') {
        wheelScroll(state, 0, fallbackDelta);
      } else {
        wheelScroll(state, fallbackDelta, 0);
      }
    },
    { passive: false }
  );
};

/** 宿主 scroll 监听：刷新几何 + 显示拇指 + 对外派发滚动明细（interactive 区分用户手势与程序化设位）。 */
const attachHostScroll = (state: ScrollbarState): void => {
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
    // 滚动气泡：所有滚动路径都汇聚到宿主 scroll 事件（原生滚动、拇指拖拽、轨道跳转/翻页、滚轮转发、
    // 程序化 scrollTo），故只需在此显形即可覆盖全部交互。
    // 但显形只认气泡所属轴：宿主双轴可滚时，滚另一轴并不会让读数变化，此刻浮现的是一份陈旧读数，
    // 看起来却像「跟着当前滚动在动」。非所属轴滚动时不显形也不重置倒计时——气泡按自己的节奏淡出。
    // onlyInteractive 时再过滤掉非手势滚动（布局钳位 / 程序化设位）。
    const { bubble } = state.options;
    if (bubble.enabled) {
      const axisPos = bubble.axis === 'y' ? detail.scrollTop : detail.scrollLeft;
      const moved = axisPos !== state.bubbleAxisPos;
      state.bubbleAxisPos = axisPos;
      if (moved && (!bubble.onlyInteractive || detail.interactive)) showBubble(state);
    }
  };
  // 所属轴基线：气泡「只认所属轴」的判据是位置有没有变，故先记一次当前值。
  // 取在这里而不是 buildState——updated 每次都以 buildState 造候选 state 做比较，
  // 在那条路径上读 scrollTop 会在 Vue patch 之后强制一次同步布局（乐谱预览这类大页代价可观）；
  // 挂载路径上紧接着就是 refreshAll 的量测，这里的读不额外造成回流。
  state.bubbleAxisPos = getScrollPos(state.host, state.options.bubble.axis);
  state.host.addEventListener('scroll', onHostScroll, { passive: true });
  state.disposers.push(() => state.host.removeEventListener('scroll', onHostScroll));
};

/** 宿主内的用户滚动手势埋点：pointerdown（拖动内容/选中）与 wheel 均视为用户发起。
 *  overlay 上的拖拽 / 轨道点击由各自的事件处理器另行打点（见 stampInteraction 注释）。 */
const attachInteractionStamps = (state: ScrollbarState): void => {
  const host = state.host;
  const onPointerDown = (): void => stampInteraction(state);
  const onWheel = (): void => stampInteraction(state);
  host.addEventListener('pointerdown', onPointerDown, { passive: true });
  host.addEventListener('wheel', onWheel, { passive: true });
  state.disposers.push(() => host.removeEventListener('pointerdown', onPointerDown));
  state.disposers.push(() => host.removeEventListener('wheel', onWheel));
};

/**
 * 几何刷新的合帧调度（ResizeObserver / MutationObserver 两条观察者路径共用）。
 *
 * 观察者回调会在一帧内投递多次（MutationObserver 每个微任务检查点都会投递一批），逐次 refreshAll
 * 就是逐次读几何；合并到 rAF 后每帧最多算一次，且读数发生在布局已干净时，不会在 DOM 变更的中间态
 * 触发强制同步回流。scroll 事件本身规范上最多每帧一次，仍走同步 refreshAll（见 attachHostScroll），
 * 避免给滚动位置引入一帧延迟。
 */
const scheduleRefresh = (state: ScrollbarState): void => {
  if (state.refreshRaf !== null) return;
  state.refreshRaf = requestAnimationFrame(() => {
    state.refreshRaf = null;
    // 期间已卸载（updated 重建 / 元素移除）：state 已失效，刷新句柄已随 unmount 取消，此处再兜一层
    if (states.get(state.host) !== state) return;
    refreshAll(state);
    // 长按轨道跟随期间，尺寸变化（如子元素增长/图片加载）需补发 jumpToPointer，
    // 否则指针静止时内容尺寸变化不会重算，跟随位置与鼠标脱节。
    if (state.trackPressAxis && state.trackPressPointer) {
      jumpToPointer(state, state.trackPressAxis, state.trackPressPointer, 'smooth');
    }
  });
};

/** 登记直接子元素进观察集（幂等：已在集合内的元素不重复 observe——observe 虽幂等，但每次调用都是浏览器侧登记） */
const registerObservedChild = (state: ScrollbarState, child: Element): void => {
  if (!state.resizeObserver || state.observedChildren.has(child)) return;
  state.observedChildren.add(child);
  state.resizeObserver.observe(child);
};

/** 尺寸观测：宿主与全部直接子元素任一尺寸变化都刷新几何；内容增删（MutationObserver）触发后需把新子元素补进观察集。 */
const attachSizeObservers = (state: ScrollbarState): void => {
  const host = state.host;
  // 缺失环境降级为仅 scroll 驱动
  if (typeof ResizeObserver !== 'undefined') {
    state.resizeObserver = new ResizeObserver(() => scheduleRefresh(state));
    state.resizeObserver.observe(host);
    // 直接子元素逐个观察：子元素撑高不改变宿主自身盒子，只观察宿主会漏掉内容增长
    for (const child of host.children) registerObservedChild(state, child);
  }
  if (typeof MutationObserver !== 'undefined') {
    state.mutationObserver = new MutationObserver(mutations => {
      if (state.resizeObserver) {
        for (const mutation of mutations) {
          // 被移除的子元素不再观察：ResizeObserver 不会因元素脱离 DOM 自动停止，
          // 高频增删列表若不显式 unobserve，会持续持有已移除节点的引用形成泄漏
          for (const node of mutation.removedNodes) {
            if (node instanceof Element && state.observedChildren.delete(node)) state.resizeObserver.unobserve(node);
          }
          // 只补观察本次新增的直接子元素。原来每次 DOM 变更都遍历 host.children 全量重观察：
          // observe 对已观察元素虽幂等，但千级列表（和弦库/谱面列表）+ 拖拽排序下，
          // 这条回调本身高频触发，全量重登记是 O(n) 次纯白跑
          for (const node of mutation.addedNodes) {
            if (node instanceof Element && node.parentNode === host) registerObservedChild(state, node);
          }
        }
      }
      scheduleRefresh(state);
    });
    state.mutationObserver.observe(host, { childList: true, subtree: true, characterData: true });
  }
};

/** 悬停宿主即显示滚动条且常显（overlay 与宿主是兄弟节点，无法用 CSS :hover 表达）；离开后倒计时隐藏。 */
const attachHoverVisibility = (state: ScrollbarState): void => {
  const host = state.host;
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
    if (prev && next && prev.options.onScroll !== next.options.onScroll) {
      prev.options.onScroll = next.options.onScroll;
    }
    // 气泡文案回调同理只做引用替换：宿主常用内联箭头函数（每次渲染都是新引用），
    // 若纳入重建判据，滚动区会在父组件每次重渲染时整体重建（摘挂 overlay + 重挂监听），代价远大于收益。
    // 文案以外（启用态/轴/间距/隐藏时长/交互过滤）都是结构性选项，纳入下方早退比较。
    if (prev && next && prev.options.bubble.format !== next.options.bubble.format) {
      prev.options.bubble.format = next.options.bubble.format;
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
      prev.options.trackClick === next.options.trackClick &&
      prev.options.bubble.enabled === next.options.bubble.enabled &&
      prev.options.bubble.axis === next.options.bubble.axis &&
      prev.options.bubble.offset === next.options.bubble.offset &&
      prev.options.bubble.hideDelay === next.options.bubble.hideDelay &&
      // size 决定气泡档位类与箭头边长，两者都在挂载时落到 DOM/内联样式上，必须纳入重建判据
      prev.options.bubble.size === next.options.bubble.size &&
      // roll 决定读数节点是「单元宿主」还是纯文本节点，同样只在挂载时定型
      prev.options.bubble.roll === next.options.bubble.roll &&
      prev.options.bubble.onlyInteractive === next.options.bubble.onlyInteractive
    ) {
      return;
    }
    unmountScrollbar(el);
    mountScrollbar(el, binding.value, binding.modifiers);
  },
  beforeUnmount: el => unmountScrollbar(el),
};
