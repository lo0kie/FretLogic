import { breakpointsTailwind, useBreakpoints } from '@vueuse/core';

/**
 * 全局统一响应式断点状态组合式函数
 *
 * 状态：**已就绪但尚未接入任何视图**（有意预留，非遗忘的死代码 —— 接入前请勿删除）。
 * 计划用途：顶栏图标在窄屏的收纳、工作台右侧面板从固定 w-72 改为可收起、
 * 侧栏在小屏切抽屉模式（见下方 isDrawerMode）。接入时一并补单测（当前 `tests/` 下无覆盖）。
 *
 * 基于 Tailwind 标准断点：
 * - sm: 640px
 * - md: 768px
 * - lg: 1024px
 * - xl: 1280px
 * - 2xl: 1536px
 */
export function useResponsive() {
  const breakpoints = useBreakpoints(breakpointsTailwind);

  /** 是否移动端窄屏视口（< 768px） */
  const isMobile = breakpoints.smaller('md');

  /** 是否平板/中等视口（768px ~ 1023px） */
  const isTablet = breakpoints.between('md', 'lg');

  /** 是否桌面普通及以上视口（>= 1024px） */
  const isDesktop = breakpoints.greaterOrEqual('lg');

  /** 是否宽屏桌面视口（>= 1280px） */
  const isWide = breakpoints.greaterOrEqual('xl');

  /** 是否小于桌面断点（< 1024px，用于触发侧边栏抽屉模式与移动布局） */
  const isDrawerMode = breakpoints.smaller('lg');

  return {
    breakpoints,
    isMobile,
    isTablet,
    isDesktop,
    isWide,
    isDrawerMode,
  };
}
