import { defineComponent, h, nextTick, ref } from 'vue';

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import BaseFloatingPanel from '@/platform/ui/floating-panel/BaseFloatingPanel.vue';
import { useOverlayLifecycle } from '@/platform/ui/overlay/overlayLifecycle';
import { isInTopLayer } from '@/platform/ui/popover/topLayer';

/**
 * 「模态在屏 → 非模态浮层让位」这条链路的状态机契约。
 *
 * 被测的不变量：模态（Modal / Drawer）走 z-index，非模态浮层（BaseFloatingPanel）走浏览器 top-layer，
 * 而 top-layer 恒在一切 z-index 之上 —— 于是模态一开，面板必须**离开 top-layer**；而回层的时机是
 * 模态的**离场动画结束**，不是关闭瞬间（关闭瞬间就回层，抽屉还在往右滑、面板已回到顶层把它盖住）。
 *
 * 这条不变量此前是缺的：和弦编辑抽屉从和弦选择面板里打开（ChordPickerPanel 的「新建和弦 /
 * 去修改该和弦」），面板盖住抽屉大半、遮罩也压不住它。起因与取舍见 BaseFloatingPanel 的「模态让位」。
 *
 * 用直接调 `handleAfterLeave` 代替等 Transition 的 after-leave：jsdom 不跑过渡，靠事件驱动会把断言
 * 建立在一个环境细节上（tests/setup.ts 也明确不为 top-layer 顺序背书）。
 */

/** 多拍 nextTick：进层排在组件内部 `await nextTick()` 之后，一拍不够 */
const flush = async () => {
  for (let i = 0; i < 3; i++) await nextTick();
};

/**
 * 回层时的淡入类名：它是组件与全局样式（main.scss 的 `.floating-panel-yield-restore`）之间的契约，
 * 同下面各例里的 `data-floating-yielded` 一样按字面量断言。
 */
const RESTORE_FADE_CLASS = 'floating-panel-yield-restore';

/**
 * 模态宿主：只用 `useOverlayLifecycle` 的两个关键时机（打开瞬间 / 离场动画结束），
 * 不挂真实 Modal / Drawer —— 本用例问的是时机，不是那两个组件的渲染。
 */
const mountModalHost = () => {
  const visible = ref(false);
  let afterLeave: (() => void) | null = null;
  const Host = defineComponent({
    setup() {
      const overlayRef = ref<HTMLElement | null>(null);
      afterLeave = useOverlayLifecycle({
        visible,
        overlayRef,
        onEscape: () => {},
        locksBody: () => false,
      }).handleAfterLeave;
      return () => h('div', { ref: overlayRef });
    },
  });
  const wrapper = mount(Host);
  return {
    wrapper,
    /** 打开（模态层号 / inert 入栈都在这一拍之后，故等一拍） */
    open: async () => {
      visible.value = true;
      await flush();
    },
    /** 模拟离场动画结束（真实环境由 Transition 的 @after-leave 触发） */
    leaveDone: () => afterLeave?.(),
  };
};

/** 挂一个打开态的面板，返回它的本体元素（Teleport 到 body，故按 document 查） */
const mountPanel = async () => {
  const wrapper = mount(BaseFloatingPanel, { props: { visible: true } });
  await flush();
  // 取**最后一个**而不是第一个：面板 Teleport 到 body 且各例自行卸载，正常下一例只该有一个；
  // 但只要有一例在断言中途挂掉、没走到 unmount，残留节点就会被后面的用例当成自己的面板 ——
  // 一处真实失败会连带把后面几例也判红，真正的失败点被埋掉。取最新挂上的那个即可各自独立。
  const panels = document.querySelectorAll<HTMLElement>('[data-floating-panel]');
  const panel = panels[panels.length - 1];
  if (!panel) throw new Error('面板本体没上屏：Teleport 目标或 v-show 时序变了');
  return { wrapper, panel };
};

