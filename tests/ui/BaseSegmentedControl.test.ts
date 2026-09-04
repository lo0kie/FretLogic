import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import BaseSegmentedControl from '@/platform/ui/segmented/BaseSegmentedControl.vue';

describe('BaseSegmentedControl component', () => {
  it('默认 compacted=false 应用常规宽松 padding 类名', () => {
    const wrapper = mount(BaseSegmentedControl, {
      props: {
        modelValue: 'a',
        options: [
          { label: '选项A', value: 'a' },
          { label: '选项B', value: 'b' },
        ],
        size: 'md',
      },
    });

    const items = wrapper.findAll('button.segmented-item');
    expect(items).toHaveLength(2);
    // md + non-compacted 默认应用 px-3
    expect(items[0]!.classes()).toContain('px-3');
  });

  it('compacted=true 时渲染紧凑 padding 类名', () => {
    const wrapper = mount(BaseSegmentedControl, {
      props: {
        modelValue: 'a',
        options: [
          { label: '选项A', value: 'a' },
          { label: '选项B', value: 'b' },
        ],
        size: 'md',
        compacted: true,
      },
    });

    const items = wrapper.findAll('button.segmented-item');
    expect(items).toHaveLength(2);
    // md + compacted 应用 px-1.5
    expect(items[0]!.attributes('class')).toContain('px-1.5');
  });

  it('点击选项触发 modelValue 更新与 change 事件', async () => {
    const wrapper = mount(BaseSegmentedControl, {
      props: {
        'modelValue': 'a',
        'onUpdate:modelValue': (val: string) => wrapper.setProps({ modelValue: val }),
        'options': [
          { label: '选项A', value: 'a' },
          { label: '选项B', value: 'b' },
        ],
      },
    });

    const items = wrapper.findAll('button.segmented-item');
    await items[1]!.trigger('click');

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['b']);
    expect(wrapper.emitted('change')?.[0]).toEqual(['b']);
  });
});
