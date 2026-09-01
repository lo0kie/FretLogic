/* eslint-disable vue/one-component-per-file */
import { normalize, vTooltip } from '@/directives/vTooltip';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent } from 'vue';

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
});
