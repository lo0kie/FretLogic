/**
 * 歌词拖拽会话的全局监听器清理（回归锚点）。
 *
 * 背景：`useLyricsDragDrop` 在「按下槽位 / 外部拖拽源」时**动态**给 window 挂 contextmenu 捕获
 * 监听（拖拽期屏蔽右键菜单，拖拽中右键则中断本次拖拽），除每次会话收尾（pointerup / pointercancel /
 * blur → resetDragState）外，还必须在组件卸载（onBeforeUnmount）时摘除。
 * 漏掉卸载这条路的表现是：拖拽中途路由跳转 / 组件被强制销毁后，监听器残留并永久拦截右键菜单 ——
 * 平时测不出来，只在线上偶发「右键菜单失灵」。本文件把「卸载即摘除」钉成回归锚点。
 *
 * 进入拖拽态走外部拖拽源入口（`startExternalChordDrag`）：槽位入口的首步 `markDragSource` 会用
 * `CSS.escape`，jsdom 未实现该 API，与本用例要验证的「卸载清理」无关。
 * 监听器的挂载与摘除都与入口无关（都落在 pointerdown / onBeforeUnmount 这两处）。
 */
import { defineComponent } from 'vue';

import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { toChordId, toGroupId } from '@/domains/chord/theory/entityFactories';
import { nameToSegments, Tuning } from '@/domains/chord/theory/theory';
import { useLyricsDragDrop } from '@/domains/score/editor/composables/useLyricsDragDrop';

import type { Chord } from '@/domains/chord/types';

const chord: Chord = {
  id: toChordId('c_probe'),
  groupId: toGroupId('g1'),
  nameSegments: nameToSegments('C'),
  strings: [
    { fret: -1, preferFlat: false },
    { fret: 3, preferFlat: false },
    { fret: 2, preferFlat: false },
    { fret: 0, preferFlat: false },
    { fret: 1, preferFlat: false },
    { fret: 0, preferFlat: false },
  ],
  fretCount: 4,
  fretOffset: 0,
  tuning: Tuning.STANDARD,
  rootStringIndex: 1,
  createdAt: 1,
  updatedAt: 1,
};

/**
 * jsdom 未实现 PointerEvent（拖拽链路内部会 new PointerEvent('pointercancel')）。
 *
 * `pointerType` 缺省给 `''`：这是浏览器里 `new PointerEvent(type)` 的真实取值（合成事件没有指针设备），
 * 应用代码伪造的 cancel 事件正是这个形态。缺省成 `'mouse'` 会让任何合成事件都表现得像真实鼠标手势，
 * 把「伪造事件过不了活动指针守卫」这类缺陷在测试里抹平 —— 需要模拟真实鼠标/触摸手势时，
 * 由调用方显式传 `pointerType`（见 beginExternalDrag）。
 */
class MockPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly isPrimary = true;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
    this.pointerType = init.pointerType ?? '';
  }
}

/** 挂一个只调用 composable 的宿主组件，从闭包取回它的返回值（含卸载钩子的注册） */
const mountDragDrop = () => {
  let api!: ReturnType<typeof useLyricsDragDrop>;
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useLyricsDragDrop();
      },
      render: () => null,
    })
  );
  return { wrapper, api: () => api };
};

/** 外部拖拽源：按下即登记意图并挂上 contextmenu 监听；随后移动超阈值进入拖拽态。
 *  两个事件都显式带 `pointerType: 'mouse'`（垫片缺省是 `''`，那是合成事件的形态，不是鼠标手势）。 */
const beginExternalDrag = (api: ReturnType<typeof useLyricsDragDrop>) => {
  api.startExternalChordDrag(
    chord,
    new MockPointerEvent('pointerdown', {
      button: 0,
      pointerType: 'mouse',
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    }) as unknown as PointerEvent
  );
  // 移动必须带同样的 pointerId：活动指针守卫按它过滤，id 不同（或垫片缺省的 0）会被当成别的指针忽略
  window.dispatchEvent(
    new MockPointerEvent('pointermove', { pointerType: 'mouse', pointerId: 1, clientX: 200, clientY: 200 })
  );
};

