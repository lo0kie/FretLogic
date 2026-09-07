import { describe, expect, it } from 'vitest';

import { useResponsive } from '@/platform/composables/useResponsive';

describe('useResponsive 响应式断点工具', () => {
  it('正确暴露 isMobile, isTablet, isDesktop, isWide, isDrawerMode 等响应式状态', () => {
    const responsive = useResponsive();

    expect(responsive.isMobile).toBeDefined();
    expect(responsive.isTablet).toBeDefined();
    expect(responsive.isDesktop).toBeDefined();
    expect(responsive.isWide).toBeDefined();
    expect(responsive.isDrawerMode).toBeDefined();

    // 在 JSDOM 环境中响应式属性为 Ref<boolean>
    expect(typeof responsive.isMobile.value).toBe('boolean');
    expect(typeof responsive.isDesktop.value).toBe('boolean');
    expect(typeof responsive.isDrawerMode.value).toBe('boolean');
  });
});
