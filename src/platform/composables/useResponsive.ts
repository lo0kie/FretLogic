import { breakpointsTailwind, useBreakpoints } from '@vueuse/core';

/**
 * 全局统一响应式断点状态组合式函数
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
