/**
 * v-auto-height 指令：测量子元素真实高度并实时写入当前容器的 style.height（px），高度变化的过渡由指令注入。
 *
 * 【原理】
 * CSS 无法对 auto ↔ auto 的内容高度变化做插值过渡，纯 CSS grid-template-rows 0fr ↔ 1fr 技巧也无法处理已展开面板内部的高度变化。
 * 本指令通过 ResizeObserver 持续同步内部内容（默认 el.firstElementChild || el）的实际尺寸到容器 height，
 * 消除高度变化抖动与动画缺失问题。
 *
 * 【过渡注入】挂载时向宿主内联写入 height 过渡（时长/缓动走主题 token），宿主无需再手拼
 * transition-[height] duration-* ease-* 工具类。绑定项 transition 定制：
 * - 省略/true → `height var(--duration-base) var(--ease-standard)`；
 * - 字符串 → 完整 transition 简写值（如换缓动 `'height var(--duration-base) var(--ease-sidebar)'`）；
 * - false → 不注入（宿主元素上有自己的多属性过渡时必传，内联 transition-property 会覆盖类过渡）。
 */
import { useRafThrottle } from '@/platform/composables/useRafThrottle';
import { hasTransitionItem, mergeTransitionItem, removeTransitionItems } from '@/platform/utils/motion';

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
  /** 高度挂起：展开态下不测量、不写 px，直接把容器 height 固定为 auto。
   *  用于「内容正被分批补齐、高度尚未定型」的窗口——逐帧长高若走 px 过渡会被看见成
   *  一段渐次展开的动画（如侧栏分组的分块补挂）；挂起期间让高度跟随内容自然流动，
   *  内容补齐后再交回测量。收起态不受影响（仍写 0px） */
  hold?: boolean;
  /** 过渡注入：省略/true 注入默认 height 过渡 | 字符串为完整 transition 简写 | false 不注入 */
  transition?: boolean | string;
}

export type AutoHeightBinding = boolean | AutoHeightOptions | undefined;

/** 默认注入的 height 过渡：时长/缓动走主题 token，缺省值兜底无 token 环境 */
const DEFAULT_HEIGHT_TRANSITION = 'height var(--duration-base, 0.18s) var(--ease-standard, ease)';

/**
 * 写高度前确保 height 过渡在场（缺失则条目级补回）。
 *
 * 宿主元素常与其它指令共享（如 BaseScrollArea 根元素同时挂 v-edge-fade），后者会在
 * 溢出状态变化时改写 transition——若发生在本指令写高度的同一帧内、样式重算之前，
 * 被覆盖的 height 过渡会让本次高度变化瞬变。applyTransition 已改为条目级合并，
 * 这里是兜底：任何路径把 height 条目挤掉后，下一次写高度前自动补回。
 */
const ensureHeightTransition = (el: HTMLElement, state: AutoHeightState): void => {
  if (state.opts.transition === false || !state.injectedTransition) return;
  if (hasTransitionItem(el.style.transition, 'height')) return;
  const desired =
    typeof state.opts.transition === 'string' && state.opts.transition
      ? state.opts.transition
      : DEFAULT_HEIGHT_TRANSITION;
  el.style.transition = mergeTransitionItem(el.style.transition, desired);
};

interface AutoHeightState {
  opts: AutoHeightOptions;
  observer?: ResizeObserver;
  mutationObserver?: MutationObserver;
  targetEl?: HTMLElement | null;
  /** 已被 RO 观察的 target 直接子元素集合：childList 变化时增量增删，避免重复 observe */
  observedChildren: Set<Element>;
  lastMeasuredPx: number;
  /** 已注入内联 height 过渡（卸载/禁用时回收，避免覆盖宿主类过渡） */
  injectedTransition: boolean;
  /** 观察者路径的重测合帧器：一帧内只测一次（见 observeTarget） */
  scheduleSync?: () => void;
  cancelSync?: () => void;
}

const stateMap = new WeakMap<HTMLElement, AutoHeightState>();

