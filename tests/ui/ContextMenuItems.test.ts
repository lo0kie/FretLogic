import ContextMenuItems, { type ContextMenuItem } from '@/components/context-menu/ContextMenuItems.vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

const buildItems = (): ContextMenuItem[] => [
  { label: '可用项', action: () => {} },
  { label: '禁用项', disabled: true, action: () => {} },
];

describe('ContextMenuItems component', () => {
  it('禁用项应渲染原生 disabled 属性，使 disabled: 样式变体生效', () => {
    const wrapper = mount(ContextMenuItems, { props: { items: buildItems() } });

    const buttons = wrapper.findAll('button');
    expect(buttons).toHaveLength(2);
    expect((buttons[0].element as HTMLButtonElement).disabled).toBe(false);
    expect((buttons[1].element as HTMLButtonElement).disabled).toBe(true);
  });

  it('focusFirstItem 应跳过禁用项，聚焦首个可用项', () => {
    const items: ContextMenuItem[] = [{ label: '禁用项', disabled: true }, { label: '可用项' }];
    const wrapper = mount(ContextMenuItems, { props: { items }, attachTo: document.body });

    wrapper.vm.focusFirstItem();

    const focused = document.activeElement as HTMLButtonElement | null;
    expect(focused?.textContent?.trim()).toBe('可用项');
    wrapper.unmount();
  });

  it('点击禁用项不应派发 select', async () => {
    const wrapper = mount(ContextMenuItems, { props: { items: buildItems() } });

    await wrapper.findAll('button')[1].trigger('click');

    expect(wrapper.emitted('select')).toBeFalsy();
  });

  it('禁用项需参与命中测试以显示禁用光标，且 hover 背景限定为 enabled', () => {
    const wrapper = mount(ContextMenuItems, { props: { items: buildItems() } });

    const classes = wrapper.findAll('button')[1].classes();
    // pointer-events-none 会让元素退出命中测试，导致 cursor-not-allowed 失效
    expect(classes).toContain('disabled:cursor-not-allowed');
    expect(classes).not.toContain('disabled:pointer-events-none');
    expect(classes).toContain('enabled:hover:bg-(--item-hover-bg,var(--bg-panel-hover))');
  });
});
