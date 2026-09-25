import { ARROW_PANEL_SIZE, createArrowPanel } from '@/platform/ui/popover/arrowPanel';
import {
  arrowCenterOfPlacement,
  arrowSideOfPlacement,
  buildFloatingMiddlewares,
  createFloatingController,
} from '@/platform/ui/popover/floatingCore';
import { acquireFloatingZ, releaseFloatingZ } from '@/platform/ui/popover/floatingZ';
import { TOOLTIP_HIDE_CLEANUP_DELAY_MS, TOOLTIP_INTERACTIVE_MIN_HIDE_DELAY_MS } from '@/platform/utils/constants';
import { logger } from '@/platform/utils/logger';

import type { ArrowPanelHandle } from '@/platform/ui/popover/arrowPanel';
import type { ComputePositionReturn, Placement } from '@floating-ui/dom';
import type { Directive } from 'vue';

import './vTooltip.scss';

export interface TooltipOptions {
  content?: string | string[];
  placement?: Placement;
  /** 浮层与锚点的间距（px），默认 12 */
  offset?: number;
  /** 延迟显示/隐藏时长（毫秒），支持 [showDelay, hideDelay] */
  delay?: number | [number, number];
  showDelay?: number;
  hideDelay?: number;
  /** 是否禁用提示（亦可用 `.disabled` 修饰符关闭） */
  disabled?: boolean;
  /** 自定义样式类名 */
  customClass?: string;
  /** 是否显示指示箭头，默认 true */
  showArrow?: boolean;
  /**
   * 交互式：鼠标移入浮层本身时不收起，移出才收起（默认 false）。
   * 开启后浮层会接收鼠标事件（pointer-events:auto），并自动套用最小隐藏延迟，
   * 留出「从触发元素跨过间隙移入浮层」的时间窗，使浮层内的内容可被交互/选中。
   */
  interactive?: boolean;
  /**
   * hover / focus 的**触发宿主**：默认 `'self'` 指指令元素自身；给 CSS 选择器时改用自元素向上
   * `closest()` 命中的最近祖先（含自身）。
   *
   * 用于把「悬停才显示」的判定范围从图标 / 截断文字本体的那一小块放大到整行 / 整卡。
   * **注意**：同一容器内若有多个带 tooltip 的元素，委托到同一宿主会让它们同时弹出 ——
   * 只在该容器内 tooltip 唯一时才用。找不到匹配祖先时回退到自身，不会静默失去触发。
   */
  trigger?: 'self' | string;
  /**
   * 手动控制模式：为 true 时忽略鼠标悬停/聚焦的自动显隐，仅由 visible 驱动。
   * 用于需要外部以编程方式控制 tooltip 显隐的场景（如滑块拖拽数值气泡）。
   */
  manual?: boolean;
  /**
   * 手动控制下的显隐开关（配合 manual:true 使用，否则忽略）。
   * 响应式变化时对应显示/隐藏，并同步刷新内容与定位。
   */
  visible?: boolean;
  /**
   * 紧凑读数气泡：覆盖默认玻璃标题提示为窄边距的小号加粗读数（如滑块数值），
   * 与指示箭头共享 --bg-panel 底色；亦可用 .compact 修饰符开启。
   */
  compact?: boolean;
  /**
   * 内容是否按 HTML 渲染（默认 false，使用 textContent 防 XSS）。
   * 亦可用 `.html` 修饰符开启。
   * 仅当内容为可信的静态字符串时使用；切勿传入用户输入，否则有注入风险。
   * 配合 interactive 可承载可点击的链接 / 按钮等真实交互内容。
   */
  html?: boolean;
}

/**
 * v-tooltip 支持的修饰符（以 `.foo` 形式书写，如 `v-tooltip.interactive`）：
 * - 方位：`top` `top-start` `top-end` `bottom` `bottom-start` `bottom-end`
 *   `left` `left-start` `left-end` `right` `right-start` `right-end`，可拆分写为 `v-tooltip.bottom.start`
 * - `no-arrow`：隐藏箭头（等价于 `showArrow:false`）
 * - `interactive`：开启交互式（等价于 `interactive:true`）
 * - `html`：内容按 HTML 渲染（等价于 `html:true`）
 * - `manual`：开启手动控制，忽略悬停/聚焦自动显隐，仅由 `visible` 驱动（等价于 `manual:true`）
 * - `compact`：紧凑读数气泡（等价于 `compact:true`）
 * - `disabled`：禁用提示（等价于 `disabled:true`）
 *
 * 修饰符与对象选项等效，对象显式赋值优先级更高。
 */
export type TooltipModifiers =
  | 'top'
  | 'top-start'
  | 'top-end'
  | 'bottom'
  | 'bottom-start'
  | 'bottom-end'
  | 'left'
  | 'left-start'
  | 'left-end'
  | 'right'
  | 'right-start'
  | 'right-end'
  | 'start'
  | 'end'
  | 'no-arrow'
  | 'interactive'
  | 'html'
  | 'manual'
  | 'compact'
  | 'disabled'
  | (string & Record<never, never>);

export type TooltipBinding = string | string[] | TooltipOptions | undefined;

