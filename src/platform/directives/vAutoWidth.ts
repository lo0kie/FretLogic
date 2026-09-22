/**
 * v-auto-width 指令：基于 ResizeObserver 与 Web Animations API（WAAPI）的内容自适应宽度平滑过渡。
 *
 * 【原理】
 * CSS transition 依赖 specified value 变化（width 为 auto 时纯内容变化无法触发 CSS 过渡）。
 * 本指令在元素宽度因内容增减产生跳变时，利用 FLIP 思想由 WAAPI 从旧宽补间到新宽。
 * 针对动画过程中尺寸不断变化并反复触发 RO 的情况，做了防抖与接力（relay）保护。
 */
import { EASE_STANDARD } from '@/platform/utils/constants';
import { observeResize } from '@/platform/utils/dom';

import type { Directive, DirectiveBinding } from 'vue';

export interface AutoWidthOptions {
  /** 补间动画持续时间（ms），默认 160 */
  duration?: number;
  /** 缓动曲线，默认取全局标准曲线（platform/utils/constants 的 EASE_STANDARD，即 tokens 的 --bezier-standard） */
  easing?: string;
  /** 触发过渡的最小宽度差阈值（px），默认 0.5 */
  threshold?: number;
  /** 是否禁用宽度过渡 */
  disabled?: boolean;
}

export type AutoWidthModifiers = 'fast' | 'slow' | 'disabled' | (string & Record<never, never>);
export type AutoWidthBinding = boolean | number | AutoWidthOptions | undefined;

interface AutoWidthState {
  opts: AutoWidthOptions;
  lastWidth?: number;
  runningAnim?: Animation;
  pendingWidth?: number;
  /** 停止尺寸观察的清理函数（observeResize 返回）；null 表示未观察 */
  stop?: (() => void) | null;
}

const stateMap = new WeakMap<HTMLElement, AutoWidthState>();

/** 归一化指令配置 */
const normalizeOptions = (value: AutoWidthBinding, modifiers?: Record<string, boolean>): AutoWidthOptions => {
  const opts: AutoWidthOptions = {
    duration: 160,
    easing: EASE_STANDARD,
    threshold: 0.5,
    disabled: false,
  };

  if (typeof value === 'boolean') opts.disabled = !value;
  else if (typeof value === 'number') opts.duration = value;
  else if (value && typeof value === 'object') Object.assign(opts, value);

  if (modifiers) {
    if (modifiers['fast']) opts.duration = 100;
    if (modifiers['slow']) opts.duration = 260;
    // 静态修饰符 .disabled（编译期固定，动态禁用请用绑定值 { disabled }）
    if (modifiers['disabled']) opts.disabled = true;
  }

  return opts;
};

/** 旧宽到新宽的 WAAPI 补间；动画期间内容再变则在结束后接力到最新目标 */
const startWidthAnim = (el: HTMLElement, state: AutoWidthState, from: number, to: number) => {
  const { duration = 160, easing = EASE_STANDARD } = state.opts;
  const anim = el.animate([{ width: `${from}px` }, { width: `${to}px` }], {
    duration,
    easing,
  });

  state.runningAnim = anim;
  anim.onfinish = () => {
    if (state.runningAnim !== anim) return;
    state.runningAnim = undefined;
    state.lastWidth = to;

    // 动画期间内容又变了：从当前值接力到最新目标
    const pending = state.pendingWidth;
    state.pendingWidth = undefined;
    if (pending !== undefined && Math.abs(pending - to) >= (state.opts.threshold ?? 0.5))
      startWidthAnim(el, state, to, pending);
  };
};

/** 单个元素尺寸变化处理：脱离文档/隐藏时清除基准，动画进行中只记录目标，否则触发宽度补间 */
const onResize = (el: HTMLElement) => {
  const state = stateMap.get(el);
  if (!state || state.opts.disabled) return;

  const newWidth = el.offsetWidth;

  // 元素脱离文档（KeepAlive 摘除）或被隐藏时宽度上报为 0：
  // 这不是内容宽度变化，清除基准与动画状态，避免恢复可见时回放「0 → 真实宽度」的生长动画
  if (!el.isConnected || newWidth === 0) {
    state.runningAnim?.cancel();
    state.runningAnim = undefined;
    state.pendingWidth = undefined;
    state.lastWidth = undefined;
    return;
  }

  // 动画进行中：此刻的布局宽度由动画驱动，仅记录最新目标，结算留给 onfinish
  if (state.runningAnim) {
    state.pendingWidth = newWidth;
    return;
  }

  const last = state.lastWidth;
  state.lastWidth = newWidth;

  if (last === undefined || Math.abs(newWidth - last) < (state.opts.threshold ?? 0.5)) return;

  startWidthAnim(el, state, last, newWidth);
};

export const vAutoWidth: Directive<HTMLElement, AutoWidthBinding, AutoWidthModifiers> = {
  mounted(el: HTMLElement, binding: DirectiveBinding<AutoWidthBinding>) {
    const opts = normalizeOptions(binding.value, binding.modifiers);
    const state: AutoWidthState = {
      opts,
      lastWidth: el.offsetWidth, // 首次挂载不动画，仅记录基准
    };
    stateMap.set(el, state);

    if (!opts.disabled) state.stop = observeResize(el, () => onResize(el));
  },

  updated(el: HTMLElement, binding: DirectiveBinding<AutoWidthBinding>) {
    const state = stateMap.get(el);
    if (!state) return;

    const prevDisabled = state.opts.disabled;
    state.opts = normalizeOptions(binding.value, binding.modifiers);

    if (!prevDisabled && state.opts.disabled) {
      state.stop?.();
      state.stop = null;
      state.runningAnim?.cancel();
      state.runningAnim = undefined;
    } else if (prevDisabled && !state.opts.disabled) {
      state.lastWidth = el.offsetWidth;
      state.stop = observeResize(el, () => onResize(el));
    }
  },

  unmounted(el: HTMLElement) {
    const state = stateMap.get(el);
    if (state) {
      state.stop?.();
      state.stop = null;
      state.runningAnim?.cancel();
      stateMap.delete(el);
    }
  },
};
