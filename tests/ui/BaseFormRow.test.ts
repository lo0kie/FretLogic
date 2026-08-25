import BaseFormRow from '@/components/BaseFormRow.vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

describe('BaseFormRow component', () => {
  it('renders label and control correctly', () => {
    const wrapper = mount(BaseFormRow, {
      props: {
        label: '测试标签',
      },
      slots: {
        default: '<input id="test-input" />',
      },
    });

    expect(wrapper.find('.form-row-label').text()).toBe('测试标签');
    expect(wrapper.find('#test-input').exists()).toBe(true);
    expect(wrapper.classes()).toContain('align-center');
  });

  it('supports custom label slot and labelWidth', () => {
    const wrapper = mount(BaseFormRow, {
      props: {
        labelWidth: '100px',
        align: 'top',
        compact: true,
      },
      slots: {
        label: '<span class="custom-label">自定义</span>',
        default: '<button>提交</button>',
      },
    });

    expect(wrapper.find('.custom-label').exists()).toBe(true);
    expect(wrapper.classes()).toContain('align-top');
    expect(wrapper.classes()).toContain('is-compact');
  });
});
