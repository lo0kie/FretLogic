/**
 * v-scrollbar 气泡「悬停显形」的回归锚点（`bubble.hoverReveal`，默认开）。
 *
 * 钉住四条契约 —— 每一条都对应一个「改错了不报错、只是观感或寿命不对」的形态：
 *  1. 悬停**所属轴**的轨道 / 拇指 → 气泡显形（两个元素都算，指针在两者间移动是成对 leave + enter）；
 *  2. 悬停**另一轴**的轨道 / 拇指 → 不显形（那一轴的读数并没有变，显形等于递出一份陈旧读数）；
 *  3. `hoverReveal: false` → 悬停不显形（退回「只在滚动时出现」）；
 *  4. 悬停期间**不计时**：指针还停在滚动条上时 hideDelay 到期也不收起，离开后才按 hideDelay 淡出；
 *  5. 未启用气泡时悬停路径是**空操作**（不建气泡、也不抛错）。
 *
 * 断言对象是可见类（scrollbarCore 的 `BUBBLE_VISIBLE_CLASS`）而不是 computed style：它是显隐状态机的
 * 输出，正是被测的那一层；且 jsdom 不加载 SCSS，样式本就量不到。几何定位（气泡落点随拇指）不在本文件
 * 覆盖 —— jsdom 的 getBoundingClientRect / scrollHeight 恒为 0，那一层归 browser 项目。
 */
import { defineComponent, h, withDirectives } from 'vue';

import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { vScrollbar } from '@/platform/directives/vScrollbar';

import type { ScrollbarOptions } from '@/platform/directives/vScrollbar';

/** 气泡可见类（与 scrollbarCore 的常量同名；改类名要同时改两处，同该文件顶部注释的口径） */
const BUBBLE_VISIBLE = 'v-scrollbar-bubble--visible';

/** 挂一个 v-scrollbar 宿主（默认无修饰符 → 双轴都建，气泡默认所属轴为 'y'） */
const mountScrollbar = (options: ScrollbarOptions) => {
  const wrapper = mount(defineComponent({ setup: () => () => withDirectives(h('div'), [[vScrollbar, options]]) }));
  const host = wrapper.element as HTMLElement;
  // overlay（轨道 / 拇指 / 气泡）挂在宿主父元素上，故一律从父元素里取
  const parent = host.parentElement!;
  return {
    wrapper,
    bubble: () => parent.querySelector<HTMLElement>('.v-scrollbar-bubble'),
    part: (name: 'track' | 'thumb', axis: 'x' | 'y') =>
      parent.querySelector<HTMLElement>(`.v-scrollbar-${name}--${axis}`)!,
  };
};

const hover = (el: HTMLElement, type: 'mouseenter' | 'mouseleave'): void => void el.dispatchEvent(new MouseEvent(type));

describe('v-scrollbar 气泡悬停显形', () => {
  it('悬停所属轴（y）的轨道与拇指都显形', () => {
    const { wrapper, bubble, part } = mountScrollbar({ bubble: { hideDelay: 500 } });
    expect(bubble()!.classList.contains(BUBBLE_VISIBLE)).toBe(false);

    hover(part('track', 'y'), 'mouseenter');
    expect(bubble()!.classList.contains(BUBBLE_VISIBLE)).toBe(true);

    // 轨道 → 拇指（两个兄弟元素，指针移动会成对地 leave + enter）：显形不该被打断
    hover(part('track', 'y'), 'mouseleave');
    hover(part('thumb', 'y'), 'mouseenter');
    expect(bubble()!.classList.contains(BUBBLE_VISIBLE)).toBe(true);

    wrapper.unmount();
  });

  it('悬停另一轴（x）的轨道与拇指都不显形', () => {
    const { wrapper, bubble, part } = mountScrollbar({ bubble: { hideDelay: 500 } });

    hover(part('track', 'x'), 'mouseenter');
    hover(part('thumb', 'x'), 'mouseenter');
    expect(bubble()!.classList.contains(BUBBLE_VISIBLE)).toBe(false);

    wrapper.unmount();
  });

  it('hoverReveal: false 时悬停不显形', () => {
    const { wrapper, bubble, part } = mountScrollbar({ bubble: { hoverReveal: false, hideDelay: 500 } });

    hover(part('track', 'y'), 'mouseenter');
    expect(bubble()!.classList.contains(BUBBLE_VISIBLE)).toBe(false);

    wrapper.unmount();
  });

  it('悬停期间不计时，离开后才按 hideDelay 淡出', () => {
    // 只接管 setTimeout：mount 里那两帧 requestAnimationFrame 补刷不参与本契约，留着按真实节奏跑
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      // 拇指常显（autoHide:false）：否则拇指的自动隐藏在默认 400ms 上先到，会按「气泡不活过滚动条」的
      // 上界把它一并收起（见 setThumbsVisible），这里要单独观察气泡自身的倒计时
      const { wrapper, bubble, part } = mountScrollbar({ autoHide: false, bubble: { hideDelay: 500 } });

      hover(part('track', 'y'), 'mouseenter');
      expect(bubble()!.classList.contains(BUBBLE_VISIBLE)).toBe(true);

      // 指针还停在轨道上：倒计时若照常跑，读数就会在指针底下先一步淡出
      vi.advanceTimersByTime(5000);
      expect(bubble()!.classList.contains(BUBBLE_VISIBLE)).toBe(true);

      hover(part('track', 'y'), 'mouseleave');
      vi.advanceTimersByTime(499);
      expect(bubble()!.classList.contains(BUBBLE_VISIBLE)).toBe(true);
      vi.advanceTimersByTime(1);
      expect(bubble()!.classList.contains(BUBBLE_VISIBLE)).toBe(false);

      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('未启用气泡时悬停路径是空操作', () => {
    const { wrapper, bubble, part } = mountScrollbar({});

    expect(bubble()).toBeNull();
    hover(part('track', 'y'), 'mouseenter');
    hover(part('thumb', 'y'), 'mouseenter');
    expect(bubble()).toBeNull();

    wrapper.unmount();
  });
});