const VALID_PLACEMENTS: Placement[] = [
  'top',
  'top-start',
  'top-end',
  'bottom',
  'bottom-start',
  'bottom-end',
  'left',
  'left-start',
  'left-end',
  'right',
  'right-start',
  'right-end',
];

/** 从修饰符解析方位：先组合"基础方位 + 对齐"，再兜底匹配完整方位键；无匹配返回 undefined。 */
const getPlacementFromModifiers = (modifiers?: Record<string, boolean>): Placement | undefined => {
  if (!modifiers) return undefined;
  const keys = Object.keys(modifiers);
  if (keys.length === 0) return undefined;

  // 拆分修饰符优先：基础方位 + 对齐（如 v-tooltip.right.end → right-end）。
  // 必须在此先组合，否则裸方位（right）会被当作完整 placement 提前返回，丢掉对齐。
  const baseSide = ['top', 'bottom', 'left', 'right'].find(side => modifiers[side]);
  if (baseSide) {
    const alignment = ['start', 'end'].find(align => modifiers[align]);
    const combined = (alignment ? `${baseSide}-${alignment}` : baseSide) as Placement;
    if (VALID_PLACEMENTS.includes(combined)) return combined;
  }

  // 兜底：直接命中完整方位修饰符（如 v-tooltip.bottom-start 作为单键）
  for (const key of keys) if (VALID_PLACEMENTS.includes(key as Placement)) return key as Placement;

  return undefined;
};

/**
 * 将指令的绑定值（字符串 / 选项对象）与修饰符归一化为统一的 TooltipOptions。
 *
 * 修饰符（如 `v-tooltip.interactive`、`v-tooltip.html`）与对象选项等效，
 * 优先级规则：对象显式赋值 > 修饰符 > 默认值。
 */
export const normalize = (value: TooltipBinding, modifiers?: Record<string, boolean>): TooltipOptions => {
  const base: TooltipOptions = typeof value === 'string' || Array.isArray(value) ? { content: value } : { ...value };
  if (!base.placement) {
    const modifierPlacement = getPlacementFromModifiers(modifiers);
    if (modifierPlacement) base.placement = modifierPlacement;
  }
  // 箭头默认显示；显式传了 showArrow 以对象为准，否则用 .no-arrow 修饰符关闭
  if (base.showArrow === undefined) base.showArrow = !modifiers?.['no-arrow'];

  // 交互式默认 false；显式传了 interactive 以对象为准，否则用 .interactive 修饰符开启
  if (base.interactive === undefined) base.interactive = Boolean(modifiers?.['interactive']);

  // 内容 HTML 渲染默认 false；显式传了 html 以对象为准，否则用 .html 修饰符开启
  if (base.html === undefined) base.html = Boolean(modifiers?.['html']);

  // 禁用默认 false；显式传了 disabled 以对象为准，否则用 .disabled 修饰符关闭
  if (base.disabled === undefined) base.disabled = Boolean(modifiers?.['disabled']);

  // 手动控制默认 false；显式传了 manual 以对象为准，否则用 .manual 修饰符开启
  if (base.manual === undefined) base.manual = Boolean(modifiers?.['manual']);

  // 紧凑读数默认 false；显式传了 compact 以对象为准，否则用 .compact 修饰符开启
  if (base.compact === undefined) base.compact = Boolean(modifiers?.['compact']);

  // 触发宿主默认自身；选择器形式只能走对象选项 —— 修饰符承载不了字符串（v-tooltip.foo 只能表达开关）
  if (base.trigger === undefined) base.trigger = 'self';

  return base;
};

// 全局单例 DOM 与状态
// 结构：box（仅负责 fixed 定位，透明） > content（真正的视觉样式）+ arrow（sibling）
// 层序：arrow 取 z-index:2、content 取 z-index:1 —— 箭头高一层，探入面板的 1px 楔形才能压住
// 面板边框与箭头之间的抗锯齿缝隙；插入面板的那一半由 clip-path 物理裁掉，不靠 content 的背景遮挡。
let globalBox: HTMLDivElement | null = null;
let globalContent: HTMLDivElement | null = null;
/** 箭头探针：只供 floating-ui 的 arrow 中间件量尺寸，不绘制（见 getOrCreateGlobalBox） */
let globalArrow: HTMLDivElement | null = null;
/** 剪影层：把面板描边与箭头画成一条连续轮廓（原生实现，指令侧直接用） */
let globalArrowPanel: ArrowPanelHandle | null = null;
let currentTargetEl: HTMLElement | null = null;

/**
 * 提示内容的固定 id：`role="tooltip"` 只有被触发元素用 aria-describedby 指到，读屏才会播报它。
 *
 * 为什么必须是固定值而不是自增唯一 id：全应用只有一个 tooltip 浮层（模块级单例），
 * 同一时刻至多一个元素指向它，固定 id 不会撞；自增反而要求每条指令实例各自记账。
 */
const TOOLTIP_CONTENT_ID = 'v-tooltip-content';

/** 在 aria-describedby 的 id 列表里追加一项（保留调用方自己写的那些，不整段覆写） */
const addDescribedBy = (el: HTMLElement, id: string): void => {
  const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  if (!ids.includes(id)) ids.push(id);
  el.setAttribute('aria-describedby', ids.join(' '));
};

