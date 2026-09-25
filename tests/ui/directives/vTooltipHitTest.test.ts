/**
 * 浮层「可命中性」的回归锚点 —— 隐藏后必须退出命中测试。
 *
 * 缺陷形态（2026-09-24 用户实测）：交互式 tooltip 视觉上已关闭，鼠标停在它原来的位置却点不动
 * 下面的东西。成因是两条各自成立的事实叠在一起：
 *
 *  1. 浮层是 `position: fixed` 的**单例**，隐藏后尺寸与位置仍停在上一个 tooltip 处；而
 *     `opacity: 0` **不参与命中测试**（只有 `visibility` / `display` / `pointer-events` 退出），
 *     交互式浮层的 `pointer-events: auto` 又只在显示时被打开、隐藏时从不重置。
 *  2. 于是它会**自锁**：指针被浮层接走 ⇒ 下层元素收不到 mouseenter ⇒ 新 tooltip 永不显示；
 *     而浮层自己的 mouseenter 又 `clearTimers()` 把「淡出后设 `visibility: hidden`」那道收尾
 *     一并清掉 ⇒ 该区域永久不可点，且没有任何东西能把它恢复。
 *
 * 修法即把「可命中性」与「可见性」成对维护：显示时按 `interactive` 打开，两条隐藏路径都显式关闭。
 * 本文件钉住的正是这条不变量，以及**它不得顺手毁掉交互式浮层的时间窗** —— 移出触发元素后的最小
 * 隐藏延迟内浮层仍须可命中，否则「从触发元素跨过间隙移入浮层」这条交互直接失效。
 *
 * 断言对象是**浮层根元素上的内联 `pointer-events`**（我们拥有的不变量），不是「点击能不能落到下层」
 * —— jsdom 不做命中测试，`dispatchEvent` 也完全不看 `pointer-events`，那件事只能在真实浏览器里看。
 */
import { h, withDirectives } from 'vue';

import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { vTooltip } from '@/platform/directives/vTooltip';
import { TOOLTIP_INTERACTIVE_MIN_HIDE_DELAY_MS } from '@/platform/utils/constants';

import type { TooltipBinding } from '@/platform/directives/vTooltip';
import type { VueWrapper } from '@vue/test-utils';

/** 单例浮层的根节点（只有它承载 `pointer-events`，内容是它的子节点、继承该值） */
const boxEl = () => document.querySelector<HTMLElement>('.v-tooltip-root');

/** 挂一个带 tooltip 的触发元素，返回该元素本身 */
const mountTrigger = (binding: TooltipBinding): HTMLElement => {
  const wrapper = mount({
    render: () => withDirectives(h('button', { 'data-test': 'trigger' }, '悬停'), [[vTooltip, binding]]),
  });
  wrappers.push(wrapper);
  return wrapper.get('[data-test="trigger"]').element as HTMLElement;
};

/** 浮层是模块级单例、跨用例存活，故只回收触发元素（unmount 会走立即隐藏那条路径收尾） */
const wrappers: VueWrapper[] = [];

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
});

const enter = (el: HTMLElement) => void el.dispatchEvent(new MouseEvent('mouseenter'));
const leave = (el: HTMLElement) => void el.dispatchEvent(new MouseEvent('mouseleave'));

/**
 * 等到「淡出已经开跑」：最小隐藏延迟之后、收尾的 `visibility: hidden` 之前。
 *
 * 用**真实墙钟**而不是假定时器：tooltip 的显隐是「定时器 + CSS 过渡」混用，假定时器推不动 CSS 过渡，
 * 断言会落在过渡尚未开始的中间态上、失去意义。代价是本函数依赖真实调度，`+80ms` 是留给收尾的余量；
 * 机器极慢时理论上仍可能踩到窗口边缘（要彻底消除这类时间依赖应改用真实浏览器断言）。
 */
const pastHideDelay = () => new Promise(resolve => setTimeout(resolve, TOOLTIP_INTERACTIVE_MIN_HIDE_DELAY_MS + 80));

describe('vTooltip 隐藏后退出命中测试', () => {
  it('交互式浮层：显示时可命中，移出后越过时间窗即穿透（淡出期间不接指针）', async () => {
    const el = mountTrigger({ content: '提示内容', interactive: true });

    enter(el);
    // 显示路径要等定位算完才显隐（先定位后显隐），故可命中性也落在那之后
    await vi.waitFor(() => expect(boxEl()?.style.pointerEvents).toBe('auto'));

    leave(el);
    // 移出瞬间仍在最小隐藏延迟窗口内：这段时间必须保持可命中，否则「移入浮层不收起」无从成立
    expect(boxEl()?.style.pointerEvents).toBe('auto');

    await pastHideDelay();
    // 淡出已开始，而 `visibility` 要到收尾定时器才设 —— 这中间靠 pointer-events 兜住
    expect(boxEl()?.style.pointerEvents).toBe('none');
  });

  it('非交互式浮层：显示时也不接指针', async () => {
    const el = mountTrigger('提示内容');

    enter(el);
    await vi.waitFor(() => expect(boxEl()?.style.opacity).toBe('1'));
    expect(boxEl()?.style.pointerEvents).toBe('none');
  });

  it('立即隐藏路径（失焦）：同样退出命中测试', async () => {
    const el = mountTrigger({ content: '提示内容', interactive: true });

    enter(el);
    await vi.waitFor(() => expect(boxEl()?.style.pointerEvents).toBe('auto'));

    // 键盘 Tab 离开触发元素走的是即时路径（关过渡、立刻 visibility:hidden）
    el.dispatchEvent(new Event('blur'));
    expect(boxEl()?.style.visibility).toBe('hidden');
    expect(boxEl()?.style.pointerEvents).toBe('none');
  });
});
