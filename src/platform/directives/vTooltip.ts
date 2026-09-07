import { autoUpdate, computePosition } from '@floating-ui/dom';

import { buildFloatingArrowStyle } from '@/platform/ui/popover/floatingArrow';
import { buildFloatingMiddlewares } from '@/platform/ui/popover/floatingCore';
import { acquireFloatingZ, releaseFloatingZ } from '@/platform/ui/popover/floatingZ';
import { TOOLTIP_HIDE_CLEANUP_DELAY_MS, TOOLTIP_INTERACTIVE_MIN_HIDE_DELAY_MS } from '@/platform/utils/constants';
import { logger } from '@/platform/utils/logger';

import type { Placement } from '@floating-ui/dom';
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
    if (VALID_PLACEMENTS.includes(combined)) {
      return combined;
    }
  }

  // 兜底：直接命中完整方位修饰符（如 v-tooltip.bottom-start 作为单键）
  for (const key of keys) {
    if (VALID_PLACEMENTS.includes(key as Placement)) {
      return key as Placement;
    }
  }

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
    if (modifierPlacement) {
      base.placement = modifierPlacement;
    }
  }
  // 箭头默认显示；显式传了 showArrow 以对象为准，否则用 .no-arrow 修饰符关闭
  if (base.showArrow === undefined) {
    base.showArrow = !modifiers?.['no-arrow'];
  }
  // 交互式默认 false；显式传了 interactive 以对象为准，否则用 .interactive 修饰符开启
  if (base.interactive === undefined) {
    base.interactive = !!modifiers?.['interactive'];
  }
  // 内容 HTML 渲染默认 false；显式传了 html 以对象为准，否则用 .html 修饰符开启
  if (base.html === undefined) {
    base.html = !!modifiers?.['html'];
  }
  // 禁用默认 false；显式传了 disabled 以对象为准，否则用 .disabled 修饰符关闭
  if (base.disabled === undefined) {
    base.disabled = !!modifiers?.['disabled'];
  }
  return base;
};

// 全局单例 DOM 与状态
// 结构：box（仅负责 fixed 定位，透明） > content（真正的视觉样式）+ arrow（sibling，z-index 更低，
// 与 content 重叠的一半会被 content 的不透明背景盖住，只露出朝外的尖角）
let globalBox: HTMLDivElement | null = null;
let globalContent: HTMLDivElement | null = null;
let globalArrow: HTMLDivElement | null = null;
let currentTargetEl: HTMLElement | null = null;
let cleanupAutoUpdate: (() => void) | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
// 淡出结束后的「补设 visibility:hidden」清理定时器：独立于 hideTimer 之外、同样纳入统一清理
let hideCleanupTimer: ReturnType<typeof setTimeout> | null = null;
let appliedCustomClass = '';
// tooltip 当前在浮层层级池中持有的层号（单例，同一时刻最多持有一个）
let boxZOwned = false;

const isClient = typeof document !== 'undefined';