/** 从 aria-describedby 的 id 列表里摘掉自己那一项；摘空即移除属性 */
const removeDescribedBy = (el: HTMLElement, id: string): void => {
  const ids = (el.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .filter(value => value !== id);
  if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
  else el.removeAttribute('aria-describedby');
};

/**
 * 切换当前提示的触发元素，并同步 aria-describedby。
 *
 * 为什么必须由这里统一管：提示是「键盘 Tab 聚焦也能唤起」的（见 vTooltip 的 onFocus），
 * 而视觉唤起对读屏毫无意义 —— 没有 aria 关联时，键盘用户听不到任何提示内容，
 * 那句注释承诺的无障碍唤起等于没兑现。挂/摘必须成对，故不能散在各处直接赋值。
 * 增删都按 id 列表做，不整段覆写：触发元素上可能本来就有调用方写的 aria-describedby。
 */
const setCurrentTarget = (el: HTMLElement | null): void => {
  if (currentTargetEl === el) return;
  if (currentTargetEl) removeDescribedBy(currentTargetEl, TOOLTIP_CONTENT_ID);
  currentTargetEl = el;
  if (el) addDescribedBy(el, TOOLTIP_CONTENT_ID);
};
let showTimer: ReturnType<typeof setTimeout> | null = null;
/** showTimer 归属的宿主元素：卸载时据以判断挂起的延时显示是否属于本实例（单例定时器的归属标记） */
let showTimerEl: HTMLElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
// 淡出结束后的「补设 visibility:hidden」清理定时器：独立于 hideTimer 之外、同样纳入统一清理
let hideCleanupTimer: ReturnType<typeof setTimeout> | null = null;
let appliedCustomClass = '';
// tooltip 当前在浮层层级池中持有的层号（单例，同一时刻最多持有一个）
let boxZOwned = false;

const isClient = typeof document !== 'undefined';

let isScrollListening = false;

/**
 * 这次滚动是否会把锚点从指针底下带走。
 *
 * 判据取「滚动源是不是锚点的祖先（含文档级）」：只有祖先滚动才会让锚点在视口里位移，此时收起
 * 提示才是对的——指针底下已经换成了别的内容，而 `mouseenter` 也不会再触发，留着只会停在错位处。
 *
 * 此前是**任何**滚动都收起，把与锚点无关的滚动一并算了进来：滚动侧栏列表却关掉顶栏按钮的提示、
 * 程序化滚动（自动定位 / 滚动位置贴回 / 折叠补偿）顺手关掉别处正悬停着的提示，都属于这条口径太宽。
 * 这类误伤还**不可自愈**：收起后指针并未离开触发元素，`mouseenter` 不会再触发，
 * 提示就此一去不返，只能把鼠标移开再移回才能重新唤起。
 *
 * 拿不到节点（如 window 这类非 Node 目标）时保守按「会带走」处理：宁可多收一次，
 * 也不要让提示停在已经错位的位置上。
 */
const scrollMovesAnchor = (target: EventTarget | null, el: HTMLElement): boolean =>
  !(target instanceof Node) || target.contains(el);

const onScrollCapture = (event: Event) => {
  const el = currentTargetEl;
  if (!el) return;
  if (!scrollMovesAnchor(event.target, el)) return;
  hideTooltip(el, true);
};

const startScrollListening = () => {
  if (!isScrollListening && isClient) {
    window.addEventListener('scroll', onScrollCapture, true);
    isScrollListening = true;
  }
};

const stopScrollListening = () => {
  if (isScrollListening && isClient) {
    window.removeEventListener('scroll', onScrollCapture, true);
    isScrollListening = false;
  }
};

/** 惰性创建全局单例 tooltip DOM（box > content + arrow），并注册交互式悬停监听。 */
const getOrCreateGlobalBox = (): HTMLDivElement | null => {
  if (!isClient) return null;
  if (!globalBox) {
    globalBox = document.createElement('div');
    globalBox.className = 'v-tooltip-root';
    // 初始隐藏态：opacity 0 + 缩小到 scale(.95)（与 v-transition-scale 入场一致）
    globalBox.style.cssText =
      'position:fixed;top:0;left:0;pointer-events:none;opacity:0;visibility:hidden;transform:scale(0.95);';
    document.body.appendChild(globalBox);

    globalContent = document.createElement('div');
    globalContent.className = 'v-tooltip-box';
    globalContent.setAttribute('role', 'tooltip');
    globalContent.id = TOOLTIP_CONTENT_ID;
    globalContent.style.cssText = 'position:relative;z-index:1;';
    globalBox.appendChild(globalContent);

    // 剪影层：面板描边 + 指向箭头画成一条连续轮廓（几何见 platform/ui/popover/arrowPanel.ts）。
    // 挂在 root 而不是 box 上：box 的 children 归 setTooltipContent 管（它会 textContent=''/innerHTML=''
    // 整片重写），剪影层放进去会被内容写入抹掉。root 与 box 都无 padding，两者 border-box 原点重合，
    // 故几何原点无需平移（平移量由 arrowPanel 按父子关系自行判定）。
    globalArrowPanel = createArrowPanel(globalBox, { paintHost: globalContent });

    globalArrow = document.createElement('div');
    globalArrow.className = 'v-tooltip-arrow';
    // 只给 floating-ui 的 arrow 中间件量尺寸用（中间件按它的宽高算交叉轴落点），自身不绘制任何东西：
    // 看得见的箭头由剪影层画成面板轮廓的一部分。尺寸必须与剪影层的 size 一致，
    // 且不能 display:none（offsetWidth 会归零，落点全错），故用 opacity:0 保留布局。
    globalArrow.style.cssText = `position:absolute;pointer-events:none;opacity:0;width:${ARROW_PANEL_SIZE}px;height:${ARROW_PANEL_SIZE}px;`;
    globalBox.appendChild(globalArrow);

    // 交互式 tooltip：鼠标移入浮层本身时不收起，移出才收起
    globalBox.addEventListener('mouseenter', () => {
      const el = currentTargetEl;
      if (!el) return;
      const h = handlerMap.get(el);
      if (h?.opts.interactive) clearTimers();
    });
    globalBox.addEventListener('mouseleave', () => {
      const el = currentTargetEl;
      if (!el) return;
      const h = handlerMap.get(el);
      if (h?.opts.interactive) hideTooltip(el, false);
    });
  }
  return globalBox;
};

/** 释放 tooltip 当前持有的层级（有持有才释放，避免误删池中他人的层号） */
const releaseBoxZ = () => {
  if (!boxZOwned || !globalBox) return;
  releaseFloatingZ(Number(globalBox.style.zIndex) || 0);
  boxZOwned = false;
};

/**
 * 让浮层对指针穿透 —— 只改命中测试，不改视觉，淡出动画照常播。
 *
 * 为什么必须与「压 opacity」同时做、而不能只靠收尾的 `visibility: hidden`：
 * 浮层是 `position: fixed` 的**单例**，隐藏后尺寸与位置仍停在上一个 tooltip 处，
 * 而 `opacity: 0` 的元素**依然参与命中测试**（opacity 不影响命中）。交互式浮层是
 * `pointer-events: auto`，于是它继续在原位置吃掉点击。更糟的是这会**自锁**：
 * 指针被它接走，下面的元素收不到 mouseenter、新 tooltip 永不显示；而浮层自己的 mouseenter
 * 又会 `clearTimers()` 把「淡出后设 visibility:hidden」那道收尾一并清掉，连兜底也失效 ——
 * 该区域就此永久不可点，且没有任何东西能把它恢复（2026-09-24 用户实测：顶栏 GitHub 图标的
 * interactive tooltip 移开后，原 tooltip 位置点不动）。
 *
 * 故「可命中性」必须与「可见性」成对维护：显示时按 interactive 打开，隐藏时一律关闭。
 */
const setBoxClickThrough = (): void => {
  if (globalBox) globalBox.style.pointerEvents = 'none';
};

/**
 * 本次定位使用的提示配置：控制器 getter 读它，每次 updatePosition 前刷新。
 *
 * 由此 autoUpdate 的跟随帧总是用**最新**配置（show 与 updated 两条路径都会刷新），不再像原先
 * 那样把首次 show 时的 opts 捕获进 autoUpdate 闭包——那时 updated 改了方位/间距之后，
 * 滚动跟随仍按旧配置重算。
 */
let activeOpts: TooltipOptions | null = null;

/** 写回定位结果：box 的 left/top + 箭头样式（与 BasePopover 共用同一份箭头构建逻辑）。 */
const applyFloatingResult = (result: ComputePositionReturn): void => {
  const { x, y, placement, middlewareData } = result;
  if (!globalBox) return;
  globalBox.style.left = `${x}px`;
  globalBox.style.top = `${y}px`;

  if (!globalArrowPanel) return;
  // 剪影层与 tooltip 同显隐：无箭头时整层隐藏（它是面板轮廓的一部分，留着会画出一圈多余的描边）
  const data = middlewareData.arrow;
  const show = Boolean(activeOpts?.showArrow && data);
  globalArrowPanel.element.style.display = show ? 'block' : 'none';
  if (!show || !data) return;
  // 中间件给的是箭头元素左上角，剪影层要的是中心；朝向与换算见 floatingCore
  globalArrowPanel.render({
    side: arrowSideOfPlacement(placement),
    center: arrowCenterOfPlacement(placement, data, ARROW_PANEL_SIZE),
  });
};

/**
 * 定位与跟随统一走 floatingCore 的控制器（computePosition + 竞态守卫 + autoUpdate 生命周期），
 * 与 BasePopover 经 useFloatingPosition 走的是同一份实现：锚点取 currentTargetEl，竞态守卫
 * 即「计算期间锚点是否已切换」，与原先手写的 `currentTargetEl !== el` 等价。
 */
const floatingController = createFloatingController({
  getReference: () => currentTargetEl,
  getFloating: () => globalBox,
  getPlacement: () => activeOpts?.placement ?? 'bottom',
  getMiddleware: () =>
    buildFloatingMiddlewares({
      offsetDistance: activeOpts?.offset ?? 12,
      showArrow: activeOpts?.showArrow,
      getArrowEl: () => globalArrow,
    }),
  onResult: applyFloatingResult,
});

/**
 * 刷新配置并重算一次定位。
 *
 * 返回 Promise：显示路径要 await 它（先定位再显隐，杜绝从 (0,0) 闪入）；updated 钩子与
 * autoUpdate 回调则裸调用——控制器内部吞掉 rejection，不存在未处理的 rejection。
 */
const updatePosition = (opts: TooltipOptions): Promise<void> => {
  activeOpts = opts;
  return floatingController.compute();
};

/** 清空显示/隐藏的延时定时器（含淡出后的清理定时器）。 */
const clearTimers = () => {
  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = null;
    showTimerEl = null;
  }
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (hideCleanupTimer) {
    clearTimeout(hideCleanupTimer);
    hideCleanupTimer = null;
  }
};

