import { TOOLTIP_HIDE_CLEANUP_DELAY_MS } from '@/utils/core/constants';
import { buildFloatingArrowStyle } from '@/utils/ui/floatingArrow';
import { acquireFloatingZ, releaseFloatingZ } from '@/utils/ui/floatingZ';
import {
  autoUpdate,
  computePosition,
  flip,
  arrow as floatingArrow,
  offset,
  shift,
  type Placement,
} from '@floating-ui/dom';
import type { Directive } from 'vue';
import './vTooltip.scss';

export interface TooltipOptions {
  content?: string;
  placement?: Placement;
  /** 延迟显示/隐藏时长（毫秒），支持 [showDelay, hideDelay] */
  delay?: number | [number, number];
  showDelay?: number;
  hideDelay?: number;
  /** 是否禁用提示 */
  disabled?: boolean;
  /** 自定义样式类名 */
  customClass?: string;
  /** 是否显示指示箭头，默认 true */
  showArrow?: boolean;
}

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
  | (string & Record<never, never>);

export type TooltipBinding = string | TooltipOptions | undefined;

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

const getPlacementFromModifiers = (modifiers?: Record<string, boolean>): Placement | undefined => {
  if (!modifiers) return undefined;
  const keys = Object.keys(modifiers);
  if (keys.length === 0) return undefined;

  for (const key of keys) {
    if (VALID_PLACEMENTS.includes(key as Placement)) {
      return key as Placement;
    }
  }

  const baseSide = ['top', 'bottom', 'left', 'right'].find(side => modifiers[side]);
  if (baseSide) {
    const alignment = ['start', 'end'].find(align => modifiers[align]);
    if (alignment) {
      return `${baseSide}-${alignment}` as Placement;
    }
    return baseSide as Placement;
  }

  return undefined;
};

const normalize = (value: TooltipBinding, modifiers?: Record<string, boolean>): TooltipOptions => {
  const base = typeof value === 'string' ? { content: value } : { ...value };
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
let appliedCustomClass = '';
// tooltip 当前在浮层层级池中持有的层号（单例，同一时刻最多持有一个）
let boxZOwned = false;

const isClient = typeof document !== 'undefined';

const getOrCreateGlobalBox = (): HTMLDivElement | null => {
  if (!isClient) return null;
  if (!globalBox) {
    globalBox = document.createElement('div');
    globalBox.style.cssText =
      'position:fixed;top:0;left:0;pointer-events:none;opacity:0;visibility:hidden;transition:opacity .08s ease;';
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

    // 任何容器滚动时立即隐藏：tooltip 是 fixed 定位，滚动会让它飘离锚点
    window.addEventListener(
      'scroll',
      () => {
        if (currentTargetEl) hideTooltip(currentTargetEl, true);
      },
      true
    );
  }
  return globalBox;
};

/** 释放 tooltip 当前持有的层级（有持有才释放，避免误删池中他人的层号） */
const releaseBoxZ = () => {
  if (!boxZOwned || !globalBox) return;
  releaseFloatingZ(Number(globalBox.style.zIndex) || 0);
  boxZOwned = false;
};

const updatePosition = async (el: HTMLElement, opts: TooltipOptions): Promise<void> => {
  if (!globalBox || !isClient) return;

  const middleware = [offset(8), flip({ fallbackAxisSideDirection: 'start' }), shift({ padding: 12 })];
  if (opts.showArrow && globalArrow) {
    middleware.push(floatingArrow({ element: globalArrow, padding: 6 }));
  }

  const { x, y, placement, middlewareData } = await computePosition(el, globalBox, {
    placement: opts.placement ?? 'top',
    middleware,
  });

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

const clearTimers = () => {
  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = null;
  }
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
};

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

const executeShow = async (el: HTMLElement, opts: TooltipOptions) => {
  if (!isClient || opts.disabled || !opts.content) return;

  const box = getOrCreateGlobalBox();
  if (!box || !globalContent) return;

  currentTargetEl = el;

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

  globalContent.textContent = opts.content;

  // 关键：先计算准确坐标，完成后再显隐，杜绝 (0, 0) 闪烁 (FOUC)
  await updatePosition(el, opts);

  if (currentTargetEl === el) {
    box.style.visibility = 'visible';
    box.style.opacity = '1';

    cleanupAutoUpdate?.();
    cleanupAutoUpdate = autoUpdate(el, box, () => updatePosition(el, opts));
  }
};

const showTooltip = (el: HTMLElement, opts: TooltipOptions, immediate = false) => {
  if (!isClient || opts.disabled || !opts.content) return;
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

const hideTooltip = (el: HTMLElement, immediate = false) => {
  if (!isClient || currentTargetEl !== el) return;
  clearTimers();

  const handler = handlerMap.get(el);
  const { hide } = resolveDelay(handler?.opts ?? {});
  const delayMs = immediate ? 0 : hide;

  if (delayMs > 0) {
    hideTimer = setTimeout(() => {
      if (currentTargetEl === el && globalBox) {
        globalBox.style.opacity = '0';
        releaseBoxZ();
        cleanupAutoUpdate?.();
        cleanupAutoUpdate = null;

        setTimeout(() => {
          if (globalBox && globalBox.style.opacity === '0') {
            globalBox.style.visibility = 'hidden';
            currentTargetEl = null;
          }
        }, TOOLTIP_HIDE_CLEANUP_DELAY_MS);
      }
      hideTimer = null;
    }, delayMs);
  } else {
    if (globalBox) {
      globalBox.style.opacity = '0';
      globalBox.style.visibility = 'hidden';
    }
    releaseBoxZ();
    cleanupAutoUpdate?.();
    cleanupAutoUpdate = null;
    currentTargetEl = null;
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
      if (handler.opts.disabled || !handler.opts.content) {
        hideTooltip(el, true);
      } else if (globalContent) {
        globalContent.textContent = handler.opts.content;
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
