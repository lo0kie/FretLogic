import BaseSelector from '@/components/base/BaseSelector.vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { markRaw } from 'vue';

describe('BaseSelector 键盘可达性', () => {
  it('清空按钮可聚焦且回车触发 clear', async () => {
    const wrapper = mount(BaseSelector, {
      props: { options: ['a', 'b'], modelValue: 'a', clearable: true },
    });
    const clear = wrapper.find('[aria-label="清空选择"]');
    expect(clear.exists()).toBe(true);
    expect(clear.attributes('tabindex')).toBe('0');
    expect(clear.attributes('role')).toBe('button');

    await clear.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('clear')).toBeTruthy();
    expect(wrapper.emitted('update:modelValue')).toBeTruthy();
  });

  it('多选模式下移除 Tag 按钮可聚焦且回车触发 removeTag', async () => {
    const wrapper = mount(BaseSelector, {
      props: { options: ['a', 'b'], modelValue: ['a', 'b'], multiple: true },
    });
    const remove = wrapper.find('[aria-label="移除选项"]');
    expect(remove.exists()).toBe(true);
    expect(remove.attributes('tabindex')).toBe('0');
    expect(remove.attributes('role')).toBe('button');

    await remove.trigger('keydown', { key: 'Enter' });
    const tags = wrapper.emitted('removeTag');
    expect(tags).toBeTruthy();
    expect(tags![0]).toEqual(['a', 'a']);
  });

  it('支持传入并渲染选项 icon', async () => {
    const DummyIcon = markRaw({
      template: '<svg data-test="dummy-icon"></svg>',
    });
    const wrapper = mount(BaseSelector, {
      props: {
        options: [
          { label: 'Opt 1', value: '1', icon: DummyIcon },
          { label: 'Opt 2', value: '2' },
        ],
        modelValue: '1',
      },
    });

    const triggerIcon = wrapper.find('[data-test="dummy-icon"]');
    expect(triggerIcon.exists()).toBe(true);
  });
});