/** 内容判空统一口径：数组按长度、字符串按 truthy。
 *  showTooltip 入口与 executeShow 内部曾各写一套（入口用 `!opts.content`，空数组 [] 为 truthy 会穿透），
 *  导致空数组白白走完延迟调度才在 executeShow 里被拦下——统一后入口即拦截。 */
const hasTooltipContent = (opts: TooltipOptions): boolean =>
  Array.isArray(opts.content) ? opts.content.length > 0 : Boolean(opts.content);

/** html:true 时对内容做基础危险模式检测（仅开发期、按内容去重告警）。
 *  不替代 sanitize——只是把「误把用户输入塞进 html 模式」这一全局单例 XSS 隐患尽早暴露，
 *  纯静态可信字符串不受影响。 */
const DANGEROUS_HTML_PATTERN = /<\s*(script|iframe|object|embed)\b|on[a-z]+\s*=|javascript\s*:/i;
const warnedHtmlSnippets = new Set<string>();
const warnIfDangerousHtml = (content: string) => {
  if (!import.meta.env.DEV || !DANGEROUS_HTML_PATTERN.test(content)) return;
  if (warnedHtmlSnippets.has(content)) return;
  warnedHtmlSnippets.add(content);
  logger.warn(
    'vTooltip',
    'html:true 的内容含危险模式（<script>/<iframe>/on* 事件/javascript:）。若内容来自用户输入请改用纯文本模式，否则存在 XSS 风险'
  );
};

