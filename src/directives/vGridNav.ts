import type { Directive, DirectiveBinding } from 'vue';

export interface GridNavOptions {
  /** 指定列数（为 1 时上下与左右等价；未指定时按视觉几何空间最近匹配） */
  cols?: number;
  /** 限定收集可聚焦元素的选择器 */
  selector?: string;
  /** 处理完按键后是否阻止事件继续冒泡 */
  stop?: boolean;
  /** 是否禁用键盘网格导航 */
  disabled?: boolean;
  /** 是否在边界循环导航 */
  loop?: boolean;
}

export type GridNavBinding = number | GridNavOptions | boolean | undefined;
export type GridNavModifiers = 'stop' | 'loop' | (string & Record<never, never>);

interface Entry {
  el: HTMLElement;
  eligible: boolean;
}

const DEFAULT_SELECTOR =
  '[data-focusable-inline], [data-focusable-outline], [tabindex="0"], button, input, select, textarea, a[href]';

const isTestEnv = typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test';

const isEligible = (el: HTMLElement): boolean => {
  if (el.hasAttribute('disabled')) return false;
  if (el.getAttribute('tabindex') === '-1') return false;
  if (el.getAttribute('aria-disabled') === 'true') return false;
  if (el.offsetParent === null && !isTestEnv) {
    return false;
  }
  if (el.closest('[inert]')) return false;
  return true;
};

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

  if (mods.stop) opts.stop = true;
  if (mods.loop) opts.loop = true;
  if (!opts.selector) opts.selector = DEFAULT_SELECTOR;

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
      const targetIdx = currentIndex - cols;
      if (targetIdx >= 0 && entries[targetIdx]?.eligible) return targetIdx;
      if (loop && targetIdx < 0) {
        let loopedIdx = currentIndex;
        while (loopedIdx + cols < entries.length) loopedIdx += cols;
        if (entries[loopedIdx]?.eligible) return loopedIdx;
      }
    }
    return getSpatialNextIndex(currentIndex, 'up', entries);
  },
  ArrowDown: ({ currentIndex, cols, total, entries, loop }) => {
    if (cols === 1) {
      const idx = findEligibleForward(entries, currentIndex, total, loop);
      return idx >= 0 ? idx : currentIndex;
    }
    if (cols && cols > 1) {
      const targetIdx = currentIndex + cols;
      if (targetIdx < total && entries[targetIdx]?.eligible) return targetIdx;
      if (loop && targetIdx >= total) {
        let loopedIdx = currentIndex;
        while (loopedIdx - cols >= 0) loopedIdx -= cols;
        if (entries[loopedIdx]?.eligible) return loopedIdx;
      }
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

const createKeydownListener = (containerEl: HTMLElement) => (e: KeyboardEvent) => {
  const state = stateMap.get(containerEl);
  if (!state || state.options.disabled) return;

  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    return;
  }

  const isNavKey = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key);
  if (!isNavKey) return;

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
    if (targetIdx >= 0 && entries[targetIdx]?.el) {
      entries[targetIdx].el.focus();
    }
  }
};

/**
 * 网格 / 列表二维键盘方向键与快捷键导航指令
 *
 * @example
 * ```html
 * <!-- 1. 自动根据空间视觉位置导航 -->
 * <div v-grid-nav> ... </div>
 *
 * <!-- 2. 指定固定列数（如 3 列） -->
 * <div v-grid-nav="3"> ... </div>
 *
 * <!-- 3. 对象配置选项 -->
 * <div v-grid-nav="{ cols: 5, selector: '.chord-card' }"> ... </div>
 *
 * <!-- 4. 修饰符 -->
 * <div v-grid-nav.stop.loop="3"> ... </div>
 * ```
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
