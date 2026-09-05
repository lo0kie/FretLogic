import { defineComponent, h, nextTick, ref } from 'vue';

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import { useScrollEdgeFades } from '@/platform/composables/useScrollEdgeFades';

describe('useScrollEdgeFades', () => {
  const createMockScrollElement = (
    overrides: {
      scrollTop?: number;
      clientHeight?: number;
      scrollHeight?: number;
      scrollLeft?: number;
      clientWidth?: number;
      scrollWidth?: number;
    } = {}
  ) => {
    const el = document.createElement('div');
    let scrollTop = overrides.scrollTop ?? 0;
    let clientHeight = overrides.clientHeight ?? 300;
    let scrollHeight = overrides.scrollHeight ?? 1000;
    let scrollLeft = overrides.scrollLeft ?? 0;
    let clientWidth = overrides.clientWidth ?? 300;
    let scrollWidth = overrides.scrollWidth ?? 1000;

    Object.defineProperty(el, 'scrollTop', {
      get: () => scrollTop,
      set: (v: number) => {
        scrollTop = v;
      },
      configurable: true,
    });
    Object.defineProperty(el, 'clientHeight', {
      get: () => clientHeight,
      set: (v: number) => {
        clientHeight = v;
      },
      configurable: true,
    });
    Object.defineProperty(el, 'scrollHeight', {
      get: () => scrollHeight,
      set: (v: number) => {
        scrollHeight = v;
      },
      configurable: true,
    });
    Object.defineProperty(el, 'scrollLeft', {
      get: () => scrollLeft,
      set: (v: number) => {
        scrollLeft = v;
      },
      configurable: true,
    });
    Object.defineProperty(el, 'clientWidth', {
      get: () => clientWidth,
      set: (v: number) => {
        clientWidth = v;
      },
      configurable: true,
    });
    Object.defineProperty(el, 'scrollWidth', {
      get: () => scrollWidth,
      set: (v: number) => {
        scrollWidth = v;
      },
      configurable: true,
    });

    return el;
  };

  it('scrollRef 为空时不会报错，默认两端处于安全隐藏态', () => {
    const scrollRef = ref<HTMLElement | null>(null);
    const { atTop, atBottom, syncEdgeFades } = useScrollEdgeFades(scrollRef);

    expect(atTop.value).toBe(true);
    expect(atBottom.value).toBe(true);

    expect(() => syncEdgeFades()).not.toThrow();
  });

  it('当内容不足以滚动时（scrollHeight <= clientHeight），两端均隐藏（atTop=true, atBottom=true）', () => {
    const el = createMockScrollElement({ clientHeight: 500, scrollHeight: 400, scrollTop: 0 });
    const scrollRef = ref<HTMLElement | null>(el);
    const { atTop, atBottom } = useScrollEdgeFades(scrollRef);

    expect(atTop.value).toBe(true);
    expect(atBottom.value).toBe(true);
  });

  it('当内容可滚动且停留在顶部时：顶部隐藏（atTop=true），底部渐隐显示（atBottom=false）', () => {
    const el = createMockScrollElement({ clientHeight: 300, scrollHeight: 1000, scrollTop: 0 });
    const scrollRef = ref<HTMLElement | null>(el);
    const { atTop, atBottom } = useScrollEdgeFades(scrollRef);

    expect(atTop.value).toBe(true);
    expect(atBottom.value).toBe(false);
  });

  it('当向下滚动到中间时：两端渐隐均显示（atTop=false, atBottom=false）', () => {
    const el = createMockScrollElement({ clientHeight: 300, scrollHeight: 1000, scrollTop: 0 });
    const scrollRef = ref<HTMLElement | null>(el);
    const { atTop, atBottom, syncEdgeFades } = useScrollEdgeFades(scrollRef);

    el.scrollTop = 200;
    syncEdgeFades();

    expect(atTop.value).toBe(false);
    expect(atBottom.value).toBe(false);
  });

  it('当滚动到底部时：顶部渐隐显示（atTop=false），底部渐隐隐藏（atBottom=true）', () => {
    const el = createMockScrollElement({ clientHeight: 300, scrollHeight: 1000, scrollTop: 0 });
    const scrollRef = ref<HTMLElement | null>(el);
    const { atTop, atBottom, syncEdgeFades } = useScrollEdgeFades(scrollRef);

    el.scrollTop = 700; // scrollTop + clientHeight = 1000 >= scrollHeight - threshold
    syncEdgeFades();

    expect(atTop.value).toBe(false);
    expect(atBottom.value).toBe(true);
  });

  it('支持自定义 threshold 容差', () => {
    const el = createMockScrollElement({ clientHeight: 300, scrollHeight: 1000, scrollTop: 0 });
    const scrollRef = ref<HTMLElement | null>(el);
    const { atTop, syncEdgeFades } = useScrollEdgeFades(scrollRef, { threshold: 10 });

    el.scrollTop = 8; // 8 <= 10 -> 仍在容差范围内算顶部
    syncEdgeFades();
    expect(atTop.value).toBe(true);

    el.scrollTop = 15; // 15 > 10 -> 超出容差算离开顶部
    syncEdgeFades();
    expect(atTop.value).toBe(false);
  });

  it('在组件生命周期内自动绑定 scroll 事件与清理', async () => {
    let mockEl: HTMLElement | null = null;
    let edgeState: { atTop: boolean; atBottom: boolean } | null = null;

    const TestComponent = defineComponent({
      setup() {
        const elRef = ref<HTMLElement | null>(null);
        const { atTop, atBottom } = useScrollEdgeFades(elRef);

        return () => {
          edgeState = { atTop: atTop.value, atBottom: atBottom.value };
          return h('div', {
            ref: dom => {
              elRef.value = dom as HTMLElement;
              if (dom) mockEl = dom as HTMLElement;
            },
            style: { height: '300px', overflow: 'auto' },
          });
        };
      },
    });

    const wrapper = mount(TestComponent);
    await nextTick();

    expect(edgeState?.atTop).toBe(true);
    expect(mockEl).not.toBeNull();
    if (mockEl) {
      Object.defineProperty(mockEl, 'clientHeight', { value: 300, configurable: true });
      Object.defineProperty(mockEl, 'scrollHeight', { value: 1000, configurable: true });
      let st = 0;
      Object.defineProperty(mockEl, 'scrollTop', {
        get: () => st,
        set: v => {
          st = v;
        },
        configurable: true,
      });

      // 派发原生滚动事件
      mockEl.scrollTop = 150;
      mockEl.dispatchEvent(new Event('scroll'));

      // 验证未抛出错误且可正常卸载
      wrapper.unmount();
    }
  });

  describe('横向滚动模式 (direction: "horizontal")', () => {
    it('当横向内容不可滚动时，两端均隐藏（atLeft=true, atRight=true）', () => {
      const el = createMockScrollElement({ clientWidth: 500, scrollWidth: 400, scrollLeft: 0 });
      const scrollRef = ref<HTMLElement | null>(el);
      const { atLeft, atRight, atStart, atEnd } = useScrollEdgeFades(scrollRef, {
        direction: 'horizontal',
      });

      expect(atLeft.value).toBe(true);
      expect(atRight.value).toBe(true);
      expect(atStart.value).toBe(true);
      expect(atEnd.value).toBe(true);
    });

    it('当横向可滚动且在最左端时：左侧隐藏（atLeft=true），右侧显示（atRight=false）', () => {
      const el = createMockScrollElement({ clientWidth: 300, scrollWidth: 1000, scrollLeft: 0 });
      const scrollRef = ref<HTMLElement | null>(el);
      const { atLeft, atRight } = useScrollEdgeFades(scrollRef, { direction: 'horizontal' });

      expect(atLeft.value).toBe(true);
      expect(atRight.value).toBe(false);
    });

    it('当横向滚动到中间时：两端均显示（atLeft=false, atRight=false）', () => {
      const el = createMockScrollElement({ clientWidth: 300, scrollWidth: 1000, scrollLeft: 0 });
      const scrollRef = ref<HTMLElement | null>(el);
      const { atLeft, atRight, syncEdgeFades } = useScrollEdgeFades(scrollRef, {
        direction: 'horizontal',
      });

      el.scrollLeft = 200;
      syncEdgeFades();

      expect(atLeft.value).toBe(false);
      expect(atRight.value).toBe(false);
    });

    it('当横向滚动到最右端时：左侧显示（atLeft=false），右侧隐藏（atRight=true）', () => {
      const el = createMockScrollElement({ clientWidth: 300, scrollWidth: 1000, scrollLeft: 0 });
      const scrollRef = ref<HTMLElement | null>(el);
      const { atLeft, atRight, syncEdgeFades } = useScrollEdgeFades(scrollRef, {
        direction: 'horizontal',
      });

      el.scrollLeft = 700; // scrollLeft + clientWidth = 1000 >= scrollWidth - threshold
      syncEdgeFades();

      expect(atLeft.value).toBe(false);
      expect(atRight.value).toBe(true);
    });

    it('在存在亚像素浮点数与微小截断误差时，仍能正确判定到达最右端（atRight=true）', () => {
      // 模拟高分屏缩放下的浮点值与滚轮截断（如还差 1.8px）
      const el = createMockScrollElement({ clientWidth: 389, scrollWidth: 500, scrollLeft: 0 });
      const scrollRef = ref<HTMLElement | null>(el);
      const { atLeft, atRight, syncEdgeFades } = useScrollEdgeFades(scrollRef, {
        direction: 'horizontal',
        threshold: 3,
      });

      // 理论 maxScrollLeft = 111，实际因 subpixel 停在 109.2（差 1.8px）
      el.scrollLeft = 109.2;
      syncEdgeFades();

      expect(atLeft.value).toBe(false);
      expect(atRight.value).toBe(true);
    });
  });
});