/** 写入浮层内容：支持单字符串与字符串数组（数组各项独立成行，不再自动换行）；html=true 时按 HTML 渲染，否则用 textContent 防注入 */
const setTooltipContent = (el: HTMLElement, opts: TooltipOptions): void => {
  const { content, html } = opts;
  if (!content) {
    el.textContent = '';
    return;
  }

  if (Array.isArray(content)) {
    el.innerHTML = '';
    for (const line of content) {
      const lineEl = document.createElement('div');
      lineEl.className = 'v-tooltip-line';
      if (html) {
        warnIfDangerousHtml(line);
        lineEl.innerHTML = line;
      } else lineEl.textContent = line;

      el.appendChild(lineEl);
    }
  } else if (html) {
    warnIfDangerousHtml(content);
    el.innerHTML = content;
  } else el.textContent = content;
};

/** 解析最终生效的显示/隐藏延迟：delay 数组/单值与 showDelay/hideDelay，后者优先。 */
const resolveDelay = (opts: TooltipOptions): { show: number; hide: number } => {
  let show = 0;
  let hide = 0;
  if (typeof opts.delay === 'number') {
    show = opts.delay;
    hide = opts.delay;
  } else if (Array.isArray(opts.delay)) {
    show = opts.delay[0] ?? 0;
    hide = opts.delay[1] ?? 0;
  }
  if (opts.showDelay !== undefined) show = opts.showDelay;
  if (opts.hideDelay !== undefined) hide = opts.hideDelay;
  return { show, hide };
};

