import { isFunction, isNumber, isObject } from '@/platform/utils/common';
import { isEditableTarget } from '@/platform/utils/dom';
import { resolveScrollBehavior } from '@/platform/utils/motion';

import type { Directive, DirectiveBinding } from 'vue';

export type ArrowNavOrientation = 'horizontal' | 'vertical' | 'both';

export interface ArrowNavOptions {
  /** 指定列数（为 1 时上下与左右等价；未指定时按视觉几何空间最近匹配） */
  cols?: number;
  /** 限定收集可聚焦元素的选择器 */
  selector?: string;
  /** 允许的方向限制：'horizontal' 仅水平 | 'vertical' 仅垂直 | 'both' 二维全方向 */
  orientation?: ArrowNavOrientation;
  /** 处理完按键后是否阻止事件继续冒泡 */
  stop?: boolean;
  /** 是否禁用键盘方向键导航 */
  disabled?: boolean;
  /** 是否在边界循环导航 */
  loop?: boolean;
  /** 聚焦时是否阻止原生页面跳跃滚动 */
  preventScroll?: boolean;
  /** 聚焦后是否自动将目标元素平滑滚入可见区域，默认 true */
  autoScroll?: boolean;
  /** 导航切换焦点时的回调钩子 */
  onNavigate?: (toEl: HTMLElement, fromEl: HTMLElement) => void;
  /**
   * 方向键在已收集元素中找不到可移动目标时的回调（返回后不再聚焦）。
   * 典型场景：虚拟化列表只渲染了窗口内的元素，边缘外的下一行尚未挂载 —— 宿主在此把
   * 目标行滚进窗口并补聚焦。真到达列表尽头时宿主自行早退即可。
   */
  onEdge?: (key: string, currentEl: HTMLElement) => void;
}

export type ArrowNavBinding = number | ArrowNavOptions | boolean | undefined;
export type ArrowNavModifiers =
  'stop' | 'loop' | 'horizontal' | 'vertical' | 'prevent-scroll' | 'disabled' | (string & Record<never, never>);

interface Entry {
  el: HTMLElement;
  eligible: boolean;
}

/**
 * 方向键导航的**候选节点**宽集合。与 dom.ts 的 FOCUSABLE_SELECTOR（「什么算 Tab 可聚焦」，
 * 供焦点圈定/自动聚焦用）不是同一事实，故不合并：此处必须额外容纳 `[data-focusable-outline]`
 * 这类不带 tabindex 的自定义格子节点，而 disabled/不可见/inert 的排除统一由 isEligible 负责，
 * 选择器里重复写 `:not([disabled])` 只会造成两处规则漂移。
 */
const DEFAULT_SELECTOR = '[data-focusable-outline], [tabindex="0"], button, input, select, textarea, a[href]';

const isTestEnv = typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test';

/** 判断元素是否视觉可见：原生 checkVisibility 优先（祖先感知），老浏览器回退到计算样式判定；测试环境恒可见。 */
const isVisible = (el: HTMLElement): boolean => {
  if (isTestEnv) return true;
  // checkVisibility 与下面那条回退的**关键差别是祖先感知**：本元素或任一祖先 display:none /
  // content-visibility:hidden（加 visibilityProperty 后还看 visibility、加 opacityProperty 看
  // 不透明度）即判不可见。回退路径做不到这一点 —— `offsetParent` 在「祖先 display:none」时同样是
  // null，而回退读到的 `getComputedStyle(el).display` 是**本元素自己的**计算值（浏览器不会把祖先的
  // none 报成后代的 none），于是隐藏子树里的格子被判成可见、混进方向键候选（按下去焦点无处可去）。
  if (isFunction(el.checkVisibility)) return el.checkVisibility({ visibilityProperty: true, opacityProperty: true });
  // 回退（Safari < 17.4）：offsetParent 为 null 有两种成因 —— 祖先 display:none（不可见）与自身
  // position:fixed/sticky（可见），故必须再读一次本元素的计算样式来区分这两者。
  if (el.offsetParent !== null) return true;
  try {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  } catch {
    return false;
  }
};

