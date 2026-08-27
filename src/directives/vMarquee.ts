import type { Directive } from 'vue';

export interface MarqueeOptions {
  /** 触发模式：hover 悬停/聚焦时滚动，always 常驻轮播，none 永不滚动 */
  mode?: 'hover' | 'always' | 'none';
  /** 循环模式：pingpong 来回摆动 | continuous 单向首尾无缝循环 */
  loopMode?: 'pingpong' | 'continuous';
  /** 连续无缝循环时的首尾间距（单位 px） */
  gap?: number;
  /** 滚动速度，单位 px/秒（与 duration 二选一，优先级低于 duration） */
  speed?: number;
  /** 单程滚动时长，单位毫秒（设置后忽略 speed） */
  duration?: number;
  /** 首次开始前的延迟，单位毫秒 */
  delay?: number;
  /** 滚动方向 */
  direction?: 'left' | 'right';
  /** 是否在两端短暂停顿（仅在 pingpong 模式下生效） */
  pauseOnEdges?: boolean;
  /** 单次滚动结束、反向前的停留时长，单位毫秒（仅在 pauseOnEdges 时生效） */
  pauseDuration?: number;
  /** 是否在两端添加羽化渐变遮罩，可指定渐变宽度（px） */
  fade?: boolean | number;
  /** 生命周期回调 */
  onStart?: () => void;
  onEnd?: () => void;
  onOverflowChange?: (overflowing: boolean) => void;
}

export type MarqueeBinding = MarqueeOptions | undefined;

export type MarqueeModifiers =
  | 'hover'
  | 'always'
  | 'none'
  | 'left'
  | 'right'
  | 'no-pause'
  | 'continuous'
  | 'pingpong'
  | 'fade'
  | (string & Record<never, never>);

const DEFAULTS: Required<Omit<MarqueeOptions, 'onStart' | 'onEnd' | 'onOverflowChange'>> &
  Pick<MarqueeOptions, 'onStart' | 'onEnd' | 'onOverflowChange'> = {
  mode: 'hover',
  loopMode: 'pingpong',
  gap: 24,
  speed: 50,
  duration: undefined as unknown as number,
  delay: 0,
  direction: 'left',
  pauseOnEdges: true,
  pauseDuration: 1000,
  fade: false,
  onStart: undefined,
  onEnd: undefined,
  onOverflowChange: undefined,
};

interface MarqueeState {
  inner: HTMLSpanElement;
  options: typeof DEFAULTS;
  overflowing: boolean;
  hovered: boolean;
  focused: boolean;
  reducedMotion: boolean;
  wasActive: boolean;
  sig: string | null;
  animation: Animation | null;
  observer: ResizeObserver;
  mql: MediaQueryList;
  cleanups: Array<() => void>;
}

const STATES = new WeakMap<HTMLElement, MarqueeState>();

function resolveOptions(binding: MarqueeBinding, modifiers?: Record<string, boolean>): typeof DEFAULTS {
  const base: MarqueeOptions = binding && typeof binding === 'object' ? { ...binding } : {};

  if (modifiers) {
    if (modifiers.hover) base.mode = 'hover';
    if (modifiers.always) base.mode = 'always';
    if (modifiers.none) base.mode = 'none';
    if (modifiers.left) base.direction = 'left';
    if (modifiers.right) base.direction = 'right';
    if (modifiers['no-pause']) base.pauseOnEdges = false;
    if (modifiers.continuous) base.loopMode = 'continuous';
    if (modifiers.pingpong) base.loopMode = 'pingpong';
    if (modifiers.fade) base.fade = true;
  }

  return { ...DEFAULTS, ...base };
}

function emit<T = unknown>(el: HTMLElement, name: string, detail?: T, cb?: (value: T) => void): void {
  el.dispatchEvent(new CustomEvent(name, { detail, bubbles: false }));
  cb?.(detail as T);
}

function shouldAnimate(state: MarqueeState): boolean {
  if (state.options.mode === 'none') return false;
  if (state.options.mode === 'always') return true;
  return state.hovered || state.focused;
}

function applyFadeMask(el: HTMLElement, state: MarqueeState): void {
  if (!state.options.fade || !state.overflowing) {
    el.style.maskImage = '';
    el.style.webkitMaskImage = '';
    return;
  }
  const fadeWidth = typeof state.options.fade === 'number' ? state.options.fade : 16;
  const mask = `linear-gradient(to right, transparent 0px, black ${fadeWidth}px, black calc(100% - ${fadeWidth}px), transparent 100%)`;
  el.style.maskImage = mask;
  el.style.webkitMaskImage = mask;
}

function measure(el: HTMLElement): void {
  const state = STATES.get(el);
  if (!state) return;
  const { inner, options } = state;

  const dist = Math.max(0, inner.scrollWidth - el.clientWidth);
  const overflowing = dist > 1;

  if (overflowing !== state.overflowing) {
    state.overflowing = overflowing;
    emit(el, 'marquee-overflow-change', overflowing, options.onOverflowChange);
  }

  applyFadeMask(el, state);
  update(el);
}

