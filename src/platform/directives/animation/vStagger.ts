/**
 * v-stagger 指令：子元素**依次浮入**（透明度 + 轻微位移），用 anime.js 的 `stagger()` 与弹簧编排。
 *
 * 【为什么用 JS 动画库】CSS 也能做「每个子项延迟一点点」，但延迟得逐个算好写进内联样式，而且一遇
 * 「动画还没走完列表又变了」就无解 —— CSS 只能等上一轮过渡结束。`stagger()` 把序号与延迟的关系交给
 * 库，弹簧（`spring`）还带初速与过冲，而 CSS 的 cubic-bezier 只是近似。
 *
 * 【触发不需要令牌】挂载时对现有子元素播一次；之后用 MutationObserver 盯 `childList`，新增的子元素
 * 作为新一批接着错峰。列表重排、换数据、过滤都不必再通知指令一次。
 *
 * 【收口】动画写的是内联 `opacity` / `transform`，收口与卸载时逐个清掉 —— 留着内联 `opacity: 1` 会
 * 盖掉悬停 / 禁用态的样式，留着内联 `transform` 会与 Tailwind 的 `translate-*` / `scale-*` 打架。
 * 上一批若被新一批打断，也先把它的内联值清干净（否则会停在半路的透明或位移上）。
 *
 * 【减弱动效】不播过程：元素本来就在终态，没有任何东西需要补。
 *
 * 用法：
 *   <div v-stagger="{ selector: '.variant-card', gap: 40 }">…</div>
 *   <div v-stagger />                                     // 所有元素子节点，默认档
 */
import { animate, spring, stagger } from 'animejs';

import { isBoolean, isNumber, isObject, isString } from '@/platform/utils/common';
import { EASE_STANDARD } from '@/platform/utils/constants';
import { compileEasing, prefersReducedMotion } from '@/platform/utils/motion';

import type { JSAnimation } from 'animejs';
import type { Directive, DirectiveBinding } from 'vue';

export interface StaggerOptions {
  /** 限定参与的子元素（相对宿主的选择器），省略即所有元素子节点 */
  selector?: string;
  /** 单个子项的时长（ms），默认 320 */
  duration?: number;
  /** 相邻子项之间的错峰（ms），默认 40 */
  gap?: number;
  /** 起始位移（px），默认 6；0 表示只淡入 */
  distance?: number;
  /** 是否用弹簧收尾，默认 true */
  spring?: boolean;
}

export type StaggerBinding = boolean | StaggerOptions | null | undefined;

const STAGGER_DURATION_MS = 320;
const STAGGER_GAP_MS = 40;
const STAGGER_DISTANCE_PX = 6;

/** 默认曲线（与其余动画指令同源：曲线定义只有 constants.ts 一处） */
const STAGGER_EASE = compileEasing(EASE_STANDARD) ?? 'linear';

/** 弹簧参数：刚度给足、阻尼略大 —— 只过冲一点点就收，不做弹簧床 */
const STAGGER_SPRING = { stiffness: 240, damping: 22 };

/** 归一化后的配置 */
interface StaggerSettings {
  selector: string;
  duration: number;
  gap: number;
  distance: number;
  spring: boolean;
}

interface StaggerState {
  settings: StaggerSettings;
  observer: MutationObserver | null;
  anim: JSAnimation | null;
  /** 上一批被动画写过的元素：打断或卸载时按它清理内联值 */
  animated: Element[];
}

const stateMap = new WeakMap<HTMLElement, StaggerState>();

const resolveSettings = (value: StaggerBinding): StaggerSettings => {
  const opts = isObject(value) ? value : null;
  const positive = (raw: unknown, fallback: number): number =>
    isNumber(raw) && Number.isFinite(raw) && raw >= 0 ? raw : fallback;
  return {
    selector: opts && isString(opts.selector) ? opts.selector : '',
    duration: positive(opts?.duration, STAGGER_DURATION_MS) || STAGGER_DURATION_MS,
    gap: positive(opts?.gap, STAGGER_GAP_MS),
    distance: positive(opts?.distance, STAGGER_DISTANCE_PX),
    // 只有显式 `spring: false` 才关（布尔 / 省略都算开）
    spring: !(opts && isBoolean(opts.spring) && !opts.spring),
  };
};

const clearInline = (el: Element): void => {
  const styled = el as HTMLElement;
  styled.style.removeProperty('opacity');
  styled.style.removeProperty('transform');
};

/** 首批要播的元素：给了 selector 就往下查（宿主的直接子节点未必就是目标），否则取直接子节点 */
const initialItems = (el: HTMLElement, settings: StaggerSettings): Element[] =>
  settings.selector ? Array.from(el.querySelectorAll(settings.selector)) : Array.from(el.children);

/** 把一批子元素依次浮入 */
const playStagger = (_el: HTMLElement, state: StaggerState, nodes: Element[]): void => {
  if (nodes.length === 0) return;

  // 上一批还在途中：先停表，再把它写过的内联值清干净（否则会停在半路）
  state.anim?.cancel();
  state.anim = null;
  state.animated.forEach(clearInline);

  const items = state.settings.selector ? nodes.filter(node => node.matches(state.settings.selector)) : nodes;
  if (items.length === 0) return;

  // 减弱动效：不播过程 —— 元素本来就在终态
  if (prefersReducedMotion()) return;

  const { duration, gap, distance, spring: useSpring } = state.settings;
  state.animated = items;
  state.anim = animate(items, {
    opacity: [0, 1],
    translateY: [distance, 0],
    duration,
    delay: stagger(gap),
    ease: useSpring ? spring(STAGGER_SPRING) : STAGGER_EASE,
    onComplete: () => {
      items.forEach(clearInline);
      state.anim = null;
      state.animated = [];
    },
  });
};

/** 从 mutation 记录里挑出新增的元素节点 */
const collectAdded = (records: MutationRecord[]): Element[] => {
  const added: Element[] = [];
  for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) added.push(node);

  return added;
};

export const vStagger: Directive<HTMLElement, StaggerBinding> = {
  mounted(el: HTMLElement, binding: DirectiveBinding<StaggerBinding>) {
    const state: StaggerState = {
      settings: resolveSettings(binding.value),
      observer: null,
      anim: null,
      animated: [],
    };
    stateMap.set(el, state);

    playStagger(el, state, initialItems(el, state.settings));

    // 后续新增的子元素接着错峰：重排 / 换数据 / 过滤都不必再通知指令
    state.observer = new MutationObserver(records => playStagger(el, state, collectAdded(records)));
    state.observer.observe(el, { childList: true });
  },

  /**
   * 绑定值变更时刷新 settings。
   *
   * 必须实装：MutationObserver 的回调**持续读** `state.settings`，而它此前只在 mounted 赋值一次 ——
   * 于是 `selector / gap / duration / distance / spring` 挂载后再改一律被静默忽略，下一批新增
   * 子元素仍按挂载时那套参数错峰（改小 gap 没反应、换 selector 选不中新元素）。
   * 已在途的那一批不动：它们的目标值已由 anime 捕获，中途换参数只会让这一批前后不一致。
   */
  updated(el: HTMLElement, binding: DirectiveBinding<StaggerBinding>) {
    const state = stateMap.get(el);
    if (state) state.settings = resolveSettings(binding.value);
  },

  unmounted(el: HTMLElement) {
    const state = stateMap.get(el);
    if (state) {
      state.observer?.disconnect();
      state.anim?.cancel();
      state.animated.forEach(clearInline);
    }
    stateMap.delete(el);
  },
};