/** 判断元素是否可参与导航：无 disabled、非 tabindex=-1、无 aria-disabled、可见且不在 inert 子树中。 */
const isEligible = (el: HTMLElement): boolean => {
  if (el.hasAttribute('disabled') || (el as HTMLButtonElement).disabled) return false;
  if (el.getAttribute('tabindex') === '-1') return false;
  if (el.getAttribute('aria-disabled') === 'true') return false;
  if (!isVisible(el)) return false;
  if (el.closest('[inert]')) return false;
  return true;
};

/** 归一化指令配置：绑定值支持列数/选项对象/布尔禁用，修饰符叠加；缺省补齐选择器与默认方向。 */
const resolveOptions = (binding: DirectiveBinding<ArrowNavBinding>): ArrowNavOptions => {
  const val = binding.value;
  const mods = binding.modifiers;

  let opts: ArrowNavOptions = {};
  if (isNumber(val)) opts.cols = val;
  else if (isObject(val)) opts = { ...val };
  else if (val === false) opts.disabled = true;

  if (mods['stop']) opts.stop = true;
  if (mods['loop']) opts.loop = true;
  if (mods['horizontal']) opts.orientation = 'horizontal';
  if (mods['vertical']) opts.orientation = 'vertical';
  // 静态修饰符 .prevent-scroll：聚焦时阻止原生页面跳滚（连字符拼写，与 .no-pause 一致）
  if (mods['prevent-scroll']) opts.preventScroll = true;
  // 静态修饰符 .disabled（编译期固定，动态禁用请用绑定值 { disabled }）
  if (mods['disabled']) opts.disabled = true;

  if (!opts.selector) opts.selector = DEFAULT_SELECTOR;
  if (!opts.orientation) opts.orientation = 'both';
  if (opts.autoScroll === undefined) opts.autoScroll = true;

  return opts;
};

/** 基于真实视觉几何坐标计算上下行最近的节点（解决不规则/Flex/Grid布局换行跳节点问题） */
const getSpatialNextIndex = (currentIndex: number, direction: 'up' | 'down', entries: Entry[]): number => {
  const currentEntry = entries[currentIndex];
  if (!currentEntry) return currentIndex;
  const currentRect = currentEntry.el.getBoundingClientRect();
  const currentCenterX = currentRect.left + currentRect.width / 2;

  let bestIndex = currentIndex;
  let minDistance = Infinity;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry || i === currentIndex || !entry.eligible) continue;
    const rect = entry.el.getBoundingClientRect();

    const isTargetDirection =
      direction === 'down' ? rect.top >= currentRect.bottom - 4 : rect.bottom <= currentRect.top + 4;

    if (isTargetDirection) {
      const candidateCenterX = rect.left + rect.width / 2;
      const distY = Math.abs(direction === 'down' ? rect.top - currentRect.bottom : currentRect.top - rect.bottom);
      const distX = Math.abs(candidateCenterX - currentCenterX);
      const score = distY * 2.5 + distX;

      if (score < minDistance) {
        minDistance = score;
        bestIndex = i;
      }
    }
  }
  return bestIndex;
};

interface NavContext {
  currentIndex: number;
  total: number;
  entries: Entry[];
  cols: number | undefined;
  loop?: boolean;
}

/** 从 from-1 向前找第一个可导航元素；loop 开启时绕到末尾继续找，找不到返回 -1。 */
const findEligibleBackward = (entries: Entry[], from: number, loop?: boolean): number => {
  for (let idx = from - 1; idx >= 0; idx--) if (entries[idx]?.eligible) return idx;

  if (loop) for (let idx = entries.length - 1; idx > from; idx--) if (entries[idx]?.eligible) return idx;

  return -1;
};