/** 实际显示 tooltip：分配层级、写内容与自定义类，先定位后显隐以避免 (0,0) 闪烁，并启动 autoUpdate 跟随。 */
const executeShow = async (el: HTMLElement, opts: TooltipOptions) => {
  if (!isClient || opts.disabled || !hasTooltipContent(opts)) return;

  const box = getOrCreateGlobalBox();
  if (!box || !globalContent) return;

  // 同一目标已在显示中：直接返回，不再走一遍入场动画。
  // 触发源是鼠标点击 —— 点击会让按钮获得焦点，onFocus 随即以 immediate 再调一次 showTooltip，
  // 而下面那段「先倒回 opacity:0 + scale(.95) 再补间回来」是无条件的（它本是为「快速滑过多个
  // trigger 重放淡入」而设），于是已经稳稳显示的提示被空重放一次，观感就是「点一下按钮闪一下」。
  // 判据必须带 opacity：淡出中（opacity 0、visibility 仍 visible、currentTargetEl 尚未清）要继续走，
  // 那种情况需要重放动画。
  if (currentTargetEl === el && box.style.visibility === 'visible' && box.style.opacity === '1') return;

  setCurrentTarget(el);

  // 分配「当前最高 + 1」的层级，保证 tooltip 压住所有已打开的浮层（popover 等从 10001 起）
  releaseBoxZ();
  const z = acquireFloatingZ();
  boxZOwned = true;
  box.style.zIndex = String(z);

  // 处理自定义类名（挂在 content 上，因为它才是承载视觉样式的元素）
  if (appliedCustomClass) {
    globalContent.classList.remove(...appliedCustomClass.split(' ').filter(Boolean));
    appliedCustomClass = '';
  }
  if (opts.customClass) {
    appliedCustomClass = opts.customClass;
    globalContent.classList.add(...appliedCustomClass.split(' ').filter(Boolean));
  }
  // compact 为指令内建样式：随显隐开关在 content 上追加/移除，与 customClass 无冲突
  globalContent.classList.toggle('v-tooltip-compact', Boolean(opts.compact));

  setTooltipContent(globalContent, opts);

  // 关键：先计算准确坐标，完成后再显隐，杜绝 (0, 0) 闪烁 (FOUC)
  await updatePosition(opts);

  if (currentTargetEl === el) {
    // 每次显示都从「入场前态」开始：连续滑过多个 trigger 时，上一次 hide 定时器会被
    // 下一 trigger 的 showTooltip 取消，box 仍停留在可见态（opacity 已为 1）——
    // 此时直接写回 opacity=1 无状态差，CSS 过渡不会触发，表现为「快速连续滑过无动画」。
    // 统一先以缩小+透明提交一帧作为过渡起点，保证每个 trigger 都重放淡入放大动画。
    box.classList.add('v-tooltip-instant'); // 归位阶段关过渡，避免残留态被补间
    box.style.visibility = 'visible';
    box.style.opacity = '0';
    box.style.transform = 'scale(0.95)';
    void box.offsetWidth; // 强制回流：把入场前态作为过渡起始帧提交
    box.classList.remove('v-tooltip-instant'); // 恢复过渡
    void box.offsetWidth; // 再回流一次，让浏览器以带过渡的起始帧记录起点
    box.style.opacity = '1';
    box.style.transform = 'scale(1)';
    // 可命中性在这里才打开、不在 await 之前：await 期间浮层仍是上一轮遗留的
    // `opacity:0 + visibility:visible`，提前设 auto 就等于在它还没显示时先开始吃指针。
    // 交互式 tooltip 需要接收鼠标事件才能感知「移入浮层」，其余一律保持穿透不挡点击。
    box.style.pointerEvents = opts.interactive ? 'auto' : 'none';

    floatingController.attach();
    startScrollListening();
  }
};

/** 显示入口：按配置延迟触发 executeShow（immediate 时零延迟）。 */
const showTooltip = (el: HTMLElement, opts: TooltipOptions, immediate = false) => {
  // 统一走 hasTooltipContent：空数组 [] 为 truthy，原 `!opts.content` 拦不住，会让其白走一遍延迟调度
  if (!isClient || opts.disabled || !hasTooltipContent(opts)) return;
  clearTimers();

  const { show } = resolveDelay(opts);
  const delayMs = immediate ? 0 : show;

  if (delayMs > 0) {
    showTimerEl = el;
    showTimer = setTimeout(() => {
      executeShow(el, opts);
      showTimer = null;
      showTimerEl = null;
    }, delayMs);
  } else executeShow(el, opts);
};

/** 隐藏入口：区分立即隐藏（滚动/失焦/卸载）与延迟淡出（鼠标移出）；交互式浮层套用最小隐藏延迟。 */
const hideTooltip = (el: HTMLElement, immediate = false) => {
  if (!isClient || currentTargetEl !== el) return;
  clearTimers();

  const handler = handlerMap.get(el);
  const { hide } = resolveDelay(handler?.opts ?? {});
  // 交互式浮层需留出「跨过间隙移入浮层」的时间窗：未显式设置 hideDelay 时套用最小延迟，
  // 否则鼠标一离开触发元素浮层就瞬间消失，interactive 形同虚设
  const effectiveHide =
    !immediate && handler?.opts.interactive && hide === 0 ? TOOLTIP_INTERACTIVE_MIN_HIDE_DELAY_MS : hide;
  const delayMs = immediate ? 0 : effectiveHide;

  // 手动模式（visible 驱动）隐藏时即使无 hideDelay 也播放淡出，避免瞬时收起丢失出场动画；
  // 其余即时场景照旧走 `v-tooltip-instant` 关过渡的隐藏分支
  const manualFade = !immediate && Boolean(handler?.opts.manual);

  if (delayMs > 0 || manualFade) {
    const runFade = () => {
      if (currentTargetEl === el && globalBox) {
        // 离场：淡出并缩回 scale(.95)（即时路径才关过渡，见下）
        globalBox.style.opacity = '0';
        globalBox.style.transform = 'scale(0.95)';
        // 与压 opacity 同时摘掉命中：淡出期间不能设 visibility（会打断动画），
        // 于是这段时间里浮层仍会接走指针 —— 详见 setBoxClickThrough
        setBoxClickThrough();
        releaseBoxZ();
        floatingController.detach();

        // 淡出动画结束后的补设 visibility:hidden：存引用并纳入 clearTimers 统一清理，
        // 避免窗口期（动画播放中）触发元素被卸载后仍留下游离定时器访问模块单例
        hideCleanupTimer = setTimeout(() => {
          hideCleanupTimer = null;
          if (globalBox && globalBox.style.opacity === '0') {
            globalBox.style.visibility = 'hidden';
            if (currentTargetEl === el) {
              setCurrentTarget(null);
              stopScrollListening();
            }
          }
        }, TOOLTIP_HIDE_CLEANUP_DELAY_MS);
      }
      hideTimer = null;
    };
    if (delayMs > 0) hideTimer = setTimeout(runFade, delayMs);
    else runFade();
  } else {
    if (globalBox) {
      // 滚动 / 失焦 / 卸载：关过渡，立即隐藏，避免跟随锚点漂移时仍淡出
      globalBox.classList.add('v-tooltip-instant');
      globalBox.style.opacity = '0';
      globalBox.style.visibility = 'hidden';
      globalBox.style.transform = 'scale(0.95)';
      // visibility:hidden 本已退出命中测试，这里仍显式摘一次：让「隐藏即不可命中」
      // 成为两条隐藏路径共同的不变量，而不是各自依赖各自的属性
      setBoxClickThrough();
    }
    releaseBoxZ();
    floatingController.detach();
    setCurrentTarget(null);
    stopScrollListening();
  }
};

