/**
 * 「滚动即收起」作用域的回归锚点 —— 只有会把锚点从指针底下带走的滚动才该收起提示。
 *
 * 缺陷形态（2026-09-25 用户实测）：滚动侧栏列表会把顶栏按钮上正悬停着的提示一并关掉；程序化滚动
 * （卡片自动定位、滚动位置贴回、折叠补偿）也会顺手关掉别处正在悬停的提示。成因是 window 捕获期的
 * scroll 监听**无条件**隐藏当前提示 —— 判据里根本没有「这次滚动与锚点有没有关系」这一维。
 *
 * 这类误伤还**不可自愈**：收起后指针并未离开触发元素，`mouseenter` 不会再触发，提示一去不返，
 * 必须把鼠标移开再移回才能重新唤起 —— 正是「滚动一下提示就没了」的观感。
 *
 * 断言对象是浮层根元素的 `visibility`（我们拥有的不变量），不测「指针是否还落在元素上」：
 * jsdom 不做命中测试，那件事只能在真实浏览器里看。
 */
import { h, withDirectives } from 'vue';

import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { vTooltip } from '@/platform/directives/vTooltip';

import type { VueWrapper } from '@vue/test-utils';

/** 单例浮层的根节点 */
const boxEl = () => document.querySelector<HTMLElement>('.v-tooltip-root');

/** 浮层是模块级单例、跨用例存活，故只回收触发元素与自建的宿主容器 */
const wrappers: VueWrapper[] = [];
const hosts: HTMLElement[] = [];

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
  hosts.splice(0).forEach(host => host.remove());
});

/** 造一个挂在文档里的容器（作为「锚点的祖先滚动容器」或「无关容器」） */
const createHost = (): HTMLElement => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  hosts.push(host);
  return host;
};

/** 挂一个带 tooltip 的触发元素；给了 host 就把它挪进该容器，使其成为锚点的祖先 */
const mountTrigger = (host?: HTMLElement): HTMLElement => {
  const wrapper = mount({
    render: () => withDirectives(h('button', { 'data-test': 'trigger' }, '悬停'), [[vTooltip, '提示内容']]),
  });
  wrappers.push(wrapper);
  const el = wrapper.get('[data-test="trigger"]').element as HTMLElement;
  if (host) host.appendChild(el);
  return el;
};

const enter = (el: HTMLElement) => void el.dispatchEvent(new MouseEvent('mouseenter'));

/** 显示路径要等定位算完才显隐（先定位后显隐），故断言前先等浮层真的可见 */
const waitShown = () => vi.waitFor(() => expect(boxEl()?.style.opacity).toBe('1'));

describe('vTooltip 滚动收起的作用域', () => {
  it('与锚点无关的容器滚动不收起提示', async () => {
    const unrelated = createHost();
    const el = mountTrigger();
    enter(el);
    await waitShown();

    unrelated.dispatchEvent(new Event('scroll'));

    // 滚动源既不是锚点自身也不是它的祖先：锚点在视口里没动，提示该留在原处
    expect(boxEl()?.style.visibility).toBe('visible');
  });

  it('锚点所在容器滚动仍立即收起提示', async () => {
    const scroller = createHost();
    const el = mountTrigger(scroller);
    enter(el);
    await waitShown();

    scroller.dispatchEvent(new Event('scroll'));

    // 祖先滚动会把锚点带离指针（指针底下已换成别的内容），此时立即收起才是对的
    expect(boxEl()?.style.visibility).toBe('hidden');
  });
});
