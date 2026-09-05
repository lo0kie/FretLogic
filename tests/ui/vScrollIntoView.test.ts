/* eslint-disable vue/one-component-per-file */
import { defineComponent, ref } from 'vue';

import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { vScrollIntoView } from '@/platform/directives/vScrollIntoView';

describe('vScrollIntoView directive', () => {
  it('当挂载时 binding 值为 true，自动调用 scrollIntoView', async () => {
    const TestComponent = defineComponent({
      directives: { scrollIntoView: vScrollIntoView },
      template: `<div id="target" v-scrollIntoView="true">Item</div>`,
    });

    const scrollIntoViewSpy = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewSpy;

    const wrapper = mount(TestComponent, { attachTo: document.body });
    await wrapper.vm.$nextTick();
    await new Promise(resolve => requestAnimationFrame(resolve));

    expect(scrollIntoViewSpy).toHaveBeenCalledWith({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'auto',
    });

    wrapper.unmount();
  });

  it('当挂载时 binding 值为 false，不调用 scrollIntoView', async () => {
    const TestComponent = defineComponent({
      directives: { scrollIntoView: vScrollIntoView },
      template: `<div id="target" v-scrollIntoView="false">Item</div>`,
    });

    const scrollIntoViewSpy = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewSpy;

    const wrapper = mount(TestComponent, { attachTo: document.body });
    await wrapper.vm.$nextTick();
    await new Promise(resolve => requestAnimationFrame(resolve));

    expect(scrollIntoViewSpy).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('当绑定值从 false 动态变为 true 时，以 smooth 模式平滑滚动', async () => {
    const isActive = ref(false);
    const TestComponent = defineComponent({
      directives: { scrollIntoView: vScrollIntoView },
      setup() {
        return { isActive };
      },
      template: `<div id="target" v-scrollIntoView="isActive">Item</div>`,
    });

    const scrollIntoViewSpy = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewSpy;

    const wrapper = mount(TestComponent, { attachTo: document.body });
    await wrapper.vm.$nextTick();
    await new Promise(resolve => requestAnimationFrame(resolve));

    expect(scrollIntoViewSpy).not.toHaveBeenCalled();

    // 动态激活
    isActive.value = true;
    await wrapper.vm.$nextTick();
    await new Promise(resolve => requestAnimationFrame(resolve));

    expect(scrollIntoViewSpy).toHaveBeenCalledWith({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'smooth',
    });

    wrapper.unmount();
  });

  it('支持 .center 修饰符水平垂直居中', async () => {
    const TestComponent = defineComponent({
      directives: { scrollIntoView: vScrollIntoView },
      template: `<div id="target" v-scrollIntoView.center="true">Item</div>`,
    });

    const scrollIntoViewSpy = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewSpy;

    const wrapper = mount(TestComponent, { attachTo: document.body });
    await wrapper.vm.$nextTick();
    await new Promise(resolve => requestAnimationFrame(resolve));

    expect(scrollIntoViewSpy).toHaveBeenCalledWith({
      block: 'center',
      inline: 'center',
      behavior: 'auto',
    });

    wrapper.unmount();
  });

  it('支持传入自定义选项对象配置', async () => {
    const options = { active: true, block: 'start' as const, inline: 'end' as const, behavior: 'smooth' as const };
    const TestComponent = defineComponent({
      directives: { scrollIntoView: vScrollIntoView },
      setup() {
        return { options };
      },
      template: `<div id="target" v-scrollIntoView="options">Item</div>`,
    });

    const scrollIntoViewSpy = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewSpy;

    const wrapper = mount(TestComponent, { attachTo: document.body });
    await wrapper.vm.$nextTick();
    await new Promise(resolve => requestAnimationFrame(resolve));

    expect(scrollIntoViewSpy).toHaveBeenCalledWith({
      block: 'start',
      inline: 'end',
      behavior: 'smooth',
    });

    wrapper.unmount();
  });

  it('当使用 .x 修饰符时，仅在横向滚动容器内调用 scrollTo，不调用原生 scrollIntoView', async () => {
    const TestComponent = defineComponent({
      directives: { scrollIntoView: vScrollIntoView },
      template: `
        <div id="container" style="overflow-x: auto; width: 200px;">
          <div id="target" v-scrollIntoView.x.center="true" style="width: 50px;">Item</div>
        </div>
      `,
    });

    const scrollIntoViewSpy = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewSpy;

    const scrollToSpy = vi.fn();
    window.HTMLElement.prototype.scrollTo = scrollToSpy;

    const wrapper = mount(TestComponent, { attachTo: document.body });
    await wrapper.vm.$nextTick();
    await new Promise(resolve => requestAnimationFrame(resolve));

    expect(scrollIntoViewSpy).not.toHaveBeenCalled();
    expect(scrollToSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        behavior: 'auto',
      })
    );

    wrapper.unmount();
  });

  it('当使用 .once 修饰符时，后续更新不触发滚动', async () => {
    const isActive = ref(false);
    const TestComponent = defineComponent({
      directives: { scrollIntoView: vScrollIntoView },
      setup() {
        return { isActive };
      },
      template: `<div id="target" v-scrollIntoView.once="isActive">Item</div>`,
    });

    const scrollIntoViewSpy = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewSpy;

    const wrapper = mount(TestComponent, { attachTo: document.body });
    await wrapper.vm.$nextTick();
    await new Promise(resolve => requestAnimationFrame(resolve));

    expect(scrollIntoViewSpy).not.toHaveBeenCalled();

    isActive.value = true;
    await wrapper.vm.$nextTick();
    await new Promise(resolve => requestAnimationFrame(resolve));

    expect(scrollIntoViewSpy).not.toHaveBeenCalled();

    wrapper.unmount();
  });
});
