/**
 * 折叠段的「标题 → 面板」关联（WAI-ARIA accordion 惯例）回归锚点。
 *
 * 缺口形态：头部按钮只有 `aria-expanded`，折叠体自身没有任何可被指向的 id —— 读屏用户知道这个标题
 * 能开合，却没有可跳转的目标（`aria-controls` 恒空）。这两条在 accordion 惯例里是一对，缺一半等于
 * 「能开，但不知道开的是哪一块」。
 *
 * 这里钉的就是那条引用**真的解析得到**：`aria-controls` 非空、且 DOM 里存在同 id 的元素、展开态与
 * `aria-expanded` 一致。
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import BaseCollapse from '@/platform/ui/collapse/BaseCollapse.vue';

const mountCollapse = (expanded: boolean) =>
  mount(BaseCollapse, { props: { expanded, title: '分组' }, slots: { default: '内容' } });

describe('折叠段的标题 → 面板关联', () => {
  it('aria-controls 解析得到折叠体，且随展开态翻转', async () => {
    const wrapper = mountCollapse(false);
    const head = wrapper.get('[data-collapse-head]');

    const controls = head.attributes('aria-controls');
    expect(controls, '头部按钮必须给出面板引用').toBeTruthy();

    const body = wrapper.get(`#${controls}`);
    expect(body.text()).toContain('内容');
    expect(head.attributes('aria-expanded')).toBe('false');
    expect(body.attributes('aria-hidden')).toBe('true');

    await wrapper.setProps({ expanded: true });

    expect(head.attributes('aria-expanded')).toBe('true');
    expect(wrapper.get(`#${controls}`).attributes('aria-hidden')).toBeUndefined();
  });
});
