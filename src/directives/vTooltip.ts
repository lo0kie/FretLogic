import { autoUpdate, computePosition, flip, offset, shift, type Placement } from '@floating-ui/dom';
import type { Directive } from 'vue';
import './vTooltip.scss';

interface TooltipOptions {
  content?: string;
  placement?: Placement;
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

  // 1. 直接全词匹配（如 v-tooltip.bottom-start / v-tooltip.top-end）
  for (const key of keys) {
    if (VALID_PLACEMENTS.includes(key as Placement)) {
      return key as Placement;
    }
  }

  // 2. 组合修饰符拆分解析（如 v-tooltip.bottom.start -> 'bottom-start'）
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
let hideTimer: ReturnType<typeof setTimeout> | null = null;

const getOrCreateGlobalBox = (): HTMLDivElement => {
  if (!globalBox) {
    globalBox = document.createElement('div');
    globalBox.className = 'v-tooltip-box';
    globalBox.setAttribute('role', 'tooltip');
    globalBox.style.cssText =
      'position:fixed;top:0;left:0;z-index:9999;pointer-events:none;opacity:0;visibility:hidden;transition:opacity .15s ease;';
    document.body.appendChild(globalBox);
  }
  return globalBox;
};

const updatePosition = (el: HTMLElement, opts: TooltipOptions) => {
  if (!globalBox) return;
  computePosition(el, globalBox, {
    placement: opts.placement ?? 'top',
    middleware: [offset(8), flip({ fallbackAxisSideDirection: 'start' }), shift({ padding: 12 })],
  }).then(({ x, y }) => {
    if (globalBox && currentTargetEl === el) {
      globalBox.style.left = `${x}px`;
      globalBox.style.top = `${y}px`;
    }
  });
};

const showTooltip = (el: HTMLElement, opts: TooltipOptions) => {
  if (!opts.content) return;

  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  currentTargetEl = el;
  const box = getOrCreateGlobalBox();
  box.textContent = opts.content;
  box.style.visibility = 'visible';
  box.style.opacity = '1';

  updatePosition(el, opts);

  cleanupAutoUpdate?.();
  cleanupAutoUpdate = autoUpdate(el, box, () => updatePosition(el, opts));
};

const hideTooltip = (el: HTMLElement) => {
  if (currentTargetEl !== el) return;

  if (globalBox) {
    globalBox.style.opacity = '0';
  }
  cleanupAutoUpdate?.();
  cleanupAutoUpdate = null;

  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (globalBox && globalBox.style.opacity === '0') {
      globalBox.style.visibility = 'hidden';
      currentTargetEl = null;
    }
  }, 150);
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
    const opts = normalize(binding.value, binding.modifiers);
    const handler: TooltipHandler = {
      opts,
      onMouseEnter: () => showTooltip(el, handler.opts),
      onMouseLeave: () => hideTooltip(el),
      onFocus: () => {
        if (el.matches(':hover')) showTooltip(el, handler.opts);
      },
      onBlur: () => hideTooltip(el),
    };

    handlerMap.set(el, handler);
    el.addEventListener('mouseenter', handler.onMouseEnter);
    el.addEventListener('mouseleave', handler.onMouseLeave);
    el.addEventListener('focus', handler.onFocus);
    el.addEventListener('blur', handler.onBlur);

    if (el.matches(':hover')) {
      showTooltip(el, handler.opts);
    }
  },
  updated(el, binding) {
    const handler = handlerMap.get(el);
    if (!handler) return;
    handler.opts = normalize(binding.value, binding.modifiers);

    if (currentTargetEl === el) {
      if (!handler.opts.content) {
        hideTooltip(el);
      } else if (globalBox) {
        globalBox.textContent = handler.opts.content;
        updatePosition(el, handler.opts);
      }
    }
  },
  unmounted(el) {
    const handler = handlerMap.get(el);
    if (handler) {
      el.removeEventListener('mouseenter', handler.onMouseEnter);
      el.removeEventListener('mouseleave', handler.onMouseLeave);
      el.removeEventListener('focus', handler.onFocus);
      el.removeEventListener('blur', handler.onBlur);
      handlerMap.delete(el);
    }
    if (currentTargetEl === el) {
      hideTooltip(el);
    }
  },
};
