import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import BaseBadge from '@/components/ui/BaseBadge.vue';

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

  it('hoverClose click emits close event instead of click', async () => {
    const wrapper = mount(BaseBadge, {
      props: { content: 3, hoverClose: true },
    });

    await wrapper.trigger('click');

    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(wrapper.emitted('click')).toBeUndefined();
  });

  it('closable close button emits close event', async () => {
    const wrapper = mount(BaseBadge, {
      props: { content: 3, closable: true },
    });

    const closeBtn = wrapper.find('button[aria-label="关闭"]');
    expect(closeBtn.exists()).toBe(true);
    await closeBtn.trigger('click');

    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('interactive badge click emits click event', async () => {
    const wrapper = mount(BaseBadge, {
      props: { content: 3, interactive: true },
    });

    await wrapper.trigger('click');

    expect(wrapper.emitted('click')).toHaveLength(1);
    expect(wrapper.emitted('close')).toBeUndefined();
  });
});
