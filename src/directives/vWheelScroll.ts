import type { Directive } from 'vue';

export type WheelScrollModifiers = 'smooth' | 'reverse' | 'prevent' | (string & Record<never, never>);

export interface WheelScrollOptions {
  speed?: number;
  smooth?: boolean;
  reverse?: boolean;
  disabled?: boolean;
}

export type WheelScrollBinding = number | boolean | WheelScrollOptions | undefined;

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
    if (modifiers.smooth !== undefined) opts.smooth = Boolean(modifiers.smooth);
    if (modifiers.reverse !== undefined) opts.reverse = Boolean(modifiers.reverse);
  }

  opts.speed = opts.speed ?? 1;
  return opts;
};

interface WheelScrollHandler {
  opts: WheelScrollOptions;
  onWheel: (e: WheelEvent) => void;
}

const handlerMap = new WeakMap<HTMLElement, WheelScrollHandler>();

export const vWheelScroll: Directive<HTMLElement, WheelScrollBinding, WheelScrollModifiers> = {
  mounted(el, binding) {
    const opts = normalize(binding.value, binding.modifiers);
    const handler: WheelScrollHandler = {
      opts,
      onWheel: (e: WheelEvent) => {
        if (handler.opts.disabled) return;

        // 若当前元素有水平可滚动内容（或者子级溢出）
        const canScrollX = el.scrollWidth > el.clientWidth;
        if (!canScrollX) return;

        const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
        if (delta === 0) return;

        e.preventDefault();
        const multiplier = (handler.opts.reverse ? -1 : 1) * (handler.opts.speed ?? 1);
        const scrollAmount = delta * multiplier;

        el.scrollBy({
          left: scrollAmount,
          behavior: handler.opts.smooth ? 'smooth' : 'auto',
        });
      },
    };

    handlerMap.set(el, handler);
    el.addEventListener('wheel', handler.onWheel, { passive: false });
  },
  updated(el, binding) {
    const handler = handlerMap.get(el);
    if (!handler) return;
    handler.opts = normalize(binding.value, binding.modifiers);
  },
  unmounted(el) {
    const handler = handlerMap.get(el);
    if (handler) {
      el.removeEventListener('wheel', handler.onWheel);
      handlerMap.delete(el);
    }
  },
};
