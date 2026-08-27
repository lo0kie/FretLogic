import { autoUpdate, computePosition, flip, offset, shift, type Placement } from '@floating-ui/dom';
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
  /** 是否显示指示箭头 */
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
  return base;
};

// 全局单例 DOM 与状态
let globalBox: HTMLDivElement | null = null;
let currentTargetEl: HTMLElement | null = null;
let cleanupAutoUpdate: (() => void) | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let appliedCustomClass = '';

const isClient = typeof document !== 'undefined';

const getOrCreateGlobalBox = (): HTMLDivElement | null => {
  if (!isClient) return null;
  if (!globalBox) {
    globalBox = document.createElement('div');
    globalBox.className = 'v-tooltip-box';
    globalBox.setAttribute('role', 'tooltip');
    globalBox.style.cssText =
      'position:fixed;top:0;left:0;z-index:9999;pointer-events:none;opacity:0;visibility:hidden;transition:opacity .08s ease;';
    document.body.appendChild(globalBox);
  }
  return globalBox;
};

const updatePosition = async (el: HTMLElement, opts: TooltipOptions): Promise<void> => {
  if (!globalBox || !isClient) return;
  const { x, y } = await computePosition(el, globalBox, {
    placement: opts.placement ?? 'top',
    middleware: [offset(8), flip({ fallbackAxisSideDirection: 'start' }), shift({ padding: 12 })],
  });
  if (globalBox && currentTargetEl === el) {
    globalBox.style.left = `${x}px`;
    globalBox.style.top = `${y}px`;
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
  if (!box) return;

  currentTargetEl = el;

  // 处理自定义类名
  if (appliedCustomClass) {
    box.classList.remove(...appliedCustomClass.split(' ').filter(Boolean));
    appliedCustomClass = '';
  }
  if (opts.customClass) {
    appliedCustomClass = opts.customClass;
    box.classList.add(...appliedCustomClass.split(' ').filter(Boolean));
  }

  box.textContent = opts.content;

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
        cleanupAutoUpdate?.();
        cleanupAutoUpdate = null;

        setTimeout(() => {
          if (globalBox && globalBox.style.opacity === '0') {
            globalBox.style.visibility = 'hidden';
            currentTargetEl = null;
          }
        }, 80);
      }
      hideTimer = null;
    }, delayMs);
  } else {
    if (globalBox) {
      globalBox.style.opacity = '0';
      globalBox.style.visibility = 'hidden';
    }
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
      } else if (globalBox) {
        globalBox.textContent = handler.opts.content;
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
