import { defineComponent, ref } from 'vue';

import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useEdgeScroll } from '@/platform/composables/useEdgeScroll';

describe('useEdgeScroll 边缘滚动与事件防御', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('调用 scrollToTop / scrollToBottom 时即便传入 PointerEvent（如 Vue 模板事件委托）也绝不抛错，安全使用 smooth 滚动', () => {
    const el = document.createElement('div');
    const scrollToMock = vi.fn();
    el.scrollTo = scrollToMock;

    Object.defineProperty(el, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: 300, configurable: true });

    let scrollApi!: ReturnType<typeof useEdgeScroll>;
    const TestComp = defineComponent({
      setup() {
        const targetRef = ref(el);
        scrollApi = useEdgeScroll(targetRef);
        return () => null;
      },
    });

    mount(TestComp);

    const { scrollToTop, scrollToBottom } = scrollApi;

    // 模拟 Vue 模板 @click="scrollToTop" 传递的 PointerEvent
    const mockPointerEvent = new MouseEvent('click') as unknown as PointerEvent;
    expect(() => scrollToTop(mockPointerEvent)).not.toThrow();
    expect(scrollToMock).toHaveBeenLastCalledWith({ top: 0, behavior: 'smooth' });

    // 模拟 @click="scrollToBottom" 传递的 PointerEvent
    expect(() => scrollToBottom(mockPointerEvent)).not.toThrow();
    expect(scrollToMock).toHaveBeenLastCalledWith({ top: 1000, behavior: 'smooth' });

    // 显式指定 'auto' 参数时按 'auto' 滚动
    scrollToTop('auto');
    expect(scrollToMock).toHaveBeenLastCalledWith({ top: 0, behavior: 'auto' });
  });
});
