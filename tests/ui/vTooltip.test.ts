/* eslint-disable vue/one-component-per-file */
import { defineComponent } from 'vue';

import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { destroyGlobalTooltip, normalize, vTooltip } from '@/platform/directives/vTooltip';

describe('vTooltip directive modifiers', () => {
  it('supports default placement top when no modifiers provided', () => {
    const TestComponent = defineComponent({
      directives: { tooltip: vTooltip },
      template: `<button v-tooltip="'播放'">按钮</button>`,
    });

    const wrapper = mount(TestComponent);
    expect(wrapper.exists()).toBe(true);
  });

  it('supports basic direction modifiers: bottom, left, right, top', () => {
    const TestComponent = defineComponent({
      directives: { tooltip: vTooltip },
      template: `
        <div>
          <button id="btn-bottom" v-tooltip.bottom="'底部提示'">底</button>
          <button id="btn-left" v-tooltip.left="'左侧提示'">左</button>
          <button id="btn-right" v-tooltip.right="'右侧提示'">右</button>
          <button id="btn-top" v-tooltip.top="'顶部提示'">顶</button>
        </div>
      `,
    });

    const wrapper = mount(TestComponent);
    expect(wrapper.find('#btn-bottom').exists()).toBe(true);
    expect(wrapper.find('#btn-left').exists()).toBe(true);
    expect(wrapper.find('#btn-right').exists()).toBe(true);
    expect(wrapper.find('#btn-top').exists()).toBe(true);
  });

  it('supports compound and chained alignment modifiers', () => {
    const TestComponent = defineComponent({
      directives: { tooltip: vTooltip },
      template: `
        <div>
          <button id="btn-bs" v-tooltip.bottom-start="'底左'">底左</button>
          <button id="btn-be" v-tooltip.bottom.end="'底右'">底右</button>
          <button id="btn-ts" v-tooltip.top-start="'顶左'">顶左</button>
          <button id="btn-re" v-tooltip.right-end="'右下'">右下</button>
        </div>
      `,
    });

    const wrapper = mount(TestComponent);
    expect(wrapper.find('#btn-bs').exists()).toBe(true);
    expect(wrapper.find('#btn-be').exists()).toBe(true);
    expect(wrapper.find('#btn-ts').exists()).toBe(true);
    expect(wrapper.find('#btn-re').exists()).toBe(true);
  });
});

describe('vTooltip normalize modifiers', () => {
  it('resolves .interactive / .html / .disabled modifiers from flags', () => {
    expect(normalize('提示', { interactive: true }).interactive).toBe(true);
    expect(normalize('提示', { html: true }).html).toBe(true);
    expect(normalize('提示', { disabled: true }).disabled).toBe(true);
  });

  it('treats absence of modifier as default false', () => {
    const opts = normalize('提示', {});
    expect(opts.interactive).toBe(false);
    expect(opts.html).toBe(false);
    expect(opts.disabled).toBe(false);
    expect(opts.showArrow).toBe(true);
  });

  it('.no-arrow modifier disables the arrow', () => {
    expect(normalize('提示', { 'no-arrow': true }).showArrow).toBe(false);
  });

  it('object value takes precedence over modifier', () => {
    expect(normalize({ content: '提示', interactive: false }, { interactive: true }).interactive).toBe(false);
    expect(normalize({ content: '提示', html: false }, { html: true }).html).toBe(false);
    expect(normalize({ content: '提示', disabled: false }, { disabled: true }).disabled).toBe(false);
    expect(normalize({ content: '提示', showArrow: true }, { 'no-arrow': true }).showArrow).toBe(true);
  });

  it('derives placement from direction modifiers', () => {
    expect(normalize('提示', { bottom: true }).placement).toBe('bottom');
    expect(normalize('提示', { right: true, end: true }).placement).toBe('right-end');
    expect(normalize('提示', { top: true, start: true }).placement).toBe('top-start');
  });

  it('supports string[] in normalize', () => {
    const opts = normalize(['第一行', '第二行']);
    expect(opts.content).toEqual(['第一行', '第二行']);
  });
});

describe('vTooltip lifecycle & scroll listener', () => {
  afterEach(() => {
    destroyGlobalTooltip();
  });

  it('destroyGlobalTooltip 能够完全移除 DOM 节点并释放资源', async () => {
    const TestComponent = defineComponent({
      directives: { tooltip: vTooltip },
      template: `<button id="btn" v-tooltip="'测试内容'">按钮</button>`,
    });

    const wrapper = mount(TestComponent, { attachTo: document.body });
    const btn = wrapper.find('#btn');
    await btn.trigger('mouseenter');
    await wrapper.vm.$nextTick();

    // 应该已创建 globalBox
    expect(document.querySelector('.v-tooltip-root')).not.toBeNull();

    // 销毁
    destroyGlobalTooltip();
    expect(document.querySelector('.v-tooltip-root')).toBeNull();

    wrapper.unmount();
  });

  it('滚动监听器在无 tooltip 显示时按需挂载/卸载，不留全局常驻监听', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const TestComponent = defineComponent({
      directives: { tooltip: vTooltip },
      template: `<button id="btn" v-tooltip="{ content: '测试', showDelay: 0, hideDelay: 0 }">按钮</button>`,
    });

    const wrapper = mount(TestComponent, { attachTo: document.body });
    const btn = wrapper.find('#btn');

    // 移入触发显示
    await btn.trigger('mouseenter');
    await wrapper.vm.$nextTick();
    await new Promise(resolve => setTimeout(resolve, 50));

    // 应当已动态添加 scroll capture 监听
    const hasScrollAdded = addEventListenerSpy.mock.calls.some(call => call[0] === 'scroll' && call[2] === true);
    expect(hasScrollAdded).toBe(true);

    // 移出触发隐藏
    await btn.trigger('mouseleave');
    await wrapper.vm.$nextTick();
    await new Promise(resolve => setTimeout(resolve, 50));

    // 应当已移除 scroll capture 监听
    const hasScrollRemoved = removeEventListenerSpy.mock.calls.some(call => call[0] === 'scroll' && call[2] === true);
    expect(hasScrollRemoved).toBe(true);

    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
    wrapper.unmount();
  });

  it('支持传入字符串数组，为每一项渲染独立的 .v-tooltip-line 行', async () => {
    const TestComponent = defineComponent({
      directives: { tooltip: vTooltip },
      template: `<button id="btn-lines" v-tooltip="{ content: ['第一行', '第二行'], showDelay: 0, hideDelay: 0 }">按钮</button>`,
    });

    const wrapper = mount(TestComponent, { attachTo: document.body });
    const btn = wrapper.find('#btn-lines');

    await btn.trigger('mouseenter');
    await wrapper.vm.$nextTick();
    await new Promise(resolve => setTimeout(resolve, 50));

    const lineEls = document.querySelectorAll('.v-tooltip-box .v-tooltip-line');
    expect(lineEls).toHaveLength(2);
    expect(lineEls[0]?.textContent).toBe('第一行');
    expect(lineEls[1]?.textContent).toBe('第二行');

    await btn.trigger('mouseleave');
    wrapper.unmount();
  });
});
