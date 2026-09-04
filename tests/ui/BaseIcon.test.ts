import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';

describe('BaseIcon.vue', () => {
  it('renders correctly with icon name', () => {
    const wrapper = mount(BaseIcon, {
      props: {
        name: 'check',
      },
    });

    const svg = wrapper.find('svg');
    expect(svg.exists()).toBe(true);
  });

  it('converts numeric size to px correctly', () => {
    const wrapper = mount(BaseIcon, {
      props: {
        name: 'trash-2',
        size: 16,
      },
    });

    const svg = wrapper.find('svg');
    expect(svg.attributes('style')).toContain('width: 16px');
    expect(svg.attributes('style')).toContain('height: 16px');
  });

  it('supports string size', () => {
    const wrapper = mount(BaseIcon, {
      props: {
        name: 'plus',
        size: '1.5rem',
      },
    });

    const svg = wrapper.find('svg');
    expect(svg.attributes('style')).toContain('width: 1.5rem');
  });

  it('supports spin prop for loading animations', () => {
    const wrapper = mount(BaseIcon, {
      props: {
        name: 'loader-2',
        spin: true,
      },
    });

    const svg = wrapper.find('svg');
    expect(svg.classes()).toContain('animate-spin');
  });

  it('supports rotate and color props', () => {
    const wrapper = mount(BaseIcon, {
      props: {
        name: 'chevron-down',
        rotate: 180,
        color: 'red',
      },
    });

    const svg = wrapper.find('svg');
    expect(svg.attributes('style')).toContain('transform: rotate(180deg)');
    expect(svg.attributes('style')).toContain('color: red');
  });

  it('supports strokeWidth prop for outline icons', () => {
    const wrapper = mount(BaseIcon, {
      props: {
        name: 'plus',
        strokeWidth: 2.5,
      },
    });

    const svg = wrapper.find('svg');
    expect(svg.attributes('style')).toContain('stroke-width: 2.5px');
  });
});
