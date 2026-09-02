import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import BaseFormRow from '@/components/ui/BaseFormRow.vue';

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
        compacted: true,
      },
      slots: {
        label: '<span class="custom-label">自定义</span>',
        default: '<button>提交</button>',
      },
    });

    expect(wrapper.find('.custom-label').exists()).toBe(true);
    expect(wrapper.classes()).toContain('align-top');
    expect(wrapper.classes()).toContain('is-compacted');
  });

  it('通过插槽 props 透传 id、disabled 与 required', () => {
    const wrapper = mount(BaseFormRow, {
      props: {
        label: '必填项',
        required: true,
        disabled: true,
      },
      slots: {
        default:
          '<template #default="{ id, disabled, required }"><input :data-id="id" :data-disabled="String(disabled)" :data-required="String(required)" /></template>',
      },
    });

    const input = wrapper.find('input');
    expect(input.attributes('data-required')).toBe('true');
    expect(input.attributes('data-disabled')).toBe('true');
    expect(input.attributes('data-id')).toBeTruthy();
  });
});
