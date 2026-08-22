import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AppButton from '@/core/components/AppButton.vue';

describe('AppButton', () => {
  it('渲染默认按钮并触发 click', async () => {
    const wrapper = mount(AppButton, { slots: { default: '确定' } });
    expect(wrapper.text()).toContain('确定');
    expect(wrapper.attributes('type')).toBe('button');

    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
  });

  it('disabled 时点击不触发事件', async () => {
    const wrapper = mount(AppButton, { props: { disabled: true }, slots: { default: 'x' } });
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toBeUndefined();
    expect(wrapper.attributes('disabled')).toBeDefined();
  });

  it('loading 时禁用且显示 spinner', async () => {
    const wrapper = mount(AppButton, { props: { loading: true }, slots: { default: '保存' } });
    expect(wrapper.find('.app-button-spinner').exists()).toBe(true);
    expect(wrapper.attributes('disabled')).toBeDefined();
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toBeUndefined();
  });

  it('应用 size 与 variant class', () => {
    const wrapper = mount(AppButton, {
      props: { size: 'lg', variant: 'danger' },
      slots: { default: '删除' },
    });
    expect(wrapper.classes()).toContain('is-size-lg');
    expect(wrapper.classes()).toContain('is-variant-danger');
  });

  it('block 与 iconOnly class', () => {
    const wrapper = mount(AppButton, { props: { block: true, iconOnly: true } });
    expect(wrapper.classes()).toContain('is-block');
    expect(wrapper.classes()).toContain('is-icon-only');
  });
});
