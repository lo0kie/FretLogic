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
  mutationObserver?: MutationObserver;
  targetEl?: HTMLElement | null;
  /** 已被 RO 观察的 target 直接子元素集合：childList 变化时增量增删，避免重复 observe */
  observedChildren: Set<Element>;
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

/**
 * 增量维护 target 直接子元素的 RO 观察：深层列表（如 TransitionGroup 卡片网格）的
 * 行数增删不必然传导为包装层自身的高度变化，逐子元素观察让深层内容尺寸变化直接触发重测。
 */
const updateObservedChildren = (state: AutoHeightState): void => {
  const target = state.targetEl;
  if (!target) return;
  const current = new Set(Array.from(target.children));
  for (const observed of state.observedChildren) {
    if (!current.has(observed)) {
      state.observer?.unobserve(observed);
      state.observedChildren.delete(observed);
    }
  }
  for (const child of current) {
    if (!state.observedChildren.has(child)) {
      state.observer?.observe(child);
      state.observedChildren.add(child);
    }
  }
};

/** 绑定 ResizeObserver 到测量目标 */
const observeTarget = (container: HTMLElement, state: AutoHeightState) => {
  state.observer?.disconnect();
  state.mutationObserver?.disconnect();
  state.observedChildren.clear();
  if (state.opts.disabled) return;

  state.targetEl = resolveTargetEl(container, state.opts.target);

  if (!state.targetEl || typeof ResizeObserver === 'undefined') return;

  state.observer = new ResizeObserver(() => syncHeight(container, state));
  state.observer.observe(state.targetEl);
  // 深层内容（列表项增删/TransitionGroup FLIP 重排）的高度变化依赖「包装层高度被动传导」
  // 才能触达只观察包装层的 RO——传导一旦失败容器就停留在旧高度（内容下方留白）。
  // 逐直接子元素观察 + 子树 childList/文本 MutationObserver 兜底，对齐 vScrollbar / vEdgeFade
  // 的完备观察模式：任何深层内容变化都有直达的重测路径
  for (const child of Array.from(state.targetEl.children)) {
    state.observer.observe(child);
    state.observedChildren.add(child);
  }
  if (typeof MutationObserver !== 'undefined') {
    state.mutationObserver = new MutationObserver(() => {
      updateObservedChildren(state);
      syncHeight(container, state);
    });
    state.mutationObserver.observe(state.targetEl, { childList: true, subtree: true, characterData: true });
  }
  syncHeight(container, state, true);
};

export const vAutoHeight: Directive<HTMLElement, AutoHeightBinding> = {
  mounted(el: HTMLElement, binding: DirectiveBinding<AutoHeightBinding>) {
    const opts = normalizeOptions(binding.value, binding.modifiers);
    const state: AutoHeightState = {
      opts,
      observedChildren: new Set(),
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
      state.mutationObserver?.disconnect();
      state.observedChildren.clear();
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
      state.mutationObserver?.disconnect();
      stateMap.delete(el);
    }
  },
};
