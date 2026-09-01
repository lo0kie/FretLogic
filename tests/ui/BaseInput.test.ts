import BaseInput from '@/components/ui/BaseInput.vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

describe('BaseInput component', () => {
  it('invalid=true 时渲染错误边框并保留 aria-invalid', () => {
    const wrapper = mount(BaseInput, {
      props: { modelValue: '', invalid: true },
    });
    const input = wrapper.find('input');
    expect(input.classes()).toContain('border-danger');
    expect(input.classes()).toContain('focus:enabled:border-danger');
    expect(input.attributes('aria-invalid')).toBe('true');
  });

  it('默认状态渲染常规边框与主题焦点色', () => {
    const wrapper = mount(BaseInput, {
      props: { modelValue: '' },
    });
    const input = wrapper.find('input');
    expect(input.classes()).toContain('border-border-light');
    expect(input.classes()).toContain('focus:enabled:border-primary');
    expect(input.attributes('aria-invalid')).toBeUndefined();
  });
});
