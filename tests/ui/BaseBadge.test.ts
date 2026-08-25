import BaseBadge from '@/components/BaseBadge.vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

describe('BaseBadge component', () => {
  it('renders content correctly', () => {
    const wrapper = mount(BaseBadge, {
      props: {
        content: 42,
        variant: 'primary',
      },
    });

    expect(wrapper.text()).toContain('42');
    expect(wrapper.classes()).toContain('variant-primary');
  });

  it('supports hover-close prop with swap icon', () => {
    const wrapper = mount(BaseBadge, {
      props: {
        content: 1,
        hoverClose: true,
        width: '1.5rem',
      },
    });

    expect(wrapper.classes()).toContain('is-interactive');
    expect(wrapper.classes()).toContain('has-custom-width');
    expect(wrapper.find('.is-hover-close').exists()).toBe(true);
    expect(wrapper.find('.badge-hover-close-icon').exists()).toBe(true);
    expect(wrapper.text()).toContain('1');
  });
});
