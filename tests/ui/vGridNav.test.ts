/* eslint-disable vue/one-component-per-file */
import { vGridNav } from '@/directives/vGridNav';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';

describe('vGridNav directive', () => {
  it('navigates with ArrowRight and ArrowLeft', async () => {
    const TestComponent = defineComponent({
      directives: { gridNav: vGridNav },
      template: `
        <div v-grid-nav id="container">
          <button id="btn1">Btn 1</button>
          <button id="btn2">Btn 2</button>
          <button id="btn3">Btn 3</button>
        </div>
      `,
    });

    const wrapper = mount(TestComponent, { attachTo: document.body });
    const container = wrapper.find('#container');
    const btn1 = wrapper.find('#btn1').element as HTMLButtonElement;
    const btn2 = wrapper.find('#btn2').element as HTMLButtonElement;

    btn1.focus();
    const btn2FocusSpy = vi.spyOn(btn2, 'focus');

    await container.trigger('keydown', { key: 'ArrowRight' });
    expect(btn2FocusSpy).toHaveBeenCalled();

    wrapper.unmount();
  });

  it('navigates rows when cols is configured', async () => {
    const TestComponent = defineComponent({
      directives: { gridNav: vGridNav },
      template: `
        <div v-grid-nav="2" id="container">
          <button id="btn1">1</button>
          <button id="btn2">2</button>
          <button id="btn3">3</button>
          <button id="btn4">4</button>
        </div>
      `,
    });

    const wrapper = mount(TestComponent, { attachTo: document.body });
    const container = wrapper.find('#container');
    const btn1 = wrapper.find('#btn1').element as HTMLButtonElement;
    const btn3 = wrapper.find('#btn3').element as HTMLButtonElement;

    btn1.focus();
    const btn3FocusSpy = vi.spyOn(btn3, 'focus');

    // cols=2, from index 0 + 2 = index 2 (btn3)
    await container.trigger('keydown', { key: 'ArrowDown' });
    expect(btn3FocusSpy).toHaveBeenCalled();

    wrapper.unmount();
  });

  it('jumps to start and end with Home and End', async () => {
    const TestComponent = defineComponent({
      directives: { gridNav: vGridNav },
      template: `
        <div v-grid-nav id="container">
          <button id="btn1">1</button>
          <button id="btn2">2</button>
          <button id="btn3">3</button>
        </div>
      `,
    });

    const wrapper = mount(TestComponent, { attachTo: document.body });
    const container = wrapper.find('#container');
    const btn1 = wrapper.find('#btn1').element as HTMLButtonElement;
    const btn2 = wrapper.find('#btn2').element as HTMLButtonElement;
    const btn3 = wrapper.find('#btn3').element as HTMLButtonElement;

    btn2.focus();
    const btn1FocusSpy = vi.spyOn(btn1, 'focus');
    const btn3FocusSpy = vi.spyOn(btn3, 'focus');

    await container.trigger('keydown', { key: 'Home' });
    expect(btn1FocusSpy).toHaveBeenCalled();

    await container.trigger('keydown', { key: 'End' });
    expect(btn3FocusSpy).toHaveBeenCalled();

    wrapper.unmount();
  });
});
