import { useUiStore } from '@/stores/uiStore';
import { autoUpdate, computePosition, flip, offset, shift, type Placement } from '@floating-ui/dom';
import type { Directive } from 'vue';
import './vTooltip.less';

interface TooltipOptions {
  content?: string;
  placement?: Placement;
}
export type TooltipBinding = string | TooltipOptions | undefined;

const normalize = (value: TooltipBinding): TooltipOptions =>
  typeof value === 'string' ? { content: value } : (value ?? {});

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
  const uiStore = useUiStore();
  if (!opts.content || uiStore.isMobile) return;

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

export const vTooltip: Directive<HTMLElement, TooltipBinding> = {
  mounted(el, binding) {
    const opts = normalize(binding.value);
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
    handler.opts = normalize(binding.value);

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
