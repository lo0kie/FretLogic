import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import BaseSegmentedControl from '@/platform/ui/segmented/BaseSegmentedControl.vue';

const globalStubs = {
  directives: {
    wave: {},
  },
};

describe('BaseSegmentedControl.vue 整体禁用行为', () => {
  const options = [
    { label: '编辑歌词', value: 'edit' },
    { label: '排列和弦', value: 'interactive' },
    { label: '预览', value: 'preview' },
  ];

  it('启用状态下展示滑块与激活样式', () => {
    const wrapper = mount(BaseSegmentedControl, {
      global: globalStubs,
      props: {
        modelValue: 'edit',
        options,
        disabled: false,
      },
    });

    // 存在滑块
    expect(wrapper.find('.segmented-slider').exists()).toBe(true);

    // 第一个按钮有激活样式 text-primary!
    const buttons = wrapper.findAll('button.segmented-item');
    expect(buttons[0]!.classes().some(c => c.includes('text-primary'))).toBe(true);
  });

  it('整体禁用时（disabled: true），不展示滑块且按钮不包含激活样式', async () => {
    const wrapper = mount(BaseSegmentedControl, {
      global: globalStubs,
      props: {
        modelValue: 'edit',
        options,
        disabled: true,
      },
    });

    // 不展示滑块
    expect(wrapper.find('.segmented-slider').exists()).toBe(false);

    // 全部按钮均无激活样式
    const buttons = wrapper.findAll('button.segmented-item');
    for (const btn of buttons) {
      expect(btn.classes().some(c => c.includes('text-primary'))).toBe(false);
      expect(btn.attributes('disabled')).toBeDefined();
    }
  });

  it('动态切换 disabled 由 true 变为 false 时，恢复滑块与激活样式', async () => {
    const wrapper = mount(BaseSegmentedControl, {
      global: globalStubs,
      props: {
        modelValue: 'interactive',
        options,
        disabled: true,
      },
    });

    expect(wrapper.find('.segmented-slider').exists()).toBe(false);

    await wrapper.setProps({ disabled: false });

    expect(wrapper.find('.segmented-slider').exists()).toBe(true);
    const buttons = wrapper.findAll('button.segmented-item');
    expect(buttons[1]!.classes().some(c => c.includes('text-primary'))).toBe(true);
  });
});

describe('BaseSegmentedControl.vue 图标开箱即用支持', () => {
  it('选项配置 icon 时自动渲染 BaseIcon 并保留文字', () => {
    const wrapper = mount(BaseSegmentedControl, {
      global: globalStubs,
      props: {
        modelValue: 'chord',
        options: [
          { label: '和弦', value: 'chord', icon: 'grid' },
          { label: '乐谱', value: 'score' },
        ],
      },
    });

    const buttons = wrapper.findAll('button.segmented-item');
    const firstIcon = buttons[0]!.findComponent({ name: 'BaseIcon' });
    expect(firstIcon.exists()).toBe(true);
    expect(firstIcon.props('name')).toBe('grid');
    expect(buttons[0]!.find('.segmented-item-label').text()).toBe('和弦');

    const secondIcon = buttons[1]!.findComponent({ name: 'BaseIcon' });
    expect(secondIcon.exists()).toBe(false);
    expect(buttons[1]!.find('.segmented-item-label').text()).toBe('乐谱');
  });

  it('启用 iconOnly 时隐藏文本并为按钮赋予 aria-label', () => {
    const wrapper = mount(BaseSegmentedControl, {
      global: globalStubs,
      props: {
        modelValue: 'chord',
        iconOnly: true,
        options: [
          { label: '和弦', value: 'chord', icon: 'grid' },
          { label: '乐谱', value: 'score', icon: 'music' },
        ],
      },
    });

    const buttons = wrapper.findAll('button.segmented-item');
    expect(buttons[0]!.find('.segmented-item-label').exists()).toBe(false);
    expect(buttons[0]!.attributes('aria-label')).toBe('和弦');
    expect(buttons[1]!.find('.segmented-item-label').exists()).toBe(false);
    expect(buttons[1]!.attributes('aria-label')).toBe('乐谱');
  });
});
