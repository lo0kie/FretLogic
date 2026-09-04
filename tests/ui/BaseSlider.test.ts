import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import BaseSlider from '@/platform/ui/slider/BaseSlider.vue';

describe('BaseSlider component', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('min > max 时输出开发警告', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount(BaseSlider, { props: { modelValue: 5, min: 10, max: 0 } });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[BaseSlider]'));
  });

  it('min <= max 时不产生警告', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount(BaseSlider, { props: { modelValue: 5, min: 0, max: 10 } });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('readout 数值区可聚焦且回车进入精确输入', async () => {
    const wrapper = mount(BaseSlider, {
      props: { modelValue: 50, min: 0, max: 100, showReadout: true, editable: true },
    });
    const readout = wrapper.find('[aria-label="输入精确数值"]');
    expect(readout.exists()).toBe(true);
    expect(readout.attributes('role')).toBe('button');
    expect(readout.attributes('tabindex')).toBe('0');

    await readout.trigger('keydown', { key: 'Enter' });
    expect(wrapper.find('input[aria-label="输入精确数值"]').exists()).toBe(true);
  });

  it('editable=false 且 restoreOnValueClick=false 时 readout 不可聚焦', () => {
    const wrapper = mount(BaseSlider, {
      props: { modelValue: 50, min: 0, max: 100, showReadout: true, editable: false, restoreOnValueClick: false },
    });
    const readout = wrapper.find('span.tabular-nums.min-w-8');
    expect(readout.exists()).toBe(true);
    expect(readout.attributes('tabindex')).toBe('-1');
    expect(readout.attributes('role')).toBeUndefined();
  });
});
