import { useUiStore } from '@/stores/uiStore';
import { autoUpdate, computePosition, flip, offset, shift, type Placement } from '@floating-ui/dom';
import type { Directive } from 'vue';
import './vTooltip.less';

export interface TooltipOptions {
  content?: string;
  placement?: Placement;
}

export type TooltipBinding = string | TooltipOptions | undefined;

const normalize = (value: TooltipBinding): TooltipOptions =>
  typeof value === 'string' ? { content: value } : (value ?? {});

interface TooltipState {
  box: HTMLDivElement;
  opts: TooltipOptions;
  show: () => void;
  hide: () => void;
  cleanupAutoUpdate: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onClick: () => void;
}

const stateMap = new WeakMap<HTMLElement, TooltipState>();

const createState = (el: HTMLElement, initialOpts: TooltipOptions): TooltipState => {
  const box = document.createElement('div');
  box.className = 'v-tooltip-box';
  box.setAttribute('role', 'tooltip');
  box.style.cssText =
    'position:fixed;top:0;left:0;z-index:9999;pointer-events:none;opacity:0;visibility:hidden;transition:opacity .15s ease;';
  document.body.appendChild(box);

  let cleanupAutoUpdate = () => {};
  let isHovered = false;

  const hide = () => {
    box.style.opacity = '0';
    cleanupAutoUpdate();
    cleanupAutoUpdate = () => {};

    setTimeout(() => {
      if (box.style.opacity === '0') {
        box.style.visibility = 'hidden';
      }
    }, 150);
  };

  const state: TooltipState = {
    box,
    opts: initialOpts,
    show: () => {},
    hide: () => {},
    cleanupAutoUpdate: () => cleanupAutoUpdate(),
    onMouseEnter: () => {},
    onMouseLeave: () => {},
    onFocus: () => {},
    onBlur: hide,
    onClick: hide,
  };

  const updatePosition = () => {
    computePosition(el, box, {
      placement: state.opts.placement ?? 'top',
      middleware: [offset(8), flip({ fallbackAxisSideDirection: 'start' }), shift({ padding: 12 })],
    }).then(({ x, y }) => {
      box.style.left = `${x}px`;
      box.style.top = `${y}px`;
    });
  };

  const show = () => {
    const uiStore = useUiStore();
    if (!state.opts.content || uiStore.isMobile) return;
    box.textContent = state.opts.content;
    box.style.visibility = 'visible';
    box.style.opacity = '1';
    cleanupAutoUpdate();
    cleanupAutoUpdate = autoUpdate(el, box, updatePosition);
  };

  state.show = show;
  state.hide = hide;
  state.onMouseEnter = () => {
    isHovered = true;
    show();
  };
  state.onMouseLeave = () => {
    isHovered = false;
    hide();
  };
  state.onFocus = () => {
    if (isHovered) {
      show();
    }
  };
  state.onBlur = hide;

  return state;
};

export const vTooltip: Directive<HTMLElement, TooltipBinding> = {
  mounted(el, binding) {
    const state = createState(el, normalize(binding.value));
    stateMap.set(el, state);
    el.addEventListener('mouseenter', state.onMouseEnter);
    el.addEventListener('mouseleave', state.onMouseLeave);
    el.addEventListener('focus', state.onFocus);
    el.addEventListener('blur', state.onBlur);
    el.addEventListener('click', state.onClick);
  },
  updated(el, binding) {
    const state = stateMap.get(el);
    if (!state) return;

    const nextOpts = normalize(binding.value);
    state.opts = nextOpts;

    if (!nextOpts.content && state.box.style.visibility === 'visible') {
      state.hide();
    }
  },
  unmounted(el) {
    const state = stateMap.get(el);
    if (!state) return;
    state.cleanupAutoUpdate();
    state.box.remove();
    el.removeEventListener('mouseenter', state.onMouseEnter);
    el.removeEventListener('mouseleave', state.onMouseLeave);
    el.removeEventListener('focus', state.onFocus);
    el.removeEventListener('blur', state.onBlur);
    el.removeEventListener('click', state.onClick);
    stateMap.delete(el);
  },
};
