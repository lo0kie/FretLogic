/**
 * 动效偏好工具：把「系统是否要求减弱动态效果」收敛成单一来源。
 *
 * 为什么需要它：main.scss 的 `@media (prefers-reduced-motion: reduce)` 只能归零 **CSS** 动画
 * 与 `scroll-behavior`，管不住 JS 显式传入的 `behavior: 'smooth'`——那是调用方主动请求的平滑滚动，
 * 其优先级高于 CSS 的 scroll-behavior，因此系统偏好对这类滚动完全失效。
 * 凡是要写 'smooth' 的地方都应先经 resolveScrollBehavior 过滤。
 *
 * 自持 isClient 判定而不从 platform/ui 引入：platform/utils 严禁依赖 platform/ui（eslint zone）。
 */

/** 有无 DOM（SSR / 纯 node 测试环境为 false） */
const hasDom = (): boolean => typeof document !== 'undefined' && typeof window !== 'undefined';

/** 系统是否要求减弱动态效果（无 DOM / 无 matchMedia 环境视为 false） */
export const prefersReducedMotion = (): boolean => {
  if (!hasDom() || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * 按系统偏好收敛滚动行为：请求 'smooth' 但用户要求减弱动效时降级为 'auto'（瞬时跳转），
 * 其余取值原样透传。用于 scrollTo / scrollIntoView / scrollBy 的 behavior 参数。
 */
export const resolveScrollBehavior = (requested: ScrollBehavior = 'auto'): ScrollBehavior =>
  requested === 'smooth' && prefersReducedMotion() ? 'auto' : requested;

// ==================== transition 简写组合 ====================
//
// 同一个元素可能被多个指令共享（典型：BaseScrollArea 根元素同时挂 v-auto-height 与
// v-edge-fade），各自都要写 el.style.transition。整条覆盖会让后写方吞掉先写方的过渡——
// 症状是「A 生效 B 失效」且随触发时序摇摆。这里收敛出按条目组合的单一实现：
// 拆分时必须括号感知（cubic-bezier(...) / var(--x, fallback) 内含逗号，朴素 split 会切碎）。

/** 拆分 transition 简写为条目：顶层逗号分隔，括号内（bezier/var 缺省值）的逗号不分隔 */
const splitTransitionItems = (value: string): string[] => {
  const items: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      const part = value.slice(start, i).trim();
      if (part) items.push(part);
      start = i + 1;
    }
  }
  const tail = value.slice(start).trim();
  if (tail) items.push(tail);
  return items;
};

/** transition 条目的属性名（首个空白前的 token，如 `height` / `--fade-start`） */
const transitionPropertyOf = (item: string): string => item.trim().split(/\s+/)[0] ?? '';

/** 同属性条目是否已存在（用于写入前的幂等判断） */
export const hasTransitionItem = (existing: string, property: string): boolean =>
  splitTransitionItems(existing).some(item => transitionPropertyOf(item) === property);

/**
 * 合并一条 transition 条目：同属性覆盖、其余条目原位保留。
 * 多个指令共享同一元素的 style.transition 时，各自用它追加/更新自己的条目，
 * 不再整条覆盖他人（覆盖 = 吞掉别人的过渡，且随触发时序摇摆生效与否）。
 */
export const mergeTransitionItem = (existing: string, item: string): string => {
  const prop = transitionPropertyOf(item);
  const others = splitTransitionItems(existing).filter(i => transitionPropertyOf(i) !== prop);
  return [...others, item].join(', ');
};

/** 移除指定属性名的 transition 条目（卸载/禁用时回收自己的条目，不碰他人的） */
export const removeTransitionItems = (existing: string, ...properties: string[]): string => {
  const drop = new Set(properties);
  return splitTransitionItems(existing)
    .filter(item => !drop.has(transitionPropertyOf(item)))
    .join(', ');
};
