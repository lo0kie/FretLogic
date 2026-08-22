import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AppTabs from '@/core/components/AppTabs.vue';

const tabs = [
  { label: '工作台', value: 'workbench' },
  { label: '谱面', value: 'score' },
];

describe('AppTabs', () => {
  it('渲染标签并高亮激活项', () => {
    const wrapper = mount(AppTabs, { props: { modelValue: 'score', tabs } });
    const items = wrapper.findAll('.app-tabs-item');
    expect(items).toHaveLength(2);
    expect(items[1].classes()).toContain('is-active');
    expect(items[1].attributes('aria-selected')).toBe('true');
  });

  it('点击非激活标签触发 update:modelValue', async () => {
    const wrapper = mount(AppTabs, { props: { modelValue: 'score', tabs } });
    await wrapper.findAll('.app-tabs-item')[0].trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([['workbench']]);
  });

  it('禁用标签不可点击', async () => {
    const disabledTabs = [{ label: '锁定', value: 'lock', disabled: true }];
    const wrapper = mount(AppTabs, { props: { modelValue: 'x', tabs: disabledTabs } });
    await wrapper.find('.app-tabs-item').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
});
