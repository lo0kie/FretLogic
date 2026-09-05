/**
 * v-wheel-scroll 指令：横向滚轮劫持滚动（触控板/鼠标滚轮自适应）。
 * 支持速度倍率、平滑惯性缓动、方向反转与边界穿透策略（contain/auto）。
 */
import type { Directive } from 'vue';

export type WheelScrollModifiers =
  'smooth' | 'reverse' | 'prevent' | 'stop' | 'contain' | 'auto' | (string & Record<never, never>);

export interface WheelScrollOptions {
  /** 滚动灵敏度/倍率，默认 1 */
  speed?: number;
  /** 是否启用平滑惯性滚动动画，默认 false（使用 .smooth 开启） */
  smooth?: boolean;
  /** 是否反转滚动方向 */
  reverse?: boolean;
  /** 是否禁用滚轮劫持 */
  disabled?: boolean;
  /** 是否阻止默认事件，默认 true */
  prevent?: boolean;
  /** 是否阻止事件冒泡，默认 false */
  stop?: boolean;
  /** 到达边界时的穿透策略：'contain' 始终拦截 | 'auto' 边界放行纵向滚动 */
  overscroll?: 'contain' | 'auto';
  /** 滚动回调 */
  onScroll?: (e: WheelEvent, progress: number) => void;
}

export type WheelScrollBinding = number | boolean | WheelScrollOptions | undefined;

/** 归一化指令配置：绑定值支持速度倍率/开关/选项对象，修饰符叠加并补齐默认值。 */
const normalize = (value: WheelScrollBinding, modifiers?: Record<string, boolean>): WheelScrollOptions => {
  let opts: WheelScrollOptions = {};
  if (typeof value === 'number') {
    opts.speed = value;
  } else if (typeof value === 'boolean') {
    opts.disabled = !value;
  } else if (value && typeof value === 'object') {
    opts = { ...value };
  }

  if (modifiers) {
    if (modifiers['smooth'] !== undefined) opts.smooth = Boolean(modifiers['smooth']);
    if (modifiers['reverse'] !== undefined) opts.reverse = Boolean(modifiers['reverse']);
    if (modifiers['prevent'] !== undefined) opts.prevent = Boolean(modifiers['prevent']);
    if (modifiers['stop'] !== undefined) opts.stop = Boolean(modifiers['stop']);
    if (modifiers['contain']) opts.overscroll = 'contain';
    if (modifiers['auto']) opts.overscroll = 'auto';
  }

  opts.speed = opts.speed ?? 1;
  opts.prevent = opts.prevent ?? true;
  opts.overscroll = opts.overscroll ?? 'contain';
  return opts;
};

interface WheelScrollHandler {
  opts: WheelScrollOptions;
  onWheel: (e: WheelEvent) => void;
  onPointerDown: () => void;
}

interface SmoothScrollState {
  target: number;
  rafId: number | null;
}

const handlerMap = new WeakMap<HTMLElement, WheelScrollHandler>();
const smoothStateMap = new WeakMap<HTMLElement, SmoothScrollState>();

/** 取消元素上未完成的平滑滚动动画帧。 */
const cancelSmoothScroll = (el: HTMLElement) => {
  const state = smoothStateMap.get(el);
  if (state?.rafId !== null && state?.rafId !== undefined) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
};

/**
 * 基于 requestAnimationFrame 的动量平滑缓动滚动
 * 每次滚轮事件累加目标位移，在每一帧通过 lerp 插值逼近目标位置，
 * 解决浏览器原生 smooth 在高频滚轮连续触发时被频繁打断和卡顿的问题。
 */
