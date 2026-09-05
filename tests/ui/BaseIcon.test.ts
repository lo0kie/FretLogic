import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import {
  ICON_SIZE_PRESETS,
  ICON_STROKE_PRESETS,
  resolveIconSize,
  resolveIconStroke,
} from '@/platform/ui/icons/iconSizes';

const mountIcon = (props: Record<string, unknown> = {}) => mount(BaseIcon, { props: { name: 'x', ...props } });

describe('iconSizes 档位表（图标尺寸与描边的单一来源）', () => {
  it('尺寸档位覆盖 xs→3xl，空状态插画级 26/38 已并入扩档', () => {
    expect(ICON_SIZE_PRESETS).toEqual({ 'xs': 12, 'sm': 14, 'md': 16, 'lg': 18, 'xl': 20, '2xl': 26, '3xl': 38 });
  });

  it('描边档位收敛为 thin / regular / bold 三档', () => {
    expect(ICON_STROKE_PRESETS).toEqual({ thin: 2.2, regular: 2.5, bold: 3 });
  });
});

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

describe('BaseIcon 组件（iconSize / iconStroke 重命名后的契约）', () => {
  it('未传 iconSize 时默认 1em，跟随父级字号', () => {
    const wrapper = mountIcon();
    expect(wrapper.attributes('style')).toContain('width: 1em');
  });

  it('iconSize 档位生效为等宽高与同步字号', () => {
    const style = mountIcon({ iconSize: 'lg' }).attributes('style') ?? '';
    expect(style).toContain('width: 18px');
    expect(style).toContain('height: 18px');
    expect(style).toContain('font-size: 18px');
  });

  it('iconStroke 档位生效为描边粗细', () => {
    expect(mountIcon({ iconStroke: 'bold' }).attributes('style')).toContain('stroke-width: 3px');
  });

  it('未提供 iconStroke 时不写入描边样式（保留图标自带描边）', () => {
    expect(mountIcon().attributes('style') ?? '').not.toContain('stroke-width');
  });

  it('spin 时追加旋转动画类', () => {
    expect(mountIcon({ spin: true }).classes()).toContain('animate-spin');
  });
});