/** 按配置向宿主写入/回收 height 过渡（条目级合并：同元素上其它指令的过渡条目原位保留，
 *  整条覆盖会把它们吞掉——典型如 BaseScrollArea 根元素上共存的 v-edge-fade） */
const applyTransition = (el: HTMLElement, state: AutoHeightState): void => {
  const { transition } = state.opts;
  if (transition === false) {
    if (state.injectedTransition) {
      el.style.transition = removeTransitionItems(el.style.transition, 'height');
      state.injectedTransition = false;
    }
    return;
  }
  const desired = typeof transition === 'string' && transition ? transition : DEFAULT_HEIGHT_TRANSITION;
  el.style.transition = mergeTransitionItem(el.style.transition, desired);
  state.injectedTransition = true;
};

/** 归一化指令配置 */
const normalizeOptions = (value: AutoHeightBinding, modifiers?: Record<string, boolean>): AutoHeightOptions => {
  let opts: AutoHeightOptions;
  if (typeof value === 'boolean') opts = { expanded: value, initialAuto: true, threshold: 2, disabled: false };
  else if (value && typeof value === 'object')
    opts = {
      expanded: value.expanded !== false,
      initialAuto: value.initialAuto !== false,
      target: value.target,
      threshold: value.threshold ?? 2,
      disabled: Boolean(value.disabled),
      hold: Boolean(value.hold),
      transition: value.transition,
    };
  else opts = { expanded: true, initialAuto: true, threshold: 2, disabled: false };

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

  // 高度挂起：内容尚未定型（分批补齐中）时不写 px，让高度跟随内容自然流动。
  // 写 px 会把「每一批补齐」都变成一次带过渡的高度动画，用户看到的是一段渐次展开；
  // 写 auto 则无过渡、内容出现即到位，补齐结束后再由测量路径接管（写回 px 以恢复后续过渡能力）
  if (state.opts.hold) {
    container.style.height = 'auto';
    state.lastMeasuredPx = 0;
    return;
  }

  const measuredRaw = Math.ceil(Math.max(target.offsetHeight, target.scrollHeight));
  // 容器带 max-height 时可见高度被钳制：内联 height 若写全量值，过渡行程大部分发生在
  // 裁切之外（变大时前段瞬时贴满 maxH，视觉上无动画；变矮时同样只剩尾部可见）。
  // 写入前按当前 max-height 钳制，保证过渡全程落在可见区间内
  const maxH = parseFloat(getComputedStyle(container).maxHeight);
  const measured = Number.isFinite(maxH) && maxH > 0 ? Math.min(measuredRaw, Math.ceil(maxH)) : measuredRaw;
  const prevInline = container.style.height;
  const shouldWrite =
    measured > 0 &&
    (force || prevInline === 'auto' || prevInline === '0px' || Math.abs(measured - state.lastMeasuredPx) >= threshold);
  if (shouldWrite) {
    ensureHeightTransition(container, state);
    state.lastMeasuredPx = measured;
    container.style.height = `${measured}px`;
  }
};

/**
 * 增量维护 target 直接子元素的 RO 观察：深层列表（如 TransitionGroup 卡片网格）的
 * 行数增删不必然传导为包装层自身的高度变化，逐子元素观察让深层内容尺寸变化直接触发重测。
 *
 * 只处理本次 mutation 记录里的增删节点，不做「全量快照 + diff」：addedNodes / removedNodes
 * 对「成为 / 离开 target 直接子元素」这个事实是完备的（初始挂载由 observeTarget 的全量循环覆盖），
 * 而全量快照是 O(子元素数) 的 Set 构造 + 逐项比对——长列表（和弦库展开后上百张卡）分批挂载时
 * 每一批都要付一次。不传 mutations 即全量补齐（挂载 / 测量目标被替换时用）。
 */
