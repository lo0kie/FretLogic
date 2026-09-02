import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import BaseCheckbox from '@/components/ui/BaseCheckbox.vue';

describe('BaseCheckbox.vue', () => {
  it('renders correctly with default props', () => {
    const wrapper = mount(BaseCheckbox, {
      props: {
        modelValue: false,
        label: '记住密码',
        description: '30天内免登录',
      },
    });

    const input = wrapper.find('input[type="checkbox"]');
    expect(input.exists()).toBe(true);
    expect(input.attributes('aria-checked')).toBe('false');
    expect(wrapper.find('.checkbox-label').text()).toBe('记住密码');
    expect(wrapper.find('.checkbox-description').text()).toBe('30天内免登录');
  });

  it('handles boolean v-model toggling', async () => {
    const wrapper = mount(BaseCheckbox, {
      props: {
        modelValue: false,
      },
    });

    const input = wrapper.find('input[type="checkbox"]');
    await input.trigger('change');

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true]);
    expect(wrapper.emitted('change')?.[0]).toEqual([true, true]);
  });

  it('supports custom trueValue and falseValue', async () => {
    const wrapper = mount(BaseCheckbox, {
      props: {
        modelValue: 'no',
        trueValue: 'yes',
        falseValue: 'no',
      },
    });

    const input = wrapper.find('input[type="checkbox"]');
    expect(input.attributes('aria-checked')).toBe('false');

    await input.trigger('change');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['yes']);
    expect(wrapper.emitted('change')?.[0]).toEqual([true, 'yes']);
  });

  it('supports array group binding', async () => {
    const wrapper = mount(BaseCheckbox, {
      props: {
        modelValue: ['apple', 'banana'],
        value: 'cherry',
      },
    });

    const input = wrapper.find('input[type="checkbox"]');
    expect(input.attributes('aria-checked')).toBe('false');

    // Add cherry
    await input.trigger('change');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['apple', 'banana', 'cherry']]);

    // Check checked state when value is in array
    const checkedWrapper = mount(BaseCheckbox, {
      props: {
        modelValue: ['apple', 'banana'],
        value: 'apple',
      },
    });
    expect(checkedWrapper.find('input[type="checkbox"]').attributes('aria-checked')).toBe('true');

    // Remove apple
    await checkedWrapper.find('input[type="checkbox"]').trigger('change');
    expect(checkedWrapper.emitted('update:modelValue')?.[0]).toEqual([['banana']]);
  });

  it('supports Set group binding', async () => {
    const set = new Set(['foo']);
    const wrapper = mount(BaseCheckbox, {
      props: {
        modelValue: set,
        value: 'bar',
      },
    });

    await wrapper.find('input[type="checkbox"]').trigger('change');
    const updatedSet = wrapper.emitted('update:modelValue')?.[0]?.[0] as Set<string>;
    expect(updatedSet).toBeInstanceOf(Set);
    expect(updatedSet.has('bar')).toBe(true);
    expect(updatedSet.has('foo')).toBe(true);
  });

  it('handles indeterminate state correctly', async () => {
    const wrapper = mount(BaseCheckbox, {
      props: {
        modelValue: false,
        indeterminate: true,
      },
    });

    const input = wrapper.find('input[type="checkbox"]');
    expect(input.attributes('aria-checked')).toBe('mixed');

    // Clicking indeterminate checkbox turns it to checked and clears indeterminate
    await input.trigger('change');
    expect(wrapper.emitted('update:indeterminate')?.[0]).toEqual([false]);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true]);
  });

  it('does not toggle when disabled or readonly', async () => {
    const wrapper = mount(BaseCheckbox, {
      props: {
        modelValue: false,
        disabled: true,
      },
    });

    const input = wrapper.find('input[type="checkbox"]');
    expect(input.attributes('disabled')).toBeDefined();
    await input.trigger('change');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('renders custom slots correctly', () => {
    const wrapper = mount(BaseCheckbox, {
      props: {
        modelValue: true,
      },
      slots: {
        default: '<span class="custom-label">自定义标签</span>',
        description: '<span class="custom-desc">自定义描述</span>',
        icon: '<span class="custom-icon">V</span>',
      },
    });

    expect(wrapper.find('.custom-label').exists()).toBe(true);
    expect(wrapper.find('.custom-desc').exists()).toBe(true);
    expect(wrapper.find('.custom-icon').exists()).toBe(true);
  });
});
