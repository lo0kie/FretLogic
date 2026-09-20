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
