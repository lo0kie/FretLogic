/**
 * ActionButton 的 holdable 状态机 —— 「松手后补发的那次 pointerleave 不得吞掉轻点」的回归锚点。
 *
 * 缺口成因：状态机把「指针离开按钮」一律当作**取消**（按下后滑出去再松手 ⇒ 本次按压作废、并抑制
 * 随后可能派发的 click）。这在鼠标端成立，因为鼠标松开时指针就停在原地，`pointerup` 之后不会再有
 * `pointerleave`。**触摸端不成立**：触点抬起时浏览器释放触摸的**隐式指针捕获**、且触点本身已消失，
 * 于是补发一次 `pointerout` / `pointerleave` —— Chromium 触摸模拟实测的事件序为
 *
 *     pointerdown → pointerup → pointerout → pointerleave → click
 *
 * （鼠标端对照：`pointerdown → pointerup → click`，没有松手后的那一对 out/leave）。
 * 那一次离开并不代表「按住时滑出了按钮」，按取消处理就会把紧随其后的 click 一并吞掉：表现为
 * **手机上点按钮毫无反应**（顶栏「试听当前和弦」是全仓唯一的 holdable 按钮，故症状只落在它身上），
 * 而同一份代码在桌面鼠标下完全正常 —— 这正是本文件要钉住的那条分叉。
 *
 * 另一半同样要钉住：**真正的**「按住时滑出」（鼠标端 `pointerdown` 之后、`pointerup` 之前来的
 * `pointerleave`）必须继续按取消处理，否则按下后拖出按钮再松手也会触发一次动作。修法不是去掉取消，
 * 而是给「本次按压是否仍在进行中」单独记账（`isPressActive`），据此区分这两类 leave。
 *
 * jsdom 未实现 PointerEvent，故自带最小垫片（只补 pointerId / pointerType / isPrimary 三个被读到的字段）。
 */
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ActionButton from '@/platform/ui/button/ActionButton.vue';

import type { VueWrapper } from '@vue/test-utils';

class MockPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly isPrimary: boolean;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
    this.pointerType = init.pointerType ?? '';
    this.isPrimary = init.isPrimary ?? true;
  }
}

/** 挂一枚 holdable 按钮（形态对齐顶栏那枚：纯图标 + 长按持续态） */
const mountHoldable = (holdDelay = 300): VueWrapper =>
  mount(ActionButton, {
    props: { holdable: true, holdDelay: holdDelay, icon: 'play', iconOnly: true, ariaLabel: '播放' },
  });

/** 往按钮上派发一个指针事件（默认主键、主指针，触摸与鼠标只差 pointerType） */
const firePointer = (wrapper: VueWrapper, type: string, pointerType: 'mouse' | 'touch' = 'mouse') =>
  void wrapper
    .find('button')
    .element.dispatchEvent(
      new MockPointerEvent(type, { bubbles: true, button: 0, pointerId: 1, pointerType, isPrimary: true })
    );

/** 浏览器在松开后派发原生 click（我们只关心按钮自己那一次 handleInternalClick）。
 *
 *  `detail: 1` 是必须的：真实**指针**点击的 `detail` ≥ 1，而键盘激活（Enter/Space 打在聚焦按钮上）
 *  恒为 0 —— 组件正是靠这一位把「手势的次生 click」与「键盘激活」分开（见 handleInternalClick 的
 *  说明：无差别吞一次会让取消手势残留的标志吞掉下一次键盘激活）。
 *  VTU 的 `trigger('click')` 默认 `detail` 为 0，等价于键盘点击，会让本文件的用例测错对象。 */
const fireClick = (wrapper: VueWrapper) =>
  void wrapper.find('button').element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));

afterEach(() => {
  vi.useRealTimers();
});

