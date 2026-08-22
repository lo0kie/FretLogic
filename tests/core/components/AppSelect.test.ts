import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AppSelect from '@/core/components/AppSelect.vue';

const options = [
  { label: 'C', value: 'C' },
  { label: 'G', value: 'G' },
];

describe('AppSelect', () => {
  it('渲染选项并选中当前值', () => {
    const wrapper = mount(AppSelect, { props: { modelValue: 'G', options } });
    const select = wrapper.find('select');
    expect(select.element.value).toBe('G');
    expect(wrapper.findAll('option')).toHaveLength(2);
  });

  it('change 时发射 update:modelValue 与 change', async () => {
    const wrapper = mount(AppSelect, { props: { modelValue: 'C', options } });
    await wrapper.find('select').setValue('G');
    expect(wrapper.emitted('update:modelValue')).toEqual([['G']]);
    expect(wrapper.emitted('change')).toEqual([['G']]);
  });
});
