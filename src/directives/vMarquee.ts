import type { Directive } from 'vue';

import {
  MARQUEE_DEFAULT_FADE_WIDTH,
  MARQUEE_MIN_DURATION_CONTINUOUS_MS,
  MARQUEE_MIN_DURATION_PINGPONG_MS,
  MARQUEE_RESET_DURATION_MS,
  MARQUEE_RESET_EASING,
} from '@/utils/core/constants';

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
  /** 停用后的平滑复位动画（进行中时阻止重复触发与循环重启） */
  resetAnim: Animation | null;
  observer: ResizeObserver;
  mql: MediaQueryList;
  cleanups: Array<() => void>;
}

const STATES = new WeakMap<HTMLElement, MarqueeState>();

/** 合并绑定值与修饰符得到完整配置：修饰符（hover/always/left/fade 等）优先级高于绑定值。 */
function resolveOptions(binding: MarqueeBinding, modifiers?: Record<string, boolean>): typeof DEFAULTS {
  const base: MarqueeOptions = binding && typeof binding === 'object' ? { ...binding } : {};

  if (modifiers) {
    if (modifiers['hover']) base.mode = 'hover';
    if (modifiers['always']) base.mode = 'always';
    if (modifiers['none']) base.mode = 'none';
    if (modifiers['left']) base.direction = 'left';
    if (modifiers['right']) base.direction = 'right';
    if (modifiers['no-pause']) base.pauseOnEdges = false;
    if (modifiers['continuous']) base.loopMode = 'continuous';
    if (modifiers['pingpong']) base.loopMode = 'pingpong';
    if (modifiers['fade']) base.fade = true;
  }

  return { ...DEFAULTS, ...base };
}

/** 在宿主元素上派发不冒泡的 CustomEvent，并同步调用绑定值里的回调。 */
function emit<T = unknown>(el: HTMLElement, name: string, detail?: T, cb?: (value: T) => void): void {
  el.dispatchEvent(new CustomEvent(name, { detail, bubbles: false }));
  cb?.(detail as T);
}

/** 判定当前是否应处于滚动状态：always 常滚，hover 模式需悬停或聚焦，none 永不滚动。 */
function shouldAnimate(state: MarqueeState): boolean {
  if (state.options.mode === 'none') return false;
  if (state.options.mode === 'always') return true;
  return state.hovered || state.focused;
}

/** 按配置在两端应用羽化渐变遮罩；未开启或未溢出时清除遮罩。 */
function applyFadeMask(el: HTMLElement, state: MarqueeState): void {
  if (!state.options.fade || !state.overflowing) {
    el.style.maskImage = '';
    el.style.webkitMaskImage = '';
    return;
  }
  const fadeWidth = typeof state.options.fade === 'number' ? state.options.fade : MARQUEE_DEFAULT_FADE_WIDTH;
  const mask = `linear-gradient(to right, transparent 0px, black ${fadeWidth}px, black calc(100% - ${fadeWidth}px), transparent 100%)`;
  el.style.maskImage = mask;
  el.style.webkitMaskImage = mask;
}

/** 测量内容是否溢出（宽度差 > 1px），溢出状态变化时派发事件，并联动遮罩与动画刷新。 */
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

/** 核心：根据溢出/激活状态启停 Web Animations；continuous 与 pingpong 各自构造关键帧，签名未变时复用动画。 */
function update(el: HTMLElement): void {
  const state = STATES.get(el);
  if (!state) return;
  const { inner, options, overflowing } = state;

  const active = overflowing && !state.reducedMotion && shouldAnimate(state);

  if (!active) {
    state.sig = null;
    if (state.animation) {
      // 先取样当前滚动位置，cancel 后元素会瞬间回落到 inline 静止位
      const current = getComputedStyle(inner).transform;
      state.animation.cancel();
      state.animation = null;
      if (!state.reducedMotion && current !== 'none') {
        // 从当前位置平滑滚回起始位，避免移出瞬间的硬切
        const restTransform =
          options.direction === 'right'
            ? `translateX(-${Math.max(0, inner.scrollWidth - el.clientWidth)}px)`
            : 'translateX(0px)';
        const reset = inner.animate([{ transform: current }, { transform: restTransform }], {
          duration: MARQUEE_RESET_DURATION_MS,
          easing: MARQUEE_RESET_EASING,
        });
        reset.onfinish = () => {
          // 期间可能已被再次激活并取消，仅当仍是本次复位动画时才落定静止位
          if (state.resetAnim === reset) {
            state.resetAnim = null;
            inner.style.transform = restTransform;
          }
        };
        state.resetAnim = reset;
        inner.style.animation = '';
        // 提前return前补发 end 事件，保持生命周期回调语义与直落路径一致
        if (state.wasActive) emit(el, 'marquee-end', undefined, options.onEnd);
        state.wasActive = false;
        return;
      }
    }
    if (state.resetAnim) return; // 复位动画进行中，让其自然结束
    inner.style.animation = '';
    inner.style.transform =
      options.direction === 'right'
        ? `translateX(-${Math.max(0, inner.scrollWidth - el.clientWidth)}px)`
        : 'translateX(0px)';
  } else {
    // 重新激活：立即结束尚未完成的复位动画并落定到静止位，循环从头开始
    if (state.resetAnim) {
      state.resetAnim.cancel();
      state.resetAnim = null;
      inner.style.transform =
        options.direction === 'right'
          ? `translateX(-${Math.max(0, inner.scrollWidth - el.clientWidth)}px)`
          : 'translateX(0px)';
    }
    const dist = inner.scrollWidth - el.clientWidth;
    const isContinuous = options.loopMode === 'continuous';

    if (isContinuous) {
      const travelDist = inner.scrollWidth + options.gap;
      const moveMs =
        options.duration != null
          ? options.duration
          : Math.max(MARQUEE_MIN_DURATION_CONTINUOUS_MS, (travelDist / options.speed) * 1000);
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
      const moveMs =
        options.duration != null
          ? options.duration
          : Math.max(MARQUEE_MIN_DURATION_PINGPONG_MS, (dist / options.speed) * 1000);
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
      resetAnim: null,
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
      state.resetAnim?.cancel();
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