const updateObservedChildren = (state: AutoHeightState, mutations?: MutationRecord[]): void => {
  const target = state.targetEl;
  if (!target) return;
  if (!mutations) {
    for (const child of Array.from(target.children))
      if (!state.observedChildren.has(child)) {
        state.observer?.observe(child);
        state.observedChildren.add(child);
      }

    return;
  }
  for (const mutation of mutations) {
    for (const node of mutation.removedNodes)
      if (node instanceof Element && state.observedChildren.has(node)) {
        state.observer?.unobserve(node);
        state.observedChildren.delete(node);
      }

    for (const node of mutation.addedNodes)
      if (node.parentNode === target && node instanceof Element && !state.observedChildren.has(node)) {
        state.observer?.observe(node);
        state.observedChildren.add(node);
      }
  }
};

/** 绑定 ResizeObserver 到测量目标 */
const observeTarget = (container: HTMLElement, state: AutoHeightState) => {
  state.observer?.disconnect();
  state.mutationObserver?.disconnect();
  state.cancelSync?.();
  state.observedChildren.clear();
  if (state.opts.disabled) return;

  state.targetEl = resolveTargetEl(container, state.opts.target);

  if (!state.targetEl || typeof ResizeObserver === 'undefined') {
    // 无观察者环境 / 测量目标缺失时也必须落一次初始高度（syncHeight 会按缺目标退化为 auto/0px），
    // 否则 mounted 里预置的 height:0px 无人改写，容器永久钉死、内容被裁没
    syncHeight(container, state, true);
    return;
  }

  // 观察者路径一律走帧末合帧：syncHeight 要读 offsetHeight / scrollHeight / getComputedStyle，
  // 每次都是强制布局。展开一个上百张卡的分组时，分批挂载会在一帧内投递多批 mutation、
  // 新观察的子元素也各自触发一次 RO 初始回调——逐次同步测量就是逐次强制布局，大列表下
  // 直接表现为开合分组的轻微延迟。合成每帧一次后读数还落在布局已干净时
  state.cancelSync?.();
  const { schedule, cancel } = useRafThrottle(() => syncHeight(container, state));
  state.scheduleSync = schedule;
  state.cancelSync = cancel;

  state.observer = new ResizeObserver(() => state.scheduleSync?.());
  state.observer.observe(state.targetEl);
  // 深层内容（列表项增删/TransitionGroup FLIP 重排）的高度变化依赖「包装层高度被动传导」
  // 才能触达只观察包装层的 RO——传导一旦失败容器就停留在旧高度（内容下方留白）。
  // 逐直接子元素观察 + 子树 childList/文本 MutationObserver 兜底，对齐 vScrollbar / vEdgeFade
  // 的完备观察模式：任何深层内容变化都有直达的重测路径
  updateObservedChildren(state);
  if (typeof MutationObserver !== 'undefined') {
    state.mutationObserver = new MutationObserver(mutations => {
      updateObservedChildren(state, mutations);
      state.scheduleSync?.();
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
      injectedTransition: false,
    };
    stateMap.set(el, state);

    if (opts.disabled) return;

    applyTransition(el, state);

    if (!opts.expanded) el.style.height = '0px';
    else if (!opts.initialAuto) el.style.height = '0px';

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
      if (state.injectedTransition) {
        el.style.transition = removeTransitionItems(el.style.transition, 'height');
        state.injectedTransition = false;
      }
      state.observer?.disconnect();
      state.mutationObserver?.disconnect();
      state.cancelSync?.();
      state.observedChildren.clear();
      return;
    }

    if (prevDisabled && !currentDisabled) {
      applyTransition(el, state);
      observeTarget(el, state);
      return;
    }

    // transition 选项变更（含首次非 disabled 更新）：幂等重放注入
    applyTransition(el, state);

    // 检查目标节点是否发生替换
    const currentTarget = resolveTargetEl(el, state.opts.target);
    if (currentTarget !== state.targetEl) {
      observeTarget(el, state);
      return;
    }

    if (!currentExpanded) {
      el.style.height = '0px';
      state.lastMeasuredPx = 0;
    } else if (!prevExpanded && currentExpanded) syncHeight(el, state, true);
    else syncHeight(el, state);
  },

  unmounted(el: HTMLElement) {
    const state = stateMap.get(el);
    if (state) {
      state.observer?.disconnect();
      state.mutationObserver?.disconnect();
      state.cancelSync?.();
      stateMap.delete(el);
    }
  },
};
