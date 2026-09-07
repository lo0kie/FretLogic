import { describe, expect, it } from 'vitest';

import { resolveIconSize, resolveIconStroke } from '@/platform/ui/icons/iconSizes';

describe('resolveIconSize', () => {
  it('档位名解析为 px（含扩档的 2xl / 3xl）', () => {
    expect(resolveIconSize('md')).toBe('16px');
    expect(resolveIconSize('2xl')).toBe('26px');
    expect(resolveIconSize('3xl')).toBe('38px');
  });

  it('裸数字按 px 处理', () => {
    expect(resolveIconSize(22)).toBe('22px');
  });

  it('非档位字符串原样透传（em / rem 等 CSS 长度）', () => {
    expect(resolveIconSize('1em')).toBe('1em');
    expect(resolveIconSize('1.2rem')).toBe('1.2rem');
  });
});

describe('resolveIconStroke', () => {
  it('档位名解析为 px', () => {
    expect(resolveIconStroke('thin')).toBe('2.2px');
    expect(resolveIconStroke('regular')).toBe('2.5px');
    expect(resolveIconStroke('bold')).toBe('3px');
  });

  it('数字按 px 处理，带单位字符串原样透传', () => {
    expect(resolveIconStroke(3)).toBe('3px');
    expect(resolveIconStroke('2.5px')).toBe('2.5px');
  });
});
