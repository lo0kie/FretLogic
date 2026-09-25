/**
 * 「按钮把自身置为 disabled、被浏览器夺焦收起提示 → 重新可用时补显示」的回归锚点（2026-09-25 用户实测）。
 *
 * 缺陷形态：顶栏「复制乐谱文字 / 粘贴乐谱 / 复制整曲长图」这类按钮，点下去当刻就把自己置成
 * `disabled`（防重入锁 `uiStore.isCopying`、预览渲染态）。浏览器会**夺焦并派发 blur**（实测
 * Chromium：`disabled = true` 当刻 `activeElement` 即退回 body），指令的 `onBlur` 于是收起提示；
 * 而这次收起**不可自愈** —— 指针没动过，`mouseenter` 不会再触发，禁用控件上又收不到 `mouseleave`
 * （实测：指针从禁用按钮上移开时 `mouseleave` / `mouseout` 一个都不派发），提示一去不返。
 * 凡「点击即自我禁用、loading 结束后自动恢复」的按钮都落在同一形态里，与本文件无关的只是文案。
 *
 * 修法：`onBlur` 记下「这次是被自身禁用夺焦」，`updated` 里发现按钮重新可用且指针仍停在宿主上时
 * 补一次显示。本文件钉住这条链路的两个关键接点：
 *
 *  1. 指令挂在**组件**上也要收到 `updated` —— Vue 把组件 vnode 的 dirs 继承到根元素 vnode、
 *     再由 patchElement 的 post-render effect 派发（见 `renderComponentRoot`），这是补显示唯一的
 *     触发通路。故用例里的 `BusyButton` 刻意复刻真实形态：指令在组件上、根节点是带原生 disabled 的
 *     `<button>`（即 ActionButton 的形态），而不是把指令直接挂在裸元素上。
 *  2. 补显示的判据必须**同时**要求「被禁用夺焦过」与「指针仍在宿主上」：前者防止正常失焦后一有
 *     重渲染就把提示弹出来，后者防止指针已经离开时凭空冒出提示。
 *
 * 断言对象是浮层根元素的 `visibility`（我们拥有的不变量）。`matches(':hover')` 在本文件里被桩成
 * 「由用例给出的答案」：jsdom 不做命中测试、该选择器恒返回 false，那件事只能在真实浏览器里看
 * （已实测：禁用态下 `:hover` 依旧如实跟随指针，在按钮上为 true、移开后为 false）。
 */
import { defineComponent, h, nextTick, ref, withDirectives } from 'vue';

import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { vTooltip } from '@/platform/directives/vTooltip';

import type { VueWrapper } from '@vue/test-utils';

/** 单例浮层的根节点 */
const boxEl = () => document.querySelector<HTMLElement>('.v-tooltip-root');

/** 浮层是模块级单例、跨用例存活，故只回收触发元素（unmount 会走立即隐藏那条路径收尾） */
const wrappers: VueWrapper[] = [];

/** 用例给出的「指针是否仍在宿主上」——`:hover` 的桩答案，默认 false（挂载期的初始检查必须看到它） */
let pointerOnHost = false;

/** 原生 matches 的包装：避免直接引用未绑定的原型方法，同时让非 `:hover` 的选择器照常走原生实现 */
const nativeMatches = (el: Element, selector: string): boolean => Element.prototype.matches.call(el, selector);

beforeEach(() => {
  pointerOnHost = false;
  vi.spyOn(HTMLElement.prototype, 'matches').mockImplementation(function (this: HTMLElement, selector: string) {
    return selector === ':hover' ? pointerOnHost : nativeMatches(this, selector);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
});

/**
 * 复刻真实消费方形态：指令挂在**组件**上，组件根节点是带原生 disabled 的 `<button>`。
 * `label` 用于制造一次「与禁用无关」的重渲染，验证 `updated` 跑过并不等于就该补显示。
 */
const BusyButton = defineComponent({
  props: {
    busy: { type: Boolean, default: false },
    label: { type: String, default: '动作' },
  },
  setup: props => () => h('button', { disabled: props.busy }, props.label),
});

const mountBusyButton = () => {
  const busy = ref(false);
  const label = ref('动作');
  // 外层宿主写成**普通组件对象**而不是 defineComponent：本文件需要两层组件（指令必须落在
  // BusyButton 这个组件 vnode 上，「把 dirs 继承到根元素」这条通路才成立），而
  // vue/one-component-per-file 只认 defineComponent 调用。
  const wrapper = mount({
    setup: () => () =>
      withDirectives(h(BusyButton, { busy: busy.value, label: label.value }), [[vTooltip, '提示内容']]),
  });
  wrappers.push(wrapper);
  const el = wrapper.get('button').element as HTMLButtonElement;
  /** 模拟浏览器「置为 disabled 当刻夺焦」：jsdom 不实现该行为，只能手动补一次失焦 */
  const blurByDisable = () => void el.dispatchEvent(new FocusEvent('blur'));
  return { el, busy, label, blurByDisable };
};

const enter = (el: HTMLElement) => void el.dispatchEvent(new MouseEvent('mouseenter'));
const waitShown = () => vi.waitFor(() => expect(boxEl()?.style.opacity).toBe('1'));

describe('vTooltip 按钮自我禁用后的补显示', () => {
  it('禁用夺焦收起后，重新可用且指针未动 → 补显示', async () => {
    const { el, busy, blurByDisable } = mountBusyButton();
    pointerOnHost = true;
    enter(el);
    await waitShown();

    busy.value = true;
    await nextTick();
    blurByDisable();
    await nextTick();
    expect(boxEl()?.style.visibility).toBe('hidden');

    // 禁用期间没有任何鼠标事件，指针位置只能靠 :hover 问 —— 指针没动，提示该回来
    busy.value = false;
    await nextTick();
    await waitShown();
  });

  it('禁用后重新可用但指针已离开 → 不凭空冒出', async () => {
    const { el, busy, blurByDisable } = mountBusyButton();
    pointerOnHost = true;
    enter(el);
    await waitShown();

    busy.value = true;
    await nextTick();
    blurByDisable();
    await nextTick();
    expect(boxEl()?.style.visibility).toBe('hidden');

    pointerOnHost = false;
    busy.value = false;
    await nextTick();
    expect(boxEl()?.style.visibility).toBe('hidden');
  });

  it('按钮未被禁用时的失焦不进入补显示通道', async () => {
    const { el, label } = mountBusyButton();
    pointerOnHost = true;
    enter(el);
    await waitShown();

    // 未被禁用（用户 Tab 走焦 / 点了别处）：不该被记成「被状态夺焦」
    el.dispatchEvent(new FocusEvent('blur'));
    await nextTick();
    expect(boxEl()?.style.visibility).toBe('hidden');

    // 制造一次真实重渲染（updated 确实跑过）：指针仍在宿主上，但仍不该补显示
    label.value = '动作二';
    await nextTick();
    expect(boxEl()?.style.visibility).toBe('hidden');
  });
});
