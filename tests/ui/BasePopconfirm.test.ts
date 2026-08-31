import BasePopconfirm from '@/components/base/BasePopconfirm.vue';
import type { VueWrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** 挂载辅助：默认 click 触发 + 关闭 Teleport（面板留在 wrapper 内便于断言） */
const mountPopconfirm = (props: Record<string, unknown> = {}) =>
  mount(BasePopconfirm, {
    props: {
      title: '确定删除这条记录吗？',
      trigger: 'click',
      disabledTeleport: true,
      ...props,
    },
    slots: {
      trigger: `<template #trigger="{ toggle }"><button class="trigger-btn" @click="toggle">触发</button></template>`,
    },
    attachTo: document.body,
  });

/** 等待 BasePopover 内部 nextTick 链完成（isShown 置 true） */
const flushOpen = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
};

const findButton = (wrapper: VueWrapper, text: string) => wrapper.findAll('button').find(b => b.text() === text);

describe('BasePopconfirm.vue', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('click 触发打开，渲染标题/描述与默认按钮组', async () => {
    const wrapper = mountPopconfirm({ description: '该操作不可撤销' });
    await wrapper.find('.trigger-btn').trigger('click');
    await flushOpen();

    expect(wrapper.find('.popconfirm-title').text()).toBe('确定删除这条记录吗？');
    expect(wrapper.find('.popconfirm-description').text()).toBe('该操作不可撤销');
    expect(findButton(wrapper, '确认')).toBeTruthy();
    expect(findButton(wrapper, '取消')).toBeTruthy();
  });

  it('再次点击触发元素关闭面板（toggle）', async () => {
    const wrapper = mountPopconfirm();
    await wrapper.find('.trigger-btn').trigger('click');
    await flushOpen();
    expect(wrapper.find('.popconfirm-title').exists()).toBe(true);

    await wrapper.find('.trigger-btn').trigger('click');
    await flushOpen();
    expect(wrapper.find('.popconfirm-title').exists()).toBe(false);
  });

  it('点击确认：emit confirm 并关闭面板', async () => {
    const wrapper = mountPopconfirm();
    await wrapper.find('.trigger-btn').trigger('click');
    await flushOpen();

    await findButton(wrapper, '确认')!.trigger('click');
    expect(wrapper.emitted('confirm')).toHaveLength(1);
    expect(wrapper.emitted('update:visible')?.at(-1)).toEqual([false]);
  });

  it('点击取消：emit cancel 并关闭面板', async () => {
    const wrapper = mountPopconfirm();
    await wrapper.find('.trigger-btn').trigger('click');
    await flushOpen();

    await findButton(wrapper, '取消')!.trigger('click');
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    expect(wrapper.emitted('update:visible')?.at(-1)).toEqual([false]);
  });

  it('confirmLoading=true 时确认按钮禁用（防重复提交），不触发 confirm', async () => {
    const wrapper = mountPopconfirm({ confirmLoading: true });
    await wrapper.find('.trigger-btn').trigger('click');
    await flushOpen();

    const btn = findButton(wrapper, '确认')!;
    expect(btn.attributes('disabled')).toBeDefined();
    await btn.trigger('click');
    expect(wrapper.emitted('confirm')).toBeUndefined();
  });

  it('closeOnConfirm=false 时确认不关闭（外部 v-model 自控）', async () => {
    const wrapper = mountPopconfirm({ closeOnConfirm: false });
    await wrapper.find('.trigger-btn').trigger('click');
    await flushOpen();

    await findButton(wrapper, '确认')!.trigger('click');
    expect(wrapper.emitted('confirm')).toHaveLength(1);
    // 未关闭（update:visible 只有过打开的 true，没有 false）
    const openEmits = wrapper.emitted('update:visible') ?? [];
    expect(openEmits.some(([v]) => v === false)).toBe(false);
  });

  it('showCancel=false 只渲染确认按钮（纯提示卡）', async () => {
    const wrapper = mountPopconfirm({ showCancel: false, confirmText: '知道了' });
    await wrapper.find('.trigger-btn').trigger('click');
    await flushOpen();

    expect(findButton(wrapper, '取消')).toBeUndefined();
    expect(findButton(wrapper, '知道了')).toBeTruthy();
  });

  it('confirmDisabled=true 时确认按钮禁用且不 emit', async () => {
    const wrapper = mountPopconfirm({ confirmDisabled: true });
    await wrapper.find('.trigger-btn').trigger('click');
    await flushOpen();

    const btn = findButton(wrapper, '确认')!;
    expect(btn.attributes('disabled')).toBeDefined();
    await btn.trigger('click');
    expect(wrapper.emitted('confirm')).toBeUndefined();
  });

  it('disabled=true 时触发与面板均失效', async () => {
    const wrapper = mountPopconfirm({ disabled: true });
    await wrapper.find('.trigger-btn').trigger('click');
    await flushOpen();
    expect(wrapper.find('.popconfirm-title').exists()).toBe(false);
  });

  it('tone=danger 渲染警示图标', async () => {
    const wrapper = mountPopconfirm({ tone: 'danger' });
    await wrapper.find('.trigger-btn').trigger('click');
    await flushOpen();

    expect(wrapper.find('.popconfirm-icon').exists()).toBe(true);
    expect(findButton(wrapper, '确认')).toBeTruthy();
  });

  it('tone=info 渲染 Info 图标', async () => {
    const wrapper = mountPopconfirm({ tone: 'info', showCancel: false });
    await wrapper.find('.trigger-btn').trigger('click');
    await flushOpen();
    expect(wrapper.find('.popconfirm-icon').exists()).toBe(true);
  });

  it('hover 触发：悬停延迟打开，移出延迟关闭', async () => {
    vi.useFakeTimers();
    const wrapper = mountPopconfirm({ trigger: 'hover', hoverOpenDelay: 150, hoverCloseDelay: 120 });
    // mouseenter 不冒泡，BasePopover 在 .popover-trigger 包裹层上监听
    const triggerEl = wrapper.find('.popover-trigger');

    await triggerEl.trigger('mouseenter');
    await vi.advanceTimersByTimeAsync(50);
    expect(wrapper.find('.popconfirm-title').exists()).toBe(false); // 未到打开延迟

    await vi.advanceTimersByTimeAsync(150);
    expect(wrapper.find('.popconfirm-title').exists()).toBe(true);

    await triggerEl.trigger('mouseleave');
    await vi.advanceTimersByTimeAsync(50);
    expect(wrapper.find('.popconfirm-title').exists()).toBe(true); // 未到关闭延迟

    await vi.advanceTimersByTimeAsync(120);
    expect(wrapper.find('.popconfirm-title').exists()).toBe(false);
  });

  it('actions 插槽可替换默认按钮组', async () => {
    const wrapper = mount(BasePopconfirm, {
      props: { title: '提示', trigger: 'click', disabledTeleport: true },
      slots: {
        trigger: `<template #trigger="{ toggle }"><button class="trigger-btn" @click="toggle">触发</button></template>`,
        actions: `<template #actions="{ close }"><button class="custom-action" @click="close">自定义操作</button></template>`,
      },
      attachTo: document.body,
    });
    await wrapper.find('.trigger-btn').trigger('click');
    await flushOpen();

    expect(findButton(wrapper, '确认')).toBeUndefined();
    expect(wrapper.find('.custom-action').exists()).toBe(true);

    await wrapper.find('.custom-action').trigger('click');
    expect(wrapper.emitted('update:visible')?.at(-1)).toEqual([false]);
  });
});
