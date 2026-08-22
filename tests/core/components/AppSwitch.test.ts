import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AppSwitch from '@/core/components/AppSwitch.vue';

describe('AppSwitch', () => {
  it('渲染 off 状态并切换为 on', async () => {
    const wrapper = mount(AppSwitch, { props: { modelValue: false } });
    expect(wrapper.classes()).not.toContain('is-on');
    expect(wrapper.attributes('role')).toBe('switch');

    await wrapper.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]]);
    expect(wrapper.emitted('change')).toEqual([[true]]);
  });

  it('disabled 时不触发切换', async () => {
    const wrapper = mount(AppSwitch, { props: { modelValue: true, disabled: true } });
    expect(wrapper.classes()).toContain('is-on');
    await wrapper.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('aria-checked 跟随状态', () => {
    const wrapper = mount(AppSwitch, { props: { modelValue: true } });
    expect(wrapper.attributes('aria-checked')).toBe('true');
  });
});