function update(el: HTMLElement): void {
  const state = STATES.get(el);
  if (!state) return;
  const { inner, options, overflowing } = state;

  const active = overflowing && !state.reducedMotion && shouldAnimate(state);

  if (!active) {
    if (state.animation) {
      state.animation.cancel();
      state.animation = null;
    }
    state.sig = null;
    inner.style.animation = '';
    inner.style.transform =
      options.direction === 'right'
        ? `translateX(-${Math.max(0, inner.scrollWidth - el.clientWidth)}px)`
        : 'translateX(0px)';
  } else {
    const dist = inner.scrollWidth - el.clientWidth;
    const isContinuous = options.loopMode === 'continuous';

    if (isContinuous) {
      const travelDist = inner.scrollWidth + options.gap;
      const moveMs = options.duration != null ? options.duration : Math.max(800, (travelDist / options.speed) * 1000);
      const frames =
        options.direction === 'right'
          ? [
              { offset: 0, transform: `translateX(-${travelDist}px)` },
              { offset: 1, transform: 'translateX(0px)' },
            ]
          : [
              { offset: 0, transform: 'translateX(0px)' },
              { offset: 1, transform: `translateX(-${travelDist}px)` },
            ];

      const sig = `continuous|${travelDist}|${moveMs}|${options.direction}`;
      if (state.sig !== sig) {
        if (state.animation) state.animation.cancel();
        state.animation = inner.animate(frames, {
          duration: moveMs,
          iterations: Infinity,
          easing: 'linear',
          delay: Math.max(0, options.delay),
        });
        state.sig = sig;
      }
    } else {
      // Ping-pong 往返摆动模式
      const moveMs = options.duration != null ? options.duration : Math.max(500, (dist / options.speed) * 1000);
      const pauseMs = options.pauseOnEdges ? Math.max(0, options.pauseDuration) : 0;
      const total = 2 * moveMs + 2 * pauseMs;
      const moveFrac = moveMs / total;
      const pauseFrac = pauseMs / total;

      const frames =
        options.direction === 'right'
          ? [
              { offset: 0, transform: `translateX(-${dist}px)` },
              { offset: moveFrac, transform: 'translateX(0px)' },
              { offset: moveFrac + pauseFrac, transform: 'translateX(0px)' },
              { offset: 2 * moveFrac + pauseFrac, transform: `translateX(-${dist}px)` },
              { offset: 1, transform: `translateX(-${dist}px)` },
            ]
          : [
              { offset: 0, transform: 'translateX(0px)' },
              { offset: moveFrac, transform: `translateX(-${dist}px)` },
              { offset: moveFrac + pauseFrac, transform: `translateX(-${dist}px)` },
              { offset: 2 * moveFrac + pauseFrac, transform: 'translateX(0px)' },
              { offset: 1, transform: 'translateX(0px)' },
            ];

      const sig = `pingpong|${dist}|${moveMs}|${pauseMs}|${options.direction}`;
      if (state.sig !== sig) {
        if (state.animation) state.animation.cancel();
        state.animation = inner.animate(frames, {
          duration: total,
          iterations: Infinity,
          easing: 'linear',
          delay: Math.max(0, options.delay),
        });
        state.sig = sig;
      }
    }
  }

  if (active && !state.wasActive) emit(el, 'marquee-start', undefined, options.onStart);
  if (!active && state.wasActive) emit(el, 'marquee-end', undefined, options.onEnd);
  state.wasActive = active;
}

export const vMarquee: Directive<HTMLElement, MarqueeBinding, MarqueeModifiers> = {
  mounted(el, binding) {
    const options = resolveOptions(binding.value, binding.modifiers);

    el.classList.add('marquee-viewport');

    const inner = document.createElement('span');
    inner.className = 'marquee-inner';
    // 将插槽内容收集进 inner
    while (el.firstChild) inner.appendChild(el.firstChild);
    el.appendChild(inner);

    const state: MarqueeState = {
      inner,
      options,
      overflowing: false,
      hovered: false,
      focused: false,
      reducedMotion: false,
      wasActive: false,
      sig: null,
      animation: null,
      observer: undefined as unknown as ResizeObserver,
      mql: undefined as unknown as MediaQueryList,
      cleanups: [],
    };
    STATES.set(el, state);

    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    state.mql = mql;
    const onMql = () => {
      state.reducedMotion = mql.matches;
      update(el);
    };
    mql.addEventListener('change', onMql);
    state.reducedMotion = mql.matches;

    const onEnter = () => {
      state.hovered = true;
      update(el);
    };
    const onLeave = () => {
      state.hovered = false;
      update(el);
    };
    const onFocusIn = () => {
      state.focused = true;
      update(el);
    };
    const onFocusOut = () => {
      state.focused = false;
      update(el);
    };
    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', onLeave);
    el.addEventListener('focusin', onFocusIn);
    el.addEventListener('focusout', onFocusOut);

    // 重点：同时监听容器 el 与内部内容 inner，确保内部文本变化时也能立即触发测量
    const observer = new ResizeObserver(() => measure(el));
    observer.observe(el);
    observer.observe(inner);
    state.observer = observer;

    state.cleanups.push(() => {
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mouseleave', onLeave);
      el.removeEventListener('focusin', onFocusIn);
      el.removeEventListener('focusout', onFocusOut);
      mql.removeEventListener('change', onMql);
      observer.disconnect();
      state.animation?.cancel();
    });

    measure(el);
  },

  updated(el, binding) {
    const state = STATES.get(el);
    if (!state) return;

    // 1. 同步最新的 binding 配置与修饰符
    state.options = resolveOptions(binding.value, binding.modifiers);

    // 2. 将 Vue 动态更新到 el 下的新子节点平滑收拢进 inner
    Array.from(el.childNodes).forEach(node => {
      if (node !== state.inner) state.inner.appendChild(node);
    });

    measure(el);
  },

  unmounted(el) {
    const state = STATES.get(el);
    if (!state) return;
    state.cleanups.forEach(fn => fn());
    STATES.delete(el);
  },
};