let isScrollListening = false;
const onScrollCapture = () => {
  if (currentTargetEl) hideTooltip(currentTargetEl, true);
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

/** 销毁全局单例 tooltip DOM 与关联监听器（用于应用卸载、微前端或测试环境清理）。 */
export const destroyGlobalTooltip = () => {
  clearTimers();
  stopScrollListening();
  cleanupAutoUpdate?.();
  cleanupAutoUpdate = null;
  releaseBoxZ();
  if (globalBox && globalBox.parentElement) {
    globalBox.parentElement.removeChild(globalBox);
  }
  globalBox = null;
  globalContent = null;
  globalArrow = null;
  currentTargetEl = null;
  appliedCustomClass = '';
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
    globalContent.style.cssText = 'position:relative;z-index:1;';
    globalBox.appendChild(globalContent);

    globalArrow = document.createElement('div');
    globalArrow.className = 'v-tooltip-arrow';
    globalArrow.style.cssText = 'position:absolute;z-index:2;width:8px;height:8px;pointer-events:none;display:none;';
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

/** 用 floating-ui 计算并写入定位与箭头样式；锚点已切换时丢弃本次结果。 */
const updatePosition = async (el: HTMLElement, opts: TooltipOptions): Promise<void> => {
  if (!globalBox || !isClient) return;

  const middleware = buildFloatingMiddlewares({
    offsetDistance: opts.offset ?? 12,
    showArrow: opts.showArrow,
    getArrowEl: () => globalArrow,
  });

  // try/catch 兜底：computePosition 是异步计算，若锚点/参考 DOM 在计算期间被移除等极端场景会 reject。
  // 这里吞掉而非上抛——否则 executeShow / autoUpdate 回调 / updated 钩子里的 fire-and-forget 调用
  // 都会留下未处理的 rejected Promise。
  let result: Awaited<ReturnType<typeof computePosition>>;
  try {
    result = await computePosition(el, globalBox, {
      placement: opts.placement ?? 'bottom',
      strategy: 'fixed',
      middleware,
    });
  } catch {
    return;
  }
  const { x, y, placement, middlewareData } = result;

  if (!globalBox || currentTargetEl !== el) return;
  globalBox.style.left = `${x}px`;
  globalBox.style.top = `${y}px`;

  if (globalArrow) {
    if (opts.showArrow && middlewareData.arrow) {
      // 与 BasePopover 共用同一份箭头构建逻辑（zIndex: 2 垫在 content 之下）
      const style = buildFloatingArrowStyle({
        arrowX: middlewareData.arrow.x,
        arrowY: middlewareData.arrow.y,
        placement,
        background: 'var(--bg-panel)',
        borderColor: 'var(--glass-border)',
        backdropFilter: 'var(--blur-xl)',
        zIndex: 2,
      });
      globalArrow.style.display = 'block';
      for (const [key, value] of Object.entries(style)) {
        if (value == null) continue;
        if (key === 'WebkitBackdropFilter') {
          globalArrow.style.setProperty('-webkit-backdrop-filter', value);
        } else {
          (globalArrow.style as unknown as Record<string, string>)[key] = value;
        }
      }
    } else {
      globalArrow.style.display = 'none';
    }
  }
};

/** 清空显示/隐藏的延时定时器（含淡出后的清理定时器）。 */
const clearTimers = () => {
  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = null;
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
      } else {
        lineEl.textContent = line;
      }
      el.appendChild(lineEl);
    }
  } else if (html) {
    warnIfDangerousHtml(content);
    el.innerHTML = content;
  } else {
    el.textContent = content;
  }
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

  currentTargetEl = el;

  // 分配「当前最高 + 1」的层级，保证 tooltip 压住所有已打开的浮层（popover 等从 10001 起）
  releaseBoxZ();
  const z = acquireFloatingZ();
  boxZOwned = true;
  box.style.zIndex = String(z);

  // 交互式 tooltip 需要接收鼠标事件，才能感知「移入浮层」；否则保持穿透不挡点击
  box.style.pointerEvents = opts.interactive ? 'auto' : 'none';

  // 处理自定义类名（挂在 content 上，因为它才是承载视觉样式的元素）
  if (appliedCustomClass) {
    globalContent.classList.remove(...appliedCustomClass.split(' ').filter(Boolean));
    appliedCustomClass = '';
  }
  if (opts.customClass) {
    appliedCustomClass = opts.customClass;
    globalContent.classList.add(...appliedCustomClass.split(' ').filter(Boolean));
  }

  setTooltipContent(globalContent, opts);

  // 关键：先计算准确坐标，完成后再显隐，杜绝 (0, 0) 闪烁 (FOUC)
  await updatePosition(el, opts);

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

    cleanupAutoUpdate?.();
    cleanupAutoUpdate = autoUpdate(el, box, () => updatePosition(el, opts));
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
    showTimer = setTimeout(() => {
      executeShow(el, opts);
      showTimer = null;
    }, delayMs);
  } else {
    executeShow(el, opts);
  }
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

  if (delayMs > 0) {
    hideTimer = setTimeout(() => {
      if (currentTargetEl === el && globalBox) {
        // 离场：淡出并缩回 scale(.95)（即时路径才关过渡，见下）
        globalBox.style.opacity = '0';
        globalBox.style.transform = 'scale(0.95)';
        releaseBoxZ();
        cleanupAutoUpdate?.();
        cleanupAutoUpdate = null;

        // 淡出动画结束后的补设 visibility:hidden：存引用并纳入 clearTimers/destroy 统一清理，
        // 避免窗口期（动画播放中）触发元素被卸载后仍留下游离定时器访问模块单例
        hideCleanupTimer = setTimeout(() => {
          hideCleanupTimer = null;
          if (globalBox && globalBox.style.opacity === '0') {
            globalBox.style.visibility = 'hidden';
            if (currentTargetEl === el) {
              currentTargetEl = null;
              stopScrollListening();
            }
          }
        }, TOOLTIP_HIDE_CLEANUP_DELAY_MS);
      }
      hideTimer = null;
    }, delayMs);
  } else {
    if (globalBox) {
      // 滚动 / 失焦 / 卸载：关过渡，立即隐藏，避免跟随锚点漂移时仍淡出
      globalBox.classList.add('v-tooltip-instant');
      globalBox.style.opacity = '0';
      globalBox.style.visibility = 'hidden';
      globalBox.style.transform = 'scale(0.95)';
    }
    releaseBoxZ();
    cleanupAutoUpdate?.();
    cleanupAutoUpdate = null;
    currentTargetEl = null;
    stopScrollListening();
  }
};