const performSmoothScroll = (el: HTMLElement, scrollAmount: number, maxScrollLeft: number, onProgress?: () => void) => {
  let state = smoothStateMap.get(el);
  if (!state) {
    state = { target: el.scrollLeft, rafId: null };
    smoothStateMap.set(el, state);
  } else if (state.rafId === null) {
    // 若上一轮缓动已彻底停止，scrollLeft 可能已被外部点击或拖动改变，需以当前 DOM 实际位置重置基准
    state.target = el.scrollLeft;
  }

  // 累加位移并限制在合法滚动区间
  state.target = Math.max(0, Math.min(maxScrollLeft, state.target + scrollAmount));

  if (state.rafId !== null) return;

  /** 单帧缓动循环：向目标位置 lerp 逼近，差值 ≤1px 或位移停滞时立即收尾停止。 */
  const animate = () => {
    if (!state) return;
    const current = el.scrollLeft;
    const diff = state.target - current;

    // 当差值小于等于 1px 时直接就位并结束 rAF，防止 DOM 整数像素截断导致差值停在 2~4px 陷入无限死循环
    if (Math.abs(diff) <= 1) {
      el.scrollLeft = state.target;
      state.rafId = null;
      onProgress?.();
      return;
    }

    // 保证单帧步长在整数像素级别至少有 1px 变化，避免子像素被浏览器截断舍弃
    const rawStep = diff * 0.2;
    const step = Math.abs(rawStep) < 1 ? Math.sign(rawStep) : rawStep;
    el.scrollLeft = current + step;

    // 若受边界约束未能产生任何位移，立即停止防止死循环
    if (el.scrollLeft === current) {
      state.rafId = null;
      onProgress?.();
      return;
    }

    onProgress?.();
    state.rafId = requestAnimationFrame(animate);
  };

  state.rafId = requestAnimationFrame(animate);
};

export const vWheelScroll: Directive<HTMLElement, WheelScrollBinding, WheelScrollModifiers> = {
  mounted(el, binding) {
    const opts = normalize(binding.value, binding.modifiers);

    const handler: WheelScrollHandler = {
      opts,
      onPointerDown: () => cancelSmoothScroll(el),
      onWheel: (e: WheelEvent) => {
        if (handler.opts.disabled) return;

        const maxScrollLeft = el.scrollWidth - el.clientWidth;
        if (maxScrollLeft <= 1) return;

        // 智能手势分量识别：触控板原生横滑优先使用 deltaX，普通鼠标纵向滚轮使用 deltaY 映射
        const rawDelta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY !== 0 ? e.deltaY : e.deltaX;

        if (rawDelta === 0) return;

        const multiplier = (handler.opts.reverse ? -1 : 1) * (handler.opts.speed ?? 1);
        const scrollAmount = rawDelta * multiplier;

        const canScrollMore =
          (scrollAmount > 0 && el.scrollLeft < maxScrollLeft - 1) || (scrollAmount < 0 && el.scrollLeft > 1);

        const shouldPrevent = handler.opts.prevent && (handler.opts.overscroll === 'contain' || canScrollMore);

        if (shouldPrevent) {
          e.preventDefault();
        }

        if (handler.opts.stop) {
          e.stopPropagation();
        }

        const notifyScroll = () => {
          const currentProgress = maxScrollLeft > 0 ? Math.min(1, Math.max(0, el.scrollLeft / maxScrollLeft)) : 0;

          if (handler.opts.onScroll) {
            handler.opts.onScroll(e, currentProgress);
          }

          el.dispatchEvent(
            new CustomEvent('wheel-scroll', {
              detail: { scrollLeft: el.scrollLeft, progress: currentProgress },
              bubbles: false,
            })
          );

          if (el.scrollLeft <= 0) {
            el.dispatchEvent(new CustomEvent('wheel-scroll-edge', { detail: { edge: 'left' }, bubbles: false }));
          } else if (el.scrollLeft >= maxScrollLeft - 1) {
            el.dispatchEvent(new CustomEvent('wheel-scroll-edge', { detail: { edge: 'right' }, bubbles: false }));
          }
        };

        if (handler.opts.smooth) {
          performSmoothScroll(el, scrollAmount, maxScrollLeft, notifyScroll);
        } else {
          cancelSmoothScroll(el);
          el.scrollLeft += scrollAmount;
          notifyScroll();
        }
      },
    };

    handlerMap.set(el, handler);
    el.addEventListener('wheel', handler.onWheel, { passive: false });
    el.addEventListener('pointerdown', handler.onPointerDown, { passive: true });
  },
  updated(el, binding) {
    const handler = handlerMap.get(el);
    if (!handler) return;
    handler.opts = normalize(binding.value, binding.modifiers);
  },
  unmounted(el) {
    cancelSmoothScroll(el);
    smoothStateMap.delete(el);
    const handler = handlerMap.get(el);
    if (handler) {
      el.removeEventListener('wheel', handler.onWheel);
      el.removeEventListener('pointerdown', handler.onPointerDown);
      handlerMap.delete(el);
    }
  },
};
