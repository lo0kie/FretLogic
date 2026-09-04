/* eslint-disable vue/one-component-per-file */
import { defineComponent, ref } from 'vue';

import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { vFocus } from '@/platform/directives/vFocus';

describe('vFocus directive', () => {
  it('automatically focuses input on mount', async () => {
    const TestComponent = defineComponent({
      directives: { focus: vFocus },
      template: `<input id="inp" v-focus />`,
    });

    const wrapper = mount(TestComponent, { attachTo: document.body });
    const el = wrapper.find('#inp').element as HTMLInputElement;

    const focusSpy = vi.spyOn(el, 'focus');
    // nextTick 会在挂载后触发
    await wrapper.vm.$nextTick();

    expect(focusSpy).toHaveBeenCalled();
    wrapper.unmount();
  });

  it('selects content when .select modifier is provided', async () => {
    const TestComponent = defineComponent({
      directives: { focus: vFocus },
      template: `<input id="inp" v-focus.select value="hello" />`,
    });

    const wrapper = mount(TestComponent, { attachTo: document.body });
    const el = wrapper.find('#inp').element as HTMLInputElement;

    const selectSpy = vi.spyOn(el, 'select');
    await wrapper.vm.$nextTick();

    expect(selectSpy).toHaveBeenCalled();
    wrapper.unmount();
  });

  it('triggers focus dynamically when binding value turns true', async () => {
    const isVisible = ref(false);
    const TestComponent = defineComponent({
      directives: { focus: vFocus },
      setup() {
        return { isVisible };
      },
      template: `<input id="inp" v-focus="isVisible" />`,
    });

    const wrapper = mount(TestComponent, { attachTo: document.body });
    const el = wrapper.find('#inp').element as HTMLInputElement;
    const focusSpy = vi.spyOn(el, 'focus');

    await wrapper.vm.$nextTick();
    expect(focusSpy).not.toHaveBeenCalled();

    isVisible.value = true;
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(focusSpy).toHaveBeenCalled();
    wrapper.unmount();
  });
});
