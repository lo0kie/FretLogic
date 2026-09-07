import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import BaseSwitch from '@/platform/ui/switch/BaseSwitch.vue';

describe('BaseSwitch.vue', () => {
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