/** 从 from+1 向后找第一个可导航元素；loop 开启时绕回头部继续找，找不到返回 -1。 */
const findEligibleForward = (entries: Entry[], from: number, total: number, loop?: boolean): number => {
  for (let idx = from + 1; idx < total; idx++) if (entries[idx]?.eligible) return idx;

  if (loop) for (let idx = 0; idx < from; idx++) if (entries[idx]?.eligible) return idx;

  return -1;
};

const navStrategies: Record<string, (ctx: NavContext) => number> = {
  ArrowLeft: ({ currentIndex, entries, loop }) => {
    const idx = findEligibleBackward(entries, currentIndex, loop);
    return idx >= 0 ? idx : currentIndex;
  },
  ArrowRight: ({ currentIndex, total, entries, loop }) => {
    const idx = findEligibleForward(entries, currentIndex, total, loop);
    return idx >= 0 ? idx : currentIndex;
  },
  ArrowUp: ({ currentIndex, cols, entries, loop }) => {
    if (cols === 1) {
      const idx = findEligibleBackward(entries, currentIndex, loop);
      return idx >= 0 ? idx : currentIndex;
    }
    if (cols && cols > 1) {
      let targetIdx = currentIndex - cols;
      while (targetIdx >= 0 && !entries[targetIdx]?.eligible) targetIdx -= cols;

      if (targetIdx >= 0 && entries[targetIdx]?.eligible) return targetIdx;

      if (loop) {
        let loopedIdx = currentIndex;
        while (loopedIdx + cols < entries.length) loopedIdx += cols;
        while (loopedIdx >= 0 && !entries[loopedIdx]?.eligible) loopedIdx -= cols;

        if (loopedIdx >= 0 && entries[loopedIdx]?.eligible) return loopedIdx;
      }
      return currentIndex;
    }
    return getSpatialNextIndex(currentIndex, 'up', entries);
  },
  ArrowDown: ({ currentIndex, cols, total, entries, loop }) => {
    if (cols === 1) {
      const idx = findEligibleForward(entries, currentIndex, total, loop);
      return idx >= 0 ? idx : currentIndex;
    }
    if (cols && cols > 1) {
      let targetIdx = currentIndex + cols;
      while (targetIdx < total && !entries[targetIdx]?.eligible) targetIdx += cols;

      if (targetIdx < total && entries[targetIdx]?.eligible) return targetIdx;

      if (loop) {
        let loopedIdx = currentIndex % cols;
        while (loopedIdx < total && !entries[loopedIdx]?.eligible) loopedIdx += cols;

        if (loopedIdx < total && entries[loopedIdx]?.eligible) return loopedIdx;
      }
      return currentIndex;
    }
    return getSpatialNextIndex(currentIndex, 'down', entries);
  },
  Home: ({ total, entries }) => {
    for (let idx = 0; idx < total; idx++) if (entries[idx]?.eligible) return idx;

    return -1;
  },
  End: ({ total, entries }) => {
    for (let idx = total - 1; idx >= 0; idx--) if (entries[idx]?.eligible) return idx;

    return -1;
  },
};

interface ElementArrowNavState {
  options: ArrowNavOptions;
  listener: (e: KeyboardEvent) => void;
}

const stateMap = new WeakMap<HTMLElement, ElementArrowNavState>();

/** 已告警过的容器：同一容器只提示一次，避免每次按键刷屏 */
const warnedSelectors = new WeakSet<HTMLElement>();

/**
 * 选择器与 DOM 脱钩的告警。
 *
 * 显式 selector 基本都按类名/标记挂钩，一旦被挂钩的标记类被改名或清掉，`querySelectorAll`
 * 只会静默返回空集 —— 表现是「方向键毫无反应」而不是任何报错，极难自查（本指令的候选集
 * 就曾因卡片类名被重构而整体失效）。判据刻意收紧为「容器内确实存在可聚焦元素、却一个都
 * 没命中」，空列表网格（分组为空等）因此不会误报。
 */
