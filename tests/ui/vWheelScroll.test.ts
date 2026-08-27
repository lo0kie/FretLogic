/* eslint-disable vue/one-component-per-file */
import { vWheelScroll } from '@/directives/vWheelScroll';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';

describe('vWheelScroll directive', () => {
  it('converts vertical wheel event to horizontal scroll on scrollable container', async () => {
    const TestComponent = defineComponent({
      directives: { 'wheel-scroll': vWheelScroll },
      template: `<div id="box" v-wheel-scroll style="width: 200px; overflow-x: auto;"></div>`,
    });

    const wrapper = mount(TestComponent, { attachTo: document.body });
    const el = wrapper.find('#box').element as HTMLElement;

    // 模拟横向溢出
    Object.defineProperty(el, 'clientWidth', { value: 200, configurable: true });
    Object.defineProperty(el, 'scrollWidth', { value: 600, configurable: true });
    el.scrollLeft = 0;

    const event = new WheelEvent('wheel', { deltaY: 80, cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    el.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(el.scrollLeft).toBe(80);

    wrapper.unmount();
  });

  it('supports reverse modifier', async () => {
    const TestComponent = defineComponent({
      directives: { 'wheel-scroll': vWheelScroll },
      template: `<div id="box" v-wheel-scroll.reverse style="width: 200px; overflow-x: auto;"></div>`,
    });

    const wrapper = mount(TestComponent, { attachTo: document.body });
    const el = wrapper.find('#box').element as HTMLElement;

    Object.defineProperty(el, 'clientWidth', { value: 200, configurable: true });
    Object.defineProperty(el, 'scrollWidth', { value: 600, configurable: true });
    el.scrollLeft = 100;

    const event = new WheelEvent('wheel', { deltaY: 50, cancelable: true });
    el.dispatchEvent(event);

    expect(el.scrollLeft).toBe(50);

    wrapper.unmount();
  });

  it('does not scroll or prevent default when container is not horizontally scrollable', async () => {
    const TestComponent = defineComponent({
      directives: { 'wheel-scroll': vWheelScroll },
      template: `<div id="box" v-wheel-scroll style="width: 200px;"></div>`,
    });

    const wrapper = mount(TestComponent, { attachTo: document.body });
    const el = wrapper.find('#box').element as HTMLElement;

    Object.defineProperty(el, 'clientWidth', { value: 200, configurable: true });
    Object.defineProperty(el, 'scrollWidth', { value: 200, configurable: true });
    el.scrollLeft = 0;

    const event = new WheelEvent('wheel', { deltaY: 50, cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    el.dispatchEvent(event);

    expect(preventDefaultSpy).not.toHaveBeenCalled();
    expect(el.scrollLeft).toBe(0);

    wrapper.unmount();
  });
});