/** 元素是否处于原生 disabled（只有表单控件有这个属性；其余元素读到 undefined，按未禁用处理）。 */
const isNativelyDisabled = (el: HTMLElement): boolean => (el as HTMLButtonElement).disabled === true;

interface TooltipHandler {
  opts: TooltipOptions;
  /** hover / focus 事件的实际宿主（opts.trigger 的解析结果）：'self' 时即 el 自身，给选择器时为命中的祖先 */
  host: HTMLElement;
  /**
   * 提示是否因「按钮被自身状态置为 disabled、浏览器夺焦」而收起：等它重新可用时补显示。
   * 置位见 onBlur，消费见 updated。
   */
  suspendedByDisable: boolean;
  /** 解绑当前宿主上的四个事件监听（trigger 变更 / 卸载时调用） */
  detachHostEvents: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
}

const handlerMap = new WeakMap<HTMLElement, TooltipHandler>();

/** 解析 hover / focus 的触发宿主：'self'（或未给）即指令元素自身；其余按 CSS 选择器向上 closest，找不到回退自身。 */
const resolveTriggerHost = (el: HTMLElement, trigger: string | undefined): HTMLElement => {
  if (!trigger || trigger === 'self') return el;
  return el.closest(trigger) ?? el;
};

/**
 * 把 hover / focus 四个监听挂到**解析出的宿主**上，返回解绑函数。
 *
 * 宿主与 el 分离是为了支持「委托上级节点触发」：tooltip 常挂在图标 / 截断文字本体上，命中面只有
 * 那一小块；委托后鼠标停在整行 / 整卡任意位置即显示。**定位锚点仍是 el** —— 提示描述的是它，
 * 内容与箭头都该贴着它，被放大的只有触发范围。
 *
 * 命中失败时回退到自身：宁可退化成「只在原元素上触发」，也不要静默不触发。
 */
const attachHostEvents = (el: HTMLElement, handler: TooltipHandler): (() => void) => {
  const host = resolveTriggerHost(el, handler.opts.trigger);
  handler.host = host;
  // 焦点事件分两种写法：委托宿主是**容器**，焦点通常落在其后代上，而 focus / blur 不冒泡、
  // 容器上永远收不到，故委托时改用冒泡版 focusin / focusout；self 场景沿用 focus / blur，
  // 与接入前逐字一致（不因改成冒泡版而把「后代聚焦」也纳入触发）。
  const focusEvent = host === el ? 'focus' : 'focusin';
  const blurEvent = host === el ? 'blur' : 'focusout';
  host.addEventListener('mouseenter', handler.onMouseEnter);
  host.addEventListener('mouseleave', handler.onMouseLeave);
  host.addEventListener(focusEvent, handler.onFocus);
  host.addEventListener(blurEvent, handler.onBlur);
  return () => {
    host.removeEventListener('mouseenter', handler.onMouseEnter);
    host.removeEventListener('mouseleave', handler.onMouseLeave);
    host.removeEventListener(focusEvent, handler.onFocus);
    host.removeEventListener(blurEvent, handler.onBlur);
  };
};

