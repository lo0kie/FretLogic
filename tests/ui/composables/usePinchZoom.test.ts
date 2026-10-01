// @vitest-environment jsdom
import { defineComponent, ref } from 'vue';

import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import { ARRANGE_VIEW_MIN_PINCH_SPAN_PX } from '@/domains/score/constants';
import { usePinchZoom } from '@/domains/score/editor/composables/usePinchZoom';

import type { Ref } from 'vue';

/**
 * 捏合会话的**基准间距**守卫：`touchstart` 那条路本来就有 `minPinchSpan` 门槛，而「换指重开」那条
 * （`touchmove` 里发现两指 identifier 变了）曾经没有 —— 两指几乎并拢时重开会把基准定成 ~0，下一发
 * move 的比值随即爆掉（`span/0` → Infinity，同点则 `0/0` → NaN 直进调用方）。
 *
 * jsdom 没有 TouchEvent：链路只读 `touches` 的点位与 identifier，故直接造一个带 `touches` 的普通
 * 事件即可（`preventDefault` 需要事件可取消，故 `cancelable: true`）。
 */
const touchEvent = (type: string, points: Array<[number, number, number]>): Event => {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, 'touches', {
    value: points.map(([identifier, clientX, clientY]) => ({ identifier, clientX, clientY })),
  });
  return event;
};

/** 落点按帧合帧（见 usePinchZoom 的 scheduleValue）：不跨帧看不到写入 */
const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

const mountPinch = () => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const values: number[] = [];
  const wrapper = mount(
    defineComponent({
      setup() {
        const target: Ref<HTMLElement | null> = ref(el);
        usePinchZoom(target, {
          min: 50,
          max: 200,
          // 真实调用方（useViewZoomSettle）传的就是这个值，不另写一份字面量
          minPinchSpan: ARRANGE_VIEW_MIN_PINCH_SPAN_PX,
          wheelSensitivity: 0.15,
          getValue: () => values.at(-1) ?? 100,
          setValue: value => values.push(value),
        });
      },
      render: () => null,
    })
  );
  return { wrapper, el, values };
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('usePinchZoom 换指重开的基准守卫', () => {
  it('换上的两指几乎并拢时不重开基准：既不产生跳档读数，也不把 NaN 写进调用方', async () => {
    const { wrapper, el, values } = mountPinch();

    // 正常起手：两指相距 100px
    el.dispatchEvent(
      touchEvent('touchstart', [
        [1, 0, 0],
        [2, 100, 0],
      ])
    );

    // 换成另一对**几乎同点**的手指（间距 0 < minPinchSpan）：此处若照旧重开基准，下一发 move 的
    // 比值就是 100/0 = Infinity（读数顶到上限）或 0/0 = NaN
    el.dispatchEvent(
      touchEvent('touchmove', [
        [3, 0, 0],
        [4, 0, 0],
      ])
    );
    await nextFrame();
    expect(values).toEqual([]);

    // 间距张开：这一发重开基准（比值为 1，不产生读数）
    el.dispatchEvent(
      touchEvent('touchmove', [
        [3, 0, 0],
        [4, 100, 0],
      ])
    );
    await nextFrame();
    expect(values).toEqual([]);

    // 之后照常按新基准缩放：150/100 = 1.5
    el.dispatchEvent(
      touchEvent('touchmove', [
        [3, 0, 0],
        [4, 150, 0],
      ])
    );
    await nextFrame();
    expect(values).toEqual([150]);

    wrapper.unmount();
  });

  it('正对照：换上的两指间距够大时照旧重开基准，读数不沿用旧基准', async () => {
    const { wrapper, el, values } = mountPinch();

    // 起手两指相距 100px，基准读数 100
    el.dispatchEvent(
      touchEvent('touchstart', [
        [1, 0, 0],
        [2, 100, 0],
      ])
    );

    // 换上间距 80px 的另一对：重开基准（比值为 1，不产生读数）
    el.dispatchEvent(
      touchEvent('touchmove', [
        [3, 0, 0],
        [4, 80, 0],
      ])
    );
    await nextFrame();
    expect(values).toEqual([]);

    // 按新基准缩放：160/80 = 2 → 夹到上限 200（若沿用旧基准 100，这里会是 160）
    el.dispatchEvent(
      touchEvent('touchmove', [
        [3, 0, 0],
        [4, 160, 0],
      ])
    );
    await nextFrame();
    expect(values).toEqual([200]);

    wrapper.unmount();
  });
});