describe('模态在屏时的浮层让位', () => {
  it('模态在屏期间面板离开 top-layer 并置让位标记，离场动画结束才回层', async () => {
    const { wrapper: panelWrapper, panel } = await mountPanel();
    expect(isInTopLayer(panel)).toBe(true);
    expect(panel.hasAttribute('data-floating-yielded')).toBe(false);

    const modal = mountModalHost();
    await modal.open();
    // 两件事都要：出层定层叠，让位标记定可见性（只出层的话面板仍在屏上，只是掉到模态之下）
    expect(isInTopLayer(panel)).toBe(false);
    expect(panel.hasAttribute('data-floating-yielded')).toBe(true);

    modal.leaveDone();
    expect(isInTopLayer(panel)).toBe(true);
    expect(panel.hasAttribute('data-floating-yielded')).toBe(false);

    modal.wrapper.unmount();
    panelWrapper.unmount();
  });

  it('两个模态叠加时，先离场的那个不提前放行（计数跨过 0 才通知）', async () => {
    const { wrapper: panelWrapper, panel } = await mountPanel();

    const first = mountModalHost();
    const second = mountModalHost();
    await first.open();
    await second.open();
    expect(isInTopLayer(panel)).toBe(false);

    first.leaveDone();
    expect(isInTopLayer(panel)).toBe(false);

    second.leaveDone();
    expect(isInTopLayer(panel)).toBe(true);

    first.wrapper.unmount();
    second.wrapper.unmount();
    panelWrapper.unmount();
  });

  it('让位态下关闭面板：退订后模态走光也不会被唤回层，让位标记随之清掉', async () => {
    const { wrapper: panelWrapper, panel } = await mountPanel();
    const modal = mountModalHost();
    await modal.open();
    expect(isInTopLayer(panel)).toBe(false);

    await panelWrapper.setProps({ visible: false });
    await flush();
    // 标记必须清掉：留着的话重开的面板会一直 display:none
    expect(panel.hasAttribute('data-floating-yielded')).toBe(false);
    modal.leaveDone();
    await flush();
    expect(isInTopLayer(panel)).toBe(false);

    modal.wrapper.unmount();
    panelWrapper.unmount();
  });

  it('回层时挂上一次性淡入类（display 翻回 flex 没有过渡可依附），面板关闭时兜底摘掉', async () => {
    const { wrapper: panelWrapper, panel } = await mountPanel();
    const modal = mountModalHost();
    await modal.open();
    expect(panel.classList.contains(RESTORE_FADE_CLASS)).toBe(false);

    modal.leaveDone();
    expect(panel.classList.contains(RESTORE_FADE_CLASS)).toBe(true);

    // 淡入途中关闭面板：animationend 不会再来（动画随元素隐藏被取消），类必须由退订路径兜底摘掉 ——
    // 留着它，下次让位恢复时「类已存在」不会重新起跑，面板又会跳出来
    await panelWrapper.setProps({ visible: false });
    await flush();
    expect(panel.classList.contains(RESTORE_FADE_CLASS)).toBe(false);

    modal.wrapper.unmount();
    panelWrapper.unmount();
  });

  it('淡入途中再次让位：类被摘掉，下一次恢复能重新起跑', async () => {
    const { wrapper: panelWrapper, panel } = await mountPanel();
    const first = mountModalHost();
    await first.open();
    first.leaveDone();
    expect(panel.classList.contains(RESTORE_FADE_CLASS)).toBe(true);

    // 上一轮淡入还没跑完（jsdom 不派发 animationend，等价于「0.18s 内又被让位」）就再来一个模态
    const second = mountModalHost();
    await second.open();
    expect(panel.classList.contains(RESTORE_FADE_CLASS)).toBe(false);

    // 类若残留，恢复分支的 add 是空操作、动画不会重新起跑 —— 面板又会在抽屉消失的那一帧跳出来
    second.leaveDone();
    expect(panel.classList.contains(RESTORE_FADE_CLASS)).toBe(true);

    first.wrapper.unmount();
    second.wrapper.unmount();
    panelWrapper.unmount();
  });

  it('面板在模态开着时被打开：照旧进层，不因让位变成「点了没反应」', async () => {
    const modal = mountModalHost();
    await modal.open();

    const { wrapper: panelWrapper, panel } = await mountPanel();
    expect(isInTopLayer(panel)).toBe(true);

    modal.wrapper.unmount();
    panelWrapper.unmount();
  });

  it('计数不泄漏：前一组模态全部走光后，新面板仍能被正常让位', async () => {
    const stale = mountModalHost();
    await stale.open();
    stale.leaveDone();
    stale.wrapper.unmount();

    const { wrapper: panelWrapper, panel } = await mountPanel();
    expect(isInTopLayer(panel)).toBe(true);

    const modal = mountModalHost();
    await modal.open();
    expect(isInTopLayer(panel)).toBe(false);

    modal.leaveDone();
    expect(isInTopLayer(panel)).toBe(true);

    modal.wrapper.unmount();
    panelWrapper.unmount();
  });
});
