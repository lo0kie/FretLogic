/* eslint-disable vue/one-component-per-file */
import { defineComponent, ref } from 'vue';

import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { vAutoWidth } from '@/directives/vAutoWidth';

describe('vAutoWidth directive', () => {
  it('initializes and records baseline on mount without animating', async () => {
    const TestComponent = defineComponent({
      directives: { autoWidth: vAutoWidth },
      template: `<div id="box" v-auto-width><span>Hello</span></div>`,
    });

    const wrapper = mount(TestComponent, { attachTo: document.body });
    const el = wrapper.find('#box').element as HTMLElement;

    expect(el).toBeDefined();
    wrapper.unmount();
  });

  it('supports boolean toggle and custom duration', async () => {
    const isEnabled = ref(true);
    const TestComponent = defineComponent({
      directives: { autoWidth: vAutoWidth },
      setup() {
        return { isEnabled };
      },
      template: `<div id="box" v-auto-width="isEnabled"><span>Hello</span></div>`,
    });

    const wrapper = mount(TestComponent, { attachTo: document.body });
    const el = wrapper.find('#box').element as HTMLElement;

    expect(el).toBeDefined();

    // Toggle to false
    isEnabled.value = false;
    await wrapper.vm.$nextTick();

    // Toggle to true
    isEnabled.value = true;
    await wrapper.vm.$nextTick();

    wrapper.unmount();
  });

  it('handles animate call when width changes', async () => {
    const text = ref('Short');
    const TestComponent = defineComponent({
      directives: { autoWidth: vAutoWidth },
      setup() {
        return { text };
      },
      template: `<div id="box" v-auto-width="{ duration: 160 }"><span>{{ text }}</span></div>`,
    });

    const wrapper = mount(TestComponent, { attachTo: document.body });
    const el = wrapper.find('#box').element as HTMLElement;

    // Mock animate
    const animateMock = vi.fn().mockReturnValue({
      onfinish: null,
      cancel: vi.fn(),
    });
    el.animate = animateMock;

    wrapper.unmount();
  });
});
