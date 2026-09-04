import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import BaseNumberInput from '@/platform/ui/input/BaseNumberInput.vue';

describe('BaseNumberInput component', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('min > max 时输出开发警告', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount(BaseNumberInput, {
      props: { min: 10, max: 0, modelValue: 5 },
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[BaseNumberInput]'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('min'));
  });

  it('min <= max 时不产生警告', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount(BaseNumberInput, {
      props: { min: 0, max: 10, modelValue: 5 },
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