describe('ActionButton holdable：轻点必须派发 click', () => {
  it('触摸端轻点：pointerup 之后补发的 pointerout / pointerleave 不得吞掉 click', () => {
    const wrapper = mountHoldable();

    // 触摸端真实事件序（Chromium 触摸模拟实测）
    firePointer(wrapper, 'pointerdown', 'touch');
    firePointer(wrapper, 'pointerup', 'touch');
    firePointer(wrapper, 'pointerout', 'touch');
    firePointer(wrapper, 'pointerleave', 'touch');
    fireClick(wrapper);

    expect(wrapper.emitted('click')).toHaveLength(1);
    expect(wrapper.emitted('hold-start')).toBeUndefined();
  });

  it('鼠标端轻点：pointerup 之后不补 leave，同样派发 click（对照，保证没被 holdable 反噬）', () => {
    const wrapper = mountHoldable();

    firePointer(wrapper, 'pointerdown');
    firePointer(wrapper, 'pointerup');
    fireClick(wrapper);

    expect(wrapper.emitted('click')).toHaveLength(1);
  });

  it('触摸端连点两次：两次都派发 click（抑制标志不得跨按压残留）', () => {
    const wrapper = mountHoldable();

    for (let i = 0; i < 2; i += 1) {
      firePointer(wrapper, 'pointerdown', 'touch');
      firePointer(wrapper, 'pointerup', 'touch');
      firePointer(wrapper, 'pointerout', 'touch');
      firePointer(wrapper, 'pointerleave', 'touch');
      fireClick(wrapper);
    }

    expect(wrapper.emitted('click')).toHaveLength(2);
  });
});

describe('ActionButton holdable：长按持续态', () => {
  it('按住超过阈值进入持续态，松手派发 hold-end 并吞掉次生 click', () => {
    vi.useFakeTimers();
    const wrapper = mountHoldable();

    firePointer(wrapper, 'pointerdown', 'touch');
    vi.advanceTimersByTime(300);
    expect(wrapper.emitted('hold-start')).toHaveLength(1);
    // 未松手前不得有 hold-end
    expect(wrapper.emitted('hold-end')).toBeUndefined();

    firePointer(wrapper, 'pointerup', 'touch');
    expect(wrapper.emitted('hold-end')).toHaveLength(1);

    // 触摸端松手后仍会补发 out / leave，再派发原生 click —— 这一次必须被吞掉，
    // 否则「持续发声结束后又扫一次弦」
    firePointer(wrapper, 'pointerout', 'touch');
    firePointer(wrapper, 'pointerleave', 'touch');
    fireClick(wrapper);

    expect(wrapper.emitted('click')).toBeUndefined();
  });

  it('未到阈值就松手：不进入持续态，click 照常派发', () => {
    vi.useFakeTimers();
    const wrapper = mountHoldable();

    firePointer(wrapper, 'pointerdown', 'touch');
    vi.advanceTimersByTime(299);
    firePointer(wrapper, 'pointerup', 'touch');
    vi.advanceTimersByTime(1000);
    fireClick(wrapper);

    expect(wrapper.emitted('hold-start')).toBeUndefined();
    expect(wrapper.emitted('click')).toHaveLength(1);
  });
});

describe('ActionButton holdable：真取消仍须作废本次按压', () => {
  it('鼠标端按住后滑出按钮再松手（leave 发生在 pointerup 之前）：不派发 click', () => {
    const wrapper = mountHoldable();

    firePointer(wrapper, 'pointerdown');
    firePointer(wrapper, 'pointerleave');
    fireClick(wrapper);

    expect(wrapper.emitted('click')).toBeUndefined();
  });

  it('指针被系统取消（pointercancel，如手势被滚动接管）：不派发 click', () => {
    const wrapper = mountHoldable();

    firePointer(wrapper, 'pointerdown', 'touch');
    firePointer(wrapper, 'pointercancel', 'touch');
    fireClick(wrapper);

    expect(wrapper.emitted('click')).toBeUndefined();
  });
});