export const vTooltip: Directive<HTMLElement, TooltipBinding, TooltipModifiers> = {
  mounted(el, binding) {
    if (!isClient) return;
    const opts = normalize(binding.value, binding.modifiers);
    const handler: TooltipHandler = {
      opts,
      host: el,
      suspendedByDisable: false,
      detachHostEvents: () => {},
      onMouseEnter: () => {
        // 手动模式下忽略悬停，显隐完全交由 visible 驱动
        if (!handler.opts.manual) showTooltip(el, handler.opts, false);
      },
      onMouseLeave: () => {
        if (!handler.opts.manual) hideTooltip(el, false);
      },
      // 键盘 Tab 聚焦时能够正常无障碍唤起
      onFocus: () => {
        if (!handler.opts.manual) showTooltip(el, handler.opts, true);
      },
      onBlur: () => {
        if (handler.opts.manual) return;
        // 按钮被自身状态（loading / 重入锁）置为 disabled 时，浏览器会夺焦并派发 blur —— 实测确认
        // （Chromium：disabled=true 当刻 activeElement 即退回 body）。这不是用户把焦点移开：指针
        // 多半还停在按钮上。照常收起本身没错，但收起之后**没有任何事件能把它唤回来** —— 指针没动，
        // mouseenter 不会再触发，而禁用控件上鼠标事件根本不派发（实测：指针从禁用按钮上移开时收不到
        // mouseleave），于是「复制长图」这类按钮在 loading 结束后就再也不显示提示了。
        // 故记下这次「被状态夺焦」，等它重新可用时在 updated 里补显示（判据见那里）。
        if (isNativelyDisabled(el)) handler.suspendedByDisable = true;
        hideTooltip(el, true);
      },
    };

    handlerMap.set(el, handler);
    // 触发宿主由 opts.trigger 决定（默认自身；给选择器则委托上级节点），挂载期解析一次。
    // 宿主变更的检测在 updated 里：宿主换了而监听还留在原元素上，「悬停整行显示」会静默失效。
    handler.detachHostEvents = attachHostEvents(el, handler);

    if (opts.manual && opts.visible)
      // 手动模式初始即显示
      showTooltip(el, handler.opts, true);
    // 初始 hover 检查必须用宿主：委托场景下鼠标可能已停在祖先上，而 el 自身并未被命中
    else if (handler.host.matches?.(':hover')) showTooltip(el, handler.opts, false);
  },
  updated(el, binding) {
    if (!isClient) return;
    const handler = handlerMap.get(el);
    if (!handler) return;
    handler.opts = normalize(binding.value, binding.modifiers);
    const { manual, visible } = handler.opts;

    // trigger 变更 → 宿主不再是当前元素时重挂事件。宿主换了而监听还留在原元素上，
    // 「悬停整行显示」就静默失效了。宿主解析走 closest，所以该判断对 DOM 结构变化同样兜底。
    if (resolveTriggerHost(el, handler.opts.trigger) !== handler.host) {
      handler.detachHostEvents();
      handler.detachHostEvents = attachHostEvents(el, handler);
    }

    if (manual) {
      // 手动模式：显隐完全由 visible 驱动，并随内容变化实时刷新
      if (visible) {
        if (currentTargetEl !== el)
          // 从隐藏到显示
          showTooltip(el, handler.opts, true);
        else if (globalContent) {
          // 显示中：同步最新内容与定位
          setTooltipContent(globalContent, handler.opts);
          updatePosition(handler.opts);
        }
      } else if (currentTargetEl === el)
        // 非即时隐藏：manualFade 会播放淡出出场动画
        hideTooltip(el, false);

      return;
    }

    if (currentTargetEl === el) {
      if (handler.opts.disabled || !hasTooltipContent(handler.opts)) hideTooltip(el, true);
      else if (globalContent) {
        setTooltipContent(globalContent, handler.opts);
        updatePosition(handler.opts);
      }
    }
    // 补显示：上一次渲染里这个按钮被置为 disabled、浏览器夺焦收起了提示（见 onBlur），现在它重新
    // 可用了。判据只能是 :hover —— 禁用期间鼠标事件不派发，指针还在不在按钮上问不到事件，
    // 而 :hover 实测在禁用态下依旧如实跟随指针（在按钮上为 true、移开后为 false）。指针已经离开
    // 就不再弹出来（否则会凭空冒出一个提示）；宿主是委托范围，故问宿主而不是 el。
    //
    // 上面那对花括号是**语义必需**、不是风格选择：收起之后 `currentTargetEl` 已被清成 null，
    // 而这条分支恰好在「不是当前目标」时才该跑。少了花括号，`else if` 会依据就近绑定规则挂到
    // **内层**那个 `if` 上，于是只在 `currentTargetEl === el` 时才被求值 —— 在它唯一该发挥作用的
    // 场景里永不执行，整个补显示沦为死代码（本文件踩过一次，用例见
    // tests/ui/directives/vTooltipDisableRecovery.test.ts）。
    else if (handler.suspendedByDisable && !handler.opts.disabled && !isNativelyDisabled(el)) {
      handler.suspendedByDisable = false;
      if (handler.host.matches?.(':hover')) showTooltip(el, handler.opts, false);
    }
  },
  unmounted(el) {
    if (!isClient) return;
    const handler = handlerMap.get(el);
    if (handler) {
      handler.detachHostEvents();
      handlerMap.delete(el);
    }
    // 挂起中的延时显示若属于本实例必须摘除：否则定时器稍后触发会把浮层打在 (0,0) 无人收起
    if (showTimerEl === el && showTimer) {
      clearTimeout(showTimer);
      showTimer = null;
      showTimerEl = null;
    }
    if (currentTargetEl === el) hideTooltip(el, true);
  },
};
