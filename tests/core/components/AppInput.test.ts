import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AppInput from '@/core/components/AppInput.vue';

describe('AppInput', () => {
  it('渲染 value 与 placeholder', () => {
    const wrapper = mount(AppInput, { props: { modelValue: 'C', placeholder: '搜索' } });
    const input = wrapper.find('input');
    expect(input.element.value).toBe('C');
    expect(input.attributes('placeholder')).toBe('搜索');
  });

  it('输入时发射 update:modelValue 与 input', async () => {
    const wrapper = mount(AppInput);
    await wrapper.find('input').setValue('G');
    expect(wrapper.emitted('update:modelValue')).toEqual([['G']]);
    expect(wrapper.emitted('input')).toEqual([['G']]);
  });

  it('disabled 传递到原生 input', () => {
    const wrapper = mount(AppInput, { props: { disabled: true } });
    expect(wrapper.find('input').attributes('disabled')).toBeDefined();
  });
});
