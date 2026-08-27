import BaseBadge from '@/components/base/BaseBadge.vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

describe('BaseBadge component', () => {
  it('renders content correctly', () => {
    const wrapper = mount(BaseBadge, {
      props: {
        content: 42,
        variant: 'primary',
      },
    });

    expect(wrapper.text()).toContain('42');
    // 非交互徽标渲染为 span（无 interactive/hoverClose/onClick）
    expect(wrapper.element.tagName).toBe('SPAN');
  });

  it('supports hover-close prop with swap icon', () => {
    const wrapper = mount(BaseBadge, {
      props: {
        content: 1,
        hoverClose: true,
        width: '1.5rem',
      },
    });

    // hoverClose 使徽标变为可交互按钮
    expect(wrapper.element.tagName).toBe('BUTTON');
    // 自定义宽度通过内联样式生效
    expect(wrapper.attributes('style') ?? '').toContain('1.5rem');
    // hoverClose 渲染关闭图标（svg）
    expect(wrapper.find('svg').exists()).toBe(true);
    expect(wrapper.text()).toContain('1');
  });
});
