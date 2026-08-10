// directives/vTooltip.ts
import './vTooltip.less';

// directives/vTooltip.ts
import { useUiStore } from '@/stores/uiStore';
import { autoUpdate, computePosition, flip, offset, shift, type Placement } from '@floating-ui/dom';
import type { Directive } from 'vue';

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

  // opts 用 state 上的可变字段承载，而不是闭包捕获 mounted 时的初始值——
  // 这样 content 在组件生命周期内变化（比如从有值变空、再变回有值）时，
  // show() 触发时读到的永远是 updated 钩子写入的最新值
  const state: TooltipState = {
    box,
    opts: initialOpts,
    show: () => {},
    hide: () => {},
    cleanupAutoUpdate: () => cleanupAutoUpdate(),
    onMouseEnter: () => {},
    onMouseLeave: () => {},
    onFocus: () => {},
    onBlur: () => {},
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

  const hide = () => {
    box.style.opacity = '0';
    cleanupAutoUpdate();
    cleanupAutoUpdate = () => {};

    // 🌟 等待 0.15s 的 opacity 过渡结束后，再隐藏 visibility
    setTimeout(() => {
      // 防止在等待期间用户又触发了 show，导致把正在显示的 box 又隐藏掉
      if (box.style.opacity === '0') {
        box.style.visibility = 'hidden';
      }
    }, 150);
  };

  state.show = show;
  state.hide = hide;
  state.onMouseEnter = show;
  state.onMouseLeave = hide;
  state.onFocus = show;
  state.onBlur = hide;

  return state;
};

export const vTooltip: Directive<HTMLElement, TooltipBinding> = {
  mounted(el, binding) {
    // 无条件创建 box 和监听器，不因初始 content 为空就跳过——
    // content 允许在组件生命周期内从空变有值（例如 Fretboard 按音/清空按音场景）
    const state = createState(el, normalize(binding.value));
    stateMap.set(el, state);
    el.addEventListener('mouseenter', state.onMouseEnter);
    el.addEventListener('mouseleave', state.onMouseLeave);
    el.addEventListener('focus', state.onFocus);
    el.addEventListener('blur', state.onBlur);
  },
  updated(el, binding) {
    const state = stateMap.get(el);
    if (!state) return;

    const nextOpts = normalize(binding.value);
    state.opts = nextOpts;

    // content 变为空时，若气泡正显示中，立即收起，不等下一次 mouseleave 才消失
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
    stateMap.delete(el);
  },
};