interface TooltipHandler {
  opts: TooltipOptions;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
}

const handlerMap = new WeakMap<HTMLElement, TooltipHandler>();

/**
 * 立即隐藏 container 内部（含自身）元素正在显示的 tooltip。
 * 供浮层组件在面板打开时调用，避免触发元素上的 tooltip 与面板叠加显示。
 */
export const hideTooltipInside = (container?: HTMLElement | null) => {
  if (!container || !isClient || !currentTargetEl) return;
  if (container === currentTargetEl || container.contains(currentTargetEl)) {
    hideTooltip(currentTargetEl, true);
  }
};

export const vTooltip: Directive<HTMLElement, TooltipBinding, TooltipModifiers> = {
  mounted(el, binding) {
    if (!isClient) return;
    const opts = normalize(binding.value, binding.modifiers);
    const handler: TooltipHandler = {
      opts,
      onMouseEnter: () => showTooltip(el, handler.opts, false),
      onMouseLeave: () => hideTooltip(el, false),
      // 键盘 Tab 聚焦时能够正常无障碍唤起
      onFocus: () => showTooltip(el, handler.opts, true),
      onBlur: () => hideTooltip(el, true),
    };

    handlerMap.set(el, handler);
    el.addEventListener('mouseenter', handler.onMouseEnter);
    el.addEventListener('mouseleave', handler.onMouseLeave);
    el.addEventListener('focus', handler.onFocus);
    el.addEventListener('blur', handler.onBlur);

    if (el.matches?.(':hover')) {
      showTooltip(el, handler.opts, false);
    }
  },
  updated(el, binding) {
    if (!isClient) return;
    const handler = handlerMap.get(el);
    if (!handler) return;
    handler.opts = normalize(binding.value, binding.modifiers);

    if (currentTargetEl === el) {
      if (handler.opts.disabled || !hasTooltipContent(handler.opts)) {
        hideTooltip(el, true);
      } else if (globalContent) {
        setTooltipContent(globalContent, handler.opts);
        updatePosition(el, handler.opts);
      }
    }
  },
  unmounted(el) {
    if (!isClient) return;
    const handler = handlerMap.get(el);
    if (handler) {
      el.removeEventListener('mouseenter', handler.onMouseEnter);
      el.removeEventListener('mouseleave', handler.onMouseLeave);
      el.removeEventListener('focus', handler.onFocus);
      el.removeEventListener('blur', handler.onBlur);
      handlerMap.delete(el);
    }
    if (currentTargetEl === el) {
      hideTooltip(el, true);
    }
  },
};
