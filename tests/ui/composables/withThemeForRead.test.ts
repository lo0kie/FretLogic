import { afterEach, describe, expect, it } from 'vitest';

import { withThemeForRead } from '@/platform/composables/useTheme';

/**
 * `withThemeForRead` 的契约：换装 → 读 → **无条件复原**。
 *
 * 重点不是「能换装」，而是复原 —— `data-theme` / `.dark` 是主题模块的状态，读取路径一旦抛错或
 * 中途早退而没有复原，整个应用会停在调用方要的那个主题上（指板导出的亮/暗配色会变成全局配色）。
 */
const root = document.documentElement;

/** 回到「无 data-theme、无 .dark」的基线 */
const reset = () => {
  root.removeAttribute('data-theme');
  root.classList.remove('dark');
};

describe('withThemeForRead 的换装与复原', () => {
  afterEach(reset);

  it('在指定主题下取值：回调内看到的是目标主题', () => {
    root.setAttribute('data-theme', 'light');

    const seen = withThemeForRead('dark', () => ({
      theme: root.getAttribute('data-theme'),
      dark: root.classList.contains('dark'),
    }));

    expect(seen).toEqual({ theme: 'dark', dark: true });
  });

  it('读完复原到调用前的主题', () => {
    root.setAttribute('data-theme', 'light');

    withThemeForRead('dark', () => undefined);

    expect(root.getAttribute('data-theme')).toBe('light');
    expect(root.classList.contains('dark')).toBe(false);
  });

  it('读取抛错时同样复原（否则整个应用会停在那个主题上）', () => {
    root.setAttribute('data-theme', 'light');

    expect(() =>
      withThemeForRead('high-contrast', () => {
        throw new Error('read failed');
      })
    ).toThrow('read failed');

    expect(root.getAttribute('data-theme')).toBe('light');
    expect(root.classList.contains('dark')).toBe(false);
  });

  it('原本没有 data-theme 时复原成「无该属性」，不留 light 之类的残留值', () => {
    reset();

    withThemeForRead('dark', () => undefined);

    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(root.classList.contains('dark')).toBe(false);
  });
});
