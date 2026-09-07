/**
 * v-auto-height 指令：测量子元素真实高度并实时写入当前容器的 style.height（px），配合 transition-[height] 使用。
 *
 * 【原理】
 * CSS 无法对 auto ↔ auto 的内容高度变化做插值过渡，纯 CSS grid-template-rows 0fr ↔ 1fr 技巧也无法处理已展开面板内部的高度变化。
 * 本指令通过 ResizeObserver 持续同步内部内容（默认 el.firstElementChild || el）的实际尺寸到容器 height，
 * 消除高度变化抖动与动画缺失问题。
 */
import type { Directive, DirectiveBinding } from 'vue';

export interface AutoHeightOptions {
  /** 是否处于展开状态，默认 true */
  expanded?: boolean;
  /** 是否在展开时初始值为 auto 避免首帧跳变，默认 true */
  initialAuto?: boolean;
  /** 测量目标元素选择器或元素引用，默认取首个子元素或自身 */
  target?: string | HTMLElement;
  /** 触发高度更新的像素差阈值，默认 2 */
  threshold?: number;
  /** 是否禁用自适应高度（禁用时不接管/不修改容器 style.height） */
  disabled?: boolean;
}

export type AutoHeightBinding = boolean | AutoHeightOptions | undefined;

interface AutoHeightState {
  opts: AutoHeightOptions;
  observer?: ResizeObserver;
  targetEl?: HTMLElement | null;
  lastMeasuredPx: number;
}

const stateMap = new WeakMap<HTMLElement, AutoHeightState>();

/** 归一化指令配置 */
const normalizeOptions = (value: AutoHeightBinding, modifiers?: Record<string, boolean>): AutoHeightOptions => {
  let opts: AutoHeightOptions;
  if (typeof value === 'boolean') {
    opts = { expanded: value, initialAuto: true, threshold: 2, disabled: false };
  } else if (value && typeof value === 'object') {
    opts = {
      expanded: value.expanded !== false,
      initialAuto: value.initialAuto !== false,
      target: value.target,
      threshold: value.threshold ?? 2,
      disabled: Boolean(value.disabled),
    };
  } else {
    opts = { expanded: true, initialAuto: true, threshold: 2, disabled: false };
  }
  // 静态修饰符 .disabled（编译期固定，动态禁用请用绑定值 { disabled }）
  if (modifiers?.['disabled']) opts.disabled = true;
  return opts;
};

/** 解析测量目标元素 */
const resolveTargetEl = (container: HTMLElement, targetOption?: string | HTMLElement): HTMLElement | null => {
  if (targetOption instanceof HTMLElement) return targetOption;
  if (typeof targetOption === 'string') return container.querySelector<HTMLElement>(targetOption);
  return (container.firstElementChild as HTMLElement) || container;
};

/** 测量目标元素高度并同步写入外层容器 style.height */
const syncHeight = (container: HTMLElement, state: AutoHeightState, force = false) => {
  if (state.opts.disabled) return;
  const { expanded = true, threshold = 2 } = state.opts;
  const target = state.targetEl;

  if (!target || !expanded) {
    container.style.height = expanded ? 'auto' : '0px';
    state.lastMeasuredPx = 0;
    return;
  }

  const measured = Math.ceil(Math.max(target.offsetHeight, target.scrollHeight));
  if (
    measured > 0 &&
    (force ||
      container.style.height === 'auto' ||
      container.style.height === '0px' ||
      Math.abs(measured - state.lastMeasuredPx) >= threshold)
  ) {
    state.lastMeasuredPx = measured;
    container.style.height = `${measured}px`;
  }
};

/** 绑定 ResizeObserver 到测量目标 */
const observeTarget = (container: HTMLElement, state: AutoHeightState) => {
  state.observer?.disconnect();
  if (state.opts.disabled) return;

  state.targetEl = resolveTargetEl(container, state.opts.target);

  if (!state.targetEl || typeof ResizeObserver === 'undefined') return;

  state.observer = new ResizeObserver(() => syncHeight(container, state));
  state.observer.observe(state.targetEl);
  syncHeight(container, state, true);
};

export const vAutoHeight: Directive<HTMLElement, AutoHeightBinding> = {
  mounted(el: HTMLElement, binding: DirectiveBinding<AutoHeightBinding>) {
    const opts = normalizeOptions(binding.value, binding.modifiers);
    const state: AutoHeightState = {
      opts,
      lastMeasuredPx: 0,
    };
    stateMap.set(el, state);

    if (opts.disabled) return;

    if (!opts.expanded) {
      el.style.height = '0px';
    } else if (!opts.initialAuto) {
      el.style.height = '0px';
    }

    observeTarget(el, state);
  },

  updated(el: HTMLElement, binding: DirectiveBinding<AutoHeightBinding>) {
    const state = stateMap.get(el);
    if (!state) return;

    const prevDisabled = state.opts.disabled;
    const prevExpanded = state.opts.expanded !== false;
    state.opts = normalizeOptions(binding.value, binding.modifiers);
    const currentDisabled = state.opts.disabled;
    const currentExpanded = state.opts.expanded !== false;

    if (currentDisabled) {
      state.observer?.disconnect();
      return;
    }

    if (prevDisabled && !currentDisabled) {
      observeTarget(el, state);
      return;
    }

    // 检查目标节点是否发生替换
    const currentTarget = resolveTargetEl(el, state.opts.target);
    if (currentTarget !== state.targetEl) {
      observeTarget(el, state);
      return;
    }

    if (!currentExpanded) {
      el.style.height = '0px';
      state.lastMeasuredPx = 0;
    } else if (!prevExpanded && currentExpanded) {
      syncHeight(el, state, true);
    } else {
      syncHeight(el, state);
    }
  },

  unmounted(el: HTMLElement) {
    const state = stateMap.get(el);
    if (state) {
      state.observer?.disconnect();
      stateMap.delete(el);
    }
  },
};
