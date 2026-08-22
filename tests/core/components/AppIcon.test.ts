import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { h, type FunctionalComponent } from 'vue';
import AppIcon from '@/core/components/AppIcon.vue';

const FunctionalIcon: FunctionalComponent = () => h('svg', { 'data-test': 'functional-icon' });

describe('AppIcon', () => {
  it('接受函数式图标组件且不产生类型警告', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mount(AppIcon, { props: { icon: FunctionalIcon, size: 20 } });

    expect(wrapper.find('[data-test="functional-icon"]').exists()).toBe(true);
    expect(wrapper.props('size')).toBe(20);
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('Invalid prop'));

    warn.mockRestore();
  });
});
