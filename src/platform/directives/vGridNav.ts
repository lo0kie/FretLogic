import type { Directive, DirectiveBinding } from 'vue';

export type GridNavOrientation = 'horizontal' | 'vertical' | 'both';

export interface GridNavOptions {
  /** 指定列数（为 1 时上下与左右等价；未指定时按视觉几何空间最近匹配） */
  cols?: number;
  /** 限定收集可聚焦元素的选择器 */
  selector?: string;
  /** 允许的方向限制：'horizontal' 仅水平 | 'vertical' 仅垂直 | 'both' 二维全方向 */
  orientation?: GridNavOrientation;
  /** 处理完按键后是否阻止事件继续冒泡 */
  stop?: boolean;
  /** 是否禁用键盘网格导航 */
  disabled?: boolean;
  /** 是否在边界循环导航 */
  loop?: boolean;
  /** 聚焦时是否阻止原生页面跳跃滚动 */
  preventScroll?: boolean;
  /** 聚焦后是否自动将目标元素平滑滚入可见区域，默认 true */
  autoScroll?: boolean;
  /** 导航切换焦点时的回调钩子 */
  onNavigate?: (toEl: HTMLElement, fromEl: HTMLElement) => void;
}

export type GridNavBinding = number | GridNavOptions | boolean | undefined;
export type GridNavModifiers =
  | 'stop'
  | 'loop'
  | 'horizontal'
  | 'vertical'
  | 'preventScroll'
  | 'prevent_scroll'
  | 'disabled'
  | (string & Record<never, never>);

interface Entry {
  el: HTMLElement;
  eligible: boolean;
}

const DEFAULT_SELECTOR =
  '[data-focusable-inline], [data-focusable-outline], [tabindex="0"], button, input, select, textarea, a[href]';

const isTestEnv = typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test';

/** 判断元素是否视觉可见：优先 offsetParent，fixed/sticky 节点回退计算样式判定；测试环境恒可见。 */
const isVisible = (el: HTMLElement): boolean => {
  if (isTestEnv) return true;
  if (el.offsetParent !== null) return true;
  // 处理 position: fixed / sticky 等 offsetParent 为 null 但依然正常可见的节点
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
const resolveOptions = (binding: DirectiveBinding<GridNavBinding>): GridNavOptions => {
  const val = binding.value;
  const mods = binding.modifiers;

  let opts: GridNavOptions = {};
  if (typeof val === 'number') {
    opts.cols = val;
  } else if (typeof val === 'object' && val !== null) {
    opts = { ...val };
  } else if (val === false) {
    opts.disabled = true;
  }

  if (mods['stop']) opts.stop = true;
  if (mods['loop']) opts.loop = true;
  if (mods['horizontal']) opts.orientation = 'horizontal';
  if (mods['vertical']) opts.orientation = 'vertical';
  if (mods['preventScroll'] || mods['prevent_scroll']) opts.preventScroll = true;
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
  for (let idx = from - 1; idx >= 0; idx--) {
    if (entries[idx]?.eligible) return idx;
  }
  if (loop) {
    for (let idx = entries.length - 1; idx > from; idx--) {
      if (entries[idx]?.eligible) return idx;
    }
  }
  return -1;
};

/** 从 from+1 向后找第一个可导航元素；loop 开启时绕回头部继续找，找不到返回 -1。 */
const findEligibleForward = (entries: Entry[], from: number, total: number, loop?: boolean): number => {
  for (let idx = from + 1; idx < total; idx++) {
    if (entries[idx]?.eligible) return idx;
  }
  if (loop) {
    for (let idx = 0; idx < from; idx++) {
      if (entries[idx]?.eligible) return idx;
    }
  }
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
      while (targetIdx >= 0 && !entries[targetIdx]?.eligible) {
        targetIdx -= cols;
      }
      if (targetIdx >= 0 && entries[targetIdx]?.eligible) return targetIdx;

      if (loop) {
        let loopedIdx = currentIndex;
        while (loopedIdx + cols < entries.length) loopedIdx += cols;
        while (loopedIdx >= 0 && !entries[loopedIdx]?.eligible) {
          loopedIdx -= cols;
        }
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
      while (targetIdx < total && !entries[targetIdx]?.eligible) {
        targetIdx += cols;
      }
      if (targetIdx < total && entries[targetIdx]?.eligible) return targetIdx;

      if (loop) {
        let loopedIdx = currentIndex % cols;
        while (loopedIdx < total && !entries[loopedIdx]?.eligible) {
          loopedIdx += cols;
        }
        if (loopedIdx < total && entries[loopedIdx]?.eligible) return loopedIdx;
      }
      return currentIndex;
    }
    return getSpatialNextIndex(currentIndex, 'down', entries);
  },
  Home: ({ total, entries }) => {
    for (let idx = 0; idx < total; idx++) {
      if (entries[idx]?.eligible) return idx;
    }
    return -1;
  },
  End: ({ total, entries }) => {
    for (let idx = total - 1; idx >= 0; idx--) {
      if (entries[idx]?.eligible) return idx;
    }
    return -1;
  },
};

interface ElementGridNavState {
  options: GridNavOptions;
  listener: (e: KeyboardEvent) => void;
}

const stateMap = new WeakMap<HTMLElement, ElementGridNavState>();

/** 创建容器 keydown 监听：按方向/几何策略定位目标元素并转移焦点，忽略输入类控件内的按键。 */
const createKeydownListener = (containerEl: HTMLElement) => (e: KeyboardEvent) => {
  const state = stateMap.get(containerEl);
  if (!state || state.options.disabled) return;

  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    return;
  }

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
  if (total === 0) return;

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

      if (state.options.autoScroll && typeof toEl.scrollIntoView === 'function') {
        toEl.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      }

      state.options.onNavigate?.(toEl, fromEl);
    }
  }
};

/**
 * 网格 / 列表二维键盘方向键与快捷键导航指令
 */
export const vGridNav: Directive<HTMLElement, GridNavBinding, GridNavModifiers> = {
  mounted(el, binding) {
    const options = resolveOptions(binding);
    const listener = createKeydownListener(el);
    stateMap.set(el, { options, listener });
    el.addEventListener('keydown', listener);
  },
  updated(el, binding) {
    const state = stateMap.get(el);
    if (state) {
      state.options = resolveOptions(binding);
    }
  },
  unmounted(el) {
    const state = stateMap.get(el);
    if (state) {
      el.removeEventListener('keydown', state.listener);
      stateMap.delete(el);
    }
  },
};
