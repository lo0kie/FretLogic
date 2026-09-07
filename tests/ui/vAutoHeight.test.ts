/* eslint-disable vue/one-component-per-file */
import { defineComponent, ref } from 'vue';

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import { vAutoHeight } from '@/platform/directives/vAutoHeight';

describe('vAutoHeight directive', () => {
  it('支持布尔值展开/收起切换', async () => {
    const isExpanded = ref(true);
    const TestComponent = defineComponent({
      directives: { autoHeight: vAutoHeight },
      setup() {
        return { isExpanded };
      },
      template: `
        <div id="container" v-auto-height="isExpanded">
          <div id="child">Child Content</div>
        </div>
      `,
    });

    const wrapper = mount(TestComponent, { attachTo: document.body });
    const container = wrapper.find('#container').element as HTMLElement;
    const child = wrapper.find('#child').element as HTMLElement;

    Object.defineProperty(child, 'offsetHeight', { value: 300, configurable: true });
    Object.defineProperty(child, 'scrollHeight', { value: 300, configurable: true });

    // 收起
    isExpanded.value = false;
    await wrapper.vm.$nextTick();
    expect(container.style.height).toBe('0px');

    // 展开
    isExpanded.value = true;
    await wrapper.vm.$nextTick();

    wrapper.unmount();
  });

  it('支持 disabled 选项屏蔽高度接管', async () => {
    const isExpanded = ref(true);
    const isDisabled = ref(true);
    const TestComponent = defineComponent({
      directives: { autoHeight: vAutoHeight },
      setup() {
        return { isExpanded, isDisabled };
      },
      template: `
        <div id="container" v-auto-height="{ expanded: isExpanded, disabled: isDisabled }" style="height: 500px;">
          <div id="child">Child Content</div>
        </div>
      `,
    });

    const wrapper = mount(TestComponent, { attachTo: document.body });
    const container = wrapper.find('#container').element as HTMLElement;

    expect(container.style.height).toBe('500px');

    // 收起但 disabled 为 true 时，不被改写为 0px
    isExpanded.value = false;
    await wrapper.vm.$nextTick();
    expect(container.style.height).toBe('500px');

    wrapper.unmount();
  });
});
