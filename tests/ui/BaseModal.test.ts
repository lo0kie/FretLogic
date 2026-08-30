import BaseModal from '@/components/base/BaseModal.vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

const flushStack = () => new Promise(resolve => setTimeout(resolve, 0));

const pressEscape = () => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
};

describe('BaseModal component', () => {
  it('Escape 默认触发关闭（update:visible 与 cancel）', async () => {
    const wrapper = mount(BaseModal, {
      props: { visible: true, teleportTo: 'body' },
      slots: { default: '<p>内容</p>' },
    });
    await flushStack();

    pressEscape();
    await flushStack();

    expect(wrapper.emitted('cancel')).toBeTruthy();
    expect(wrapper.emitted('update:visible')).toEqual([[false]]);
  });

  it('keyboard=false 时 Escape 不关闭', async () => {
    const wrapper = mount(BaseModal, {
      props: { visible: true, teleportTo: 'body', keyboard: false },
      slots: { default: '<p>内容</p>' },
    });
    await flushStack();

    pressEscape();
    await flushStack();

    expect(wrapper.emitted('cancel')).toBeFalsy();
    expect(wrapper.emitted('update:visible')).toBeFalsy();
  });

  it('层叠弹窗时 Escape 仅关闭最上层', async () => {
    const bottom = mount(BaseModal, {
      props: { visible: true, teleportTo: 'body' },
      slots: { default: '<p>底层</p>' },
      attrs: { 'data-test': 'bottom' },
    });
    await flushStack();

    const top = mount(BaseModal, {
      props: { visible: true, teleportTo: 'body' },
      slots: { default: '<p>顶层</p>' },
      attrs: { 'data-test': 'top' },
    });
    await flushStack();

    pressEscape();
    await flushStack();

    expect(top.emitted('cancel')).toBeTruthy();
    expect(top.emitted('update:visible')).toEqual([[false]]);
    expect(bottom.emitted('cancel')).toBeFalsy();
    expect(bottom.emitted('update:visible')).toBeFalsy();
  });

  it('顶层关闭后，Escape 可继续关闭下一层', async () => {
    const bottom = mount(BaseModal, {
      props: { visible: true, teleportTo: 'body' },
      slots: { default: '<p>底层</p>' },
    });
    await flushStack();

    const top = mount(BaseModal, {
      props: { visible: true, teleportTo: 'body' },
      slots: { default: '<p>顶层</p>' },
    });
    await flushStack();

    pressEscape();
    await flushStack();
    top.unmount();

    pressEscape();
    await flushStack();

    expect(bottom.emitted('cancel')).toBeTruthy();
    expect(bottom.emitted('update:visible')).toEqual([[false]]);
  });
});