const warnSelectorMismatch = (containerEl: HTMLElement, selector: string): void => {
  if (!import.meta.env?.DEV || warnedSelectors.has(containerEl)) return;
  if (!containerEl.querySelector('[data-focusable-outline], [tabindex]')) return;
  warnedSelectors.add(containerEl);
  console.warn(
    `[v-arrow-nav] 选择器 "${selector}" 未命中任何元素，方向键导航将失效（容器内存在可聚焦元素）。请核对被挂钩的标记类是否被改名或删除。`
  );
};

/** 创建容器 keydown 监听：按方向/几何策略定位目标元素并转移焦点，忽略输入类控件内的按键。 */
const createKeydownListener = (containerEl: HTMLElement) => (e: KeyboardEvent) => {
  const state = stateMap.get(containerEl);
  if (!state || state.options.disabled) return;

  if (isEditableTarget(e.target)) return;

  const isHorizontalKey = ['ArrowLeft', 'ArrowRight'].includes(e.key);
  const isVerticalKey = ['ArrowUp', 'ArrowDown'].includes(e.key);
  const isBoundaryKey = ['Home', 'End'].includes(e.key);

  const isNavKey = isHorizontalKey || isVerticalKey || isBoundaryKey;
  if (!isNavKey) return;

  // 方向过滤判断
  const orientation = state.options.orientation || 'both';
  if (orientation === 'horizontal' && isVerticalKey) return;
  if (orientation === 'vertical' && isHorizontalKey) return;

  const selector = state.options.selector || DEFAULT_SELECTOR;
  const rawElements = Array.from(containerEl.querySelectorAll<HTMLElement>(selector));
  const entries: Entry[] = rawElements.map(el => ({
    el,
    eligible: isEligible(el),
  }));

  const total = entries.length;
  if (total === 0) {
    warnSelectorMismatch(containerEl, selector);
    return;
  }

  const activeEl = document.activeElement as HTMLElement;
  let currentIndex = entries.findIndex(entry => entry.el === activeEl);

  if (currentIndex === -1) {
    const matchedAncestor = activeEl?.closest(selector) as HTMLElement | null;
    if (matchedAncestor) currentIndex = entries.findIndex(entry => entry.el === matchedAncestor);
  }
  if (currentIndex === -1) return;

  e.preventDefault();
  if (state.options.stop) e.stopPropagation();

  const ctx: NavContext = {
    currentIndex,
    total,
    entries,
    cols: state.options.cols,
    loop: state.options.loop,
  };

  const strategy = navStrategies[e.key];
  if (strategy) {
    const targetIdx = strategy(ctx);
    if (targetIdx >= 0 && targetIdx !== currentIndex && entries[targetIdx]?.el) {
      const toEl = entries[targetIdx].el;
      const fromEl = entries[currentIndex]?.el || activeEl;

      toEl.focus({ preventScroll: state.options.preventScroll });

      if (state.options.autoScroll && isFunction(toEl.scrollIntoView))
        toEl.scrollIntoView({
          block: 'nearest',
          inline: 'nearest',
          behavior: resolveScrollBehavior('smooth'),
        });

      state.options.onNavigate?.(toEl, fromEl);
    } else state.options.onEdge?.(e.key, activeEl);
  }
};

/**
 * 容器内二维方向键（含 Home / End）焦点导航指令：网格与列表同构，
 * 目标按真实视觉几何就近选取，列数由 `cols` 声明。
 */
export const vArrowNav: Directive<HTMLElement, ArrowNavBinding, ArrowNavModifiers> = {
  mounted(el, binding) {
    const options = resolveOptions(binding);
    const listener = createKeydownListener(el);
    stateMap.set(el, { options, listener });
    el.addEventListener('keydown', listener);
  },
  updated(el, binding) {
    const state = stateMap.get(el);
    if (state) state.options = resolveOptions(binding);
  },
  unmounted(el) {
    const state = stateMap.get(el);
    if (state) {
      el.removeEventListener('keydown', state.listener);
      stateMap.delete(el);
    }
  },
};
