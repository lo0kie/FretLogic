import BaseSwitch from '@/components/ui/BaseSwitch.vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

describe('BaseSwitch.vue', () => {
  it('renders correctly with default props', () => {
    const wrapper = mount(BaseSwitch, {
      props: {
        modelValue: false,
        label: 'switch-label-text',
      },
    });

    const button = wrapper.find('[role="switch"]');
    expect(button.exists()).toBe(true);
    expect(button.attributes('aria-checked')).toBe('false');
    expect(button.attributes('aria-disabled')).toBe('false');
    const labelEl = wrapper.find('.switch-label');
    expect(labelEl.exists()).toBe(true);
    expect(labelEl.text()).toContain('switch-label-text');
  });

  it('renders checked state when modelValue is true', () => {
    const wrapper = mount(BaseSwitch, {
      props: {
        modelValue: true,
      },
    });

    const button = wrapper.find('[role="switch"]');
    expect(button.attributes('aria-checked')).toBe('true');
  });

  it('emits update:modelValue and change on pointer click/drag', async () => {
    const wrapper = mount(BaseSwitch, {
      props: {
        modelValue: false,
      },
    });

    const btn = wrapper.find('[role="switch"]');
    await btn.trigger('pointerdown', { clientX: 10, button: 0 });
    await btn.trigger('pointermove', { clientX: 30 });
    await btn.trigger('pointerup', { clientX: 30 });

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true]);
    expect(wrapper.emitted('change')?.[0]).toEqual([true]);
  });

  it('does not emit events when disabled', async () => {
    const wrapper = mount(BaseSwitch, {
      props: {
        modelValue: false,
        disabled: true,
      },
    });

    const btn = wrapper.find('[role="switch"]');
    await btn.trigger('pointerdown', { clientX: 10, button: 0 });
    await btn.trigger('pointerup', { clientX: 10 });
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.emitted('change')).toBeUndefined();
  });
});
