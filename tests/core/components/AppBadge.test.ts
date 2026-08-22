import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AppBadge from '@/core/components/AppBadge.vue';

describe('AppBadge', () => {
  it('渲染文本与 variant class', () => {
    const wrapper = mount(AppBadge, { props: { text: '3', variant: 'danger' } });
    expect(wrapper.text()).toContain('3');
    expect(wrapper.classes()).toContain('is-variant-danger');
  });

  it('插槽优先于 text', () => {
    const wrapper = mount(AppBadge, { props: { text: '默认' }, slots: { default: '插槽' } });
    expect(wrapper.text()).toContain('插槽');
    expect(wrapper.text()).not.toContain('默认');
  });

  it('dot 模式渲染圆点类', () => {
    const wrapper = mount(AppBadge, { props: { dot: true } });
    expect(wrapper.classes()).toContain('is-dot');
  });
});