beforeEach(() => {
  setActivePinia(createPinia());
  document.body.className = '';
  // jsdom 缺口：落点解析用 elementFromPoint 做命中测试，未实现则返回 null（不命中浮层/槽位）
  document.elementFromPoint = () => null;
  if (typeof globalThis.PointerEvent === 'undefined') {
    Object.defineProperty(globalThis, 'PointerEvent', { value: MockPointerEvent, configurable: true });
  }
});

describe('useLyricsDragDrop 全局监听器的生命周期', () => {
  it('拖拽中的右键被 contextmenu 监听拦截，并中断本次拖拽（监听器确实生效）', () => {
    const { wrapper, api } = mountDragDrop();
    beginExternalDrag(api());
    expect(api().isDragging.value).toBe(true);

    const contextMenu = new MouseEvent('contextmenu', { cancelable: true });
    window.dispatchEvent(contextMenu);

    expect(contextMenu.defaultPrevented).toBe(true);
    // 右键同时中断本次拖拽（resetDragState 收尾）：全局拖拽类名一并清掉
    expect(api().isDragging.value).toBe(false);
    expect(document.body.classList.contains('is-global-dragging')).toBe(false);

    wrapper.unmount();
  });

  it('拖拽中途卸载组件：全局监听随卸载摘除，不再拦截右键与指针移动', () => {
    const { wrapper, api } = mountDragDrop();
    beginExternalDrag(api());
    // 非空跑前提：卸载前确实处在拖拽态（isDragging 在卸载时不会被重置，泄漏的监听器会照旧生效）
    expect(api().isDragging.value).toBe(true);
    expect(document.body.classList.contains('is-global-dragging')).toBe(true);

    wrapper.unmount();
    expect(document.body.classList.contains('is-global-dragging')).toBe(false);

    // 残留 contextmenu 监听会因 isDragging 仍为 true 而继续吞掉右键菜单
    const contextMenu = new MouseEvent('contextmenu', { cancelable: true });
    window.dispatchEvent(contextMenu);
    expect(contextMenu.defaultPrevented).toBe(false);

    // 残留 pointermove 监听会在拖拽分支里调用 preventDefault（并继续接指针事件）。
    // 必须带与本次拖拽一致的 pointerId / pointerType：裸 MouseEvent 的 pointerId 是 undefined，
    // 会被活动指针守卫（见 useLyricsDragDrop 的活动指针过滤）先挡掉，根本走不到 preventDefault ——
    // 那样这条断言在「监听器残留」时也恒为 false，测不出任何东西。
    const move = new MockPointerEvent('pointermove', {
      pointerType: 'mouse',
      pointerId: 1,
      clientX: 300,
      clientY: 300,
      cancelable: true,
    });
    window.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(false);
  });
});

describe('useLyricsDragDrop 活动指针守卫', () => {
  it('非活动指针的 pointermove 被忽略 —— 第二支指针不改写本次拖拽', () => {
    const { wrapper, api } = mountDragDrop();
    // 用 'pen' 而非 'touch'：触摸端超阈值移动是「放弃长按」而不是起拖，拿不到「守卫放行自己那支」的正对照
    api().startExternalChordDrag(
      chord,
      new MockPointerEvent('pointerdown', {
        button: 0,
        pointerType: 'pen',
        pointerId: 1,
        clientX: 10,
        clientY: 10,
      }) as unknown as PointerEvent
    );

    // 另一支指针（pointerId 2）移动超阈值：守卫按活动指针过滤，不得起拖
    window.dispatchEvent(
      new MockPointerEvent('pointermove', { pointerType: 'pen', pointerId: 2, clientX: 300, clientY: 300 })
    );
    expect(api().isDragging.value).toBe(false);

    // 活动指针（pointerId 1）移动才起拖 —— 正对照：守卫确实放行它自己那一支，上一条断言不是空跑
    window.dispatchEvent(
      new MockPointerEvent('pointermove', { pointerType: 'pen', pointerId: 1, clientX: 300, clientY: 300 })
    );
    expect(api().isDragging.value).toBe(true);

    wrapper.unmount();
  });
});
