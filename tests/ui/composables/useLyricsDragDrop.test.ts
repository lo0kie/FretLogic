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
import { defineComponent, ref } from 'vue';

import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { toChordId, toGroupId } from '@/domains/chord/theory/entityFactories';
import { nameToSegments, Tuning } from '@/domains/chord/theory/theory';
import { useLyricsDragDrop } from '@/domains/score/editor/composables/useLyricsDragDrop';

import type { Chord } from '@/domains/chord/types';
import type { Ref } from 'vue';

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
 *
 * `buttons` 同理必须显式传，且**模拟在途手势的 move 一律给 1**：MouseEvent 的缺省值是 0，而真实设备
 * 在按住期间派发的 pointermove 恒带 `buttons: 1`（鼠标与触摸实测一致，触摸端为 1 而非 0）。
 * 拖拽链路里的「pointerup 丢失后的自愈」守卫正是读它（见 useLyricsDragDrop / useSliderInteraction /
 * BaseSwitch 的同名守卫）—— 缺省成 0 的 move 在链路看来就是「所有键都已松开、手势早已结束」，
 * 于是拖拽会被当场收掉，用例红在「拖拽没起来」这种与用例意图无关的地方。
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
const mountDragDrop = (scrollRef?: Ref<HTMLElement | null>) => {
  let api!: ReturnType<typeof useLyricsDragDrop>;
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useLyricsDragDrop(scrollRef);
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
    new MockPointerEvent('pointermove', { pointerType: 'mouse', pointerId: 1, clientX: 200, clientY: 200, buttons: 1 })
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
      buttons: 1,
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
      new MockPointerEvent('pointermove', { pointerType: 'pen', pointerId: 1, clientX: 300, clientY: 300, buttons: 1 })
    );
    expect(api().isDragging.value).toBe(true);

    wrapper.unmount();
  });
});

// ---------------- 取消投放区 ----------------

const SLOT_KEY = 'line_1_char_0';
const LINE_ID = 'line_1';

/** 落点解析按帧合帧（见 useRafThrottle）：不跨帧就看不到落点结果 */
const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

/** 造一个槽位元素：`data-slot-key` 是拖拽寻址契约，`data-line-index` 供落点回填悬停行 */
const makeSlotEl = (): HTMLElement => {
  const slot = document.createElement('div');
  slot.dataset['slotKey'] = SLOT_KEY;
  slot.dataset['lineIndex'] = LINE_ID;
  document.body.appendChild(slot);
  return slot;
};

/** 取消区默认矩形：下半部落在下面谱面容器的底边滚动带内，同一条用例即可同时满足「命中取消区」与「贴边」 */
const CANCEL_ZONE_RECT = { left: 100, top: 700, right: 300, bottom: 760 };

/** 造一个取消区元素：jsdom 的元素矩形恒为 0，故显式给一段视口坐标 */
const makeCancelZoneEl = (rect = CANCEL_ZONE_RECT): HTMLElement => {
  const zone = document.createElement('div');
  zone.getBoundingClientRect = () =>
    ({
      ...rect,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }) as DOMRect;
  document.body.appendChild(zone);
  return zone;
};

/**
 * 造一个可滚动的谱面容器：边缘自动滚动读的是容器矩形与 scrollTop / clientHeight / scrollHeight，
 * 而 jsdom 的元素矩形与这几个度量恒为 0（判据全假、永远滚不动），故显式给一套 ——
 * 矩形底边 760、视口高 760px、内容 2000px：底边滚动带即 y ∈ (710, 780)，与取消区矩形下半部重叠。
 */
const makeScrollContainerEl = (): HTMLElement => {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 400, bottom: 760, width: 400, height: 760, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  Object.defineProperties(el, {
    clientHeight: { value: 760, configurable: true },
    scrollHeight: { value: 2000, configurable: true },
    scrollTop: { value: 0, writable: true, configurable: true },
    scrollLeft: { value: 0, writable: true, configurable: true },
  });
  document.body.appendChild(el);
  return el;
};

/**
 * 槽位拖拽源入口：按下事件必须经 DOM 派发 —— `handlePointerDown` 会读 `e.target.closest('button')`，
 * 直接造一个事件对象没有 target（`null.closest` 直接抛）。
 * 起点 (50, 50)、随即移动到 (200, 300) 超阈值起拖（活动指针守卫要求 pointerId 与按下一致）。
 */
const beginSlotDrag = (api: ReturnType<typeof useLyricsDragDrop>, slot: HTMLElement) => {
  let press!: PointerEvent;
  slot.addEventListener('pointerdown', e => void (press = e as PointerEvent), { once: true });
  slot.dispatchEvent(
    new MockPointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
      pointerType: 'mouse',
      pointerId: 1,
      clientX: 50,
      clientY: 50,
    })
  );
  api.handlePointerDown({ event: press, slotKey: SLOT_KEY, chord });
  window.dispatchEvent(
    new MockPointerEvent('pointermove', { pointerType: 'mouse', pointerId: 1, clientX: 200, clientY: 300, buttons: 1 })
  );
};

/** 派发一次拖拽中的指针移动（在途手势 ⇒ `buttons: 1`，见 MockPointerEvent 的注释） */
const movePointerTo = (x: number, y: number) => {
  window.dispatchEvent(
    new MockPointerEvent('pointermove', { pointerType: 'mouse', pointerId: 1, clientX: x, clientY: y, buttons: 1 })
  );
};

describe('useLyricsDragDrop 取消投放区', () => {
  beforeEach(() => {
    // jsdom 缺口：拖拽源高亮用 `CSS.escape` 寻址 `[data-slot-key="…"]`。本文件的槽位键是纯 ASCII
    // 标识符，转义与否等价，故缺了就透传补上（不覆盖已有实现）。
    if (typeof (globalThis as { CSS?: { escape?: unknown } }).CSS?.escape !== 'function')
      Object.defineProperty(globalThis, 'CSS', { value: { escape: (s: string) => s }, configurable: true });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('指针悬到取消区上：落点被清空，且压住同一帧内先排队的槽位落点', async () => {
    const { wrapper, api } = mountDragDrop();
    const slot = makeSlotEl();
    // 落点解析用 elementFromPoint 做命中测试：恒返回槽位元素 —— 取消区一旦失效，落点就会落到它身上
    document.elementFromPoint = () => slot;
    api().setCancelZoneEl(makeCancelZoneEl());

    beginSlotDrag(api(), slot);
    expect(api().isDragging.value).toBe(true);

    // 同一帧内先移到槽位上方、再移到取消区：落点必须按**最后一次**位置算，而那一次落在取消区上
    movePointerTo(200, 300);
    movePointerTo(150, 730);
    await nextFrame();

    expect(api().dragOverSlotKey.value).toBeNull();
    expect(api().isOverCancelZone.value).toBe(true);

    wrapper.unmount();
  });

  it('取消区之外：同一位置照常命中槽位（正对照，证明上一条不是空跑）', async () => {
    const { wrapper, api } = mountDragDrop();
    const slot = makeSlotEl();
    document.elementFromPoint = () => slot;
    api().setCancelZoneEl(makeCancelZoneEl());

    beginSlotDrag(api(), slot);
    movePointerTo(200, 300);
    await nextFrame();

    expect(api().dragOverSlotKey.value).toBe(SLOT_KEY);
    expect(api().isOverCancelZone.value).toBe(false);

    wrapper.unmount();
  });

  it('指针悬在取消区上：边缘自动滚动被停掉（取消区贴底边，否则一边想取消一边把谱面滚下去）', async () => {
    const container = makeScrollContainerEl();
    const { wrapper, api } = mountDragDrop(ref(container));
    const slot = makeSlotEl();
    document.elementFromPoint = () => slot;
    api().setCancelZoneEl(makeCancelZoneEl());

    beginSlotDrag(api(), slot);
    // 先移到取消区上并跨一帧：isOverCancelZone 由合帧回调写入，下一次 move 才吃得到它
    movePointerTo(150, 740);
    await nextFrame();
    expect(api().isOverCancelZone.value).toBe(true);

    movePointerTo(150, 741);
    const frozen = container.scrollTop;
    await nextFrame();
    await nextFrame();

    expect(container.scrollTop).toBe(frozen);
    wrapper.unmount();
  });

  it('同一条底边带上没有命中取消区：边缘自动滚动照常进行（正对照，证明上一条不是空跑）', async () => {
    const container = makeScrollContainerEl();
    const { wrapper, api } = mountDragDrop(ref(container));
    const slot = makeSlotEl();
    document.elementFromPoint = () => slot;
    // 取消区照挂，只挪到指针够不着的地方：压住的是「悬停命中」，不是「挂没挂」
    api().setCancelZoneEl(makeCancelZoneEl({ left: 500, top: 700, right: 700, bottom: 760 }));

    beginSlotDrag(api(), slot);
    movePointerTo(150, 740);
    await nextFrame();
    const before = container.scrollTop;

    movePointerTo(150, 741);
    await nextFrame();
    await nextFrame();

    expect(container.scrollTop).toBeGreaterThan(before);
    wrapper.unmount();
  });

  /**
   * 松手那条路径**绕过 schedule**：`handleGlobalPointerUp` 直接 flush 两条落点节流，用的是
   * 「最后一帧的位置」。上面四条用例都跨了帧（走 rAF 回调），恰好绕开了这条路 —— 而实现里
   * 「取消区判据必须落在合帧回调内部、不能放在 schedule 侧」这条注释，防的正是**这一条**路径：
   * 判据若留在 schedule 侧，flush 会用「进取消区之前」的旧坐标把落点写回槽位，松手反而落地。
   *
   * 观测点只能取「flush 期间有没有做落点解析」：落点状态（`dragOverSlotKey` / `isOverCancelZone`）
   * 在松手收尾的 `resetDragState → clearDragClasses` 里一律被清空，松手之后读不到那次 flush 的结果。
   * 于是记 `elementFromPoint` 的调用 —— 它正是「落点解析」这一步本身，而取消区命中要跳过的就是它
   * （见 `applyCancelZone`：「命中则清空落点…调用方据此跳过落点解析」）。
   */
  const spyHitTests = (slot: HTMLElement) => {
    const calls: [number, number][] = [];
    document.elementFromPoint = (x, y) => {
      calls.push([x, y]);
      return slot;
    };
    return calls;
  };

  it('松手走 flush 兜底：取消区判据在 flush 里同样生效（命中即跳过落点解析）', () => {
    const { wrapper, api } = mountDragDrop();
    const slot = makeSlotEl();
    const hitTests = spyHitTests(slot);
    api().setCancelZoneEl(makeCancelZoneEl());

    beginSlotDrag(api(), slot);
    // 不 await 跨帧：起拖与最后一次 move 的落点都还排在帧里，松手那次 flush 必然要执行它们
    // （帧回调是否也跑过不影响结论 —— 两条路径都该走同一判据）
    movePointerTo(200, 300);
    movePointerTo(150, 730);
    hitTests.length = 0;
    window.dispatchEvent(new MockPointerEvent('pointerup', { pointerType: 'mouse', pointerId: 1 }));

    expect(hitTests).toEqual([]);
    wrapper.unmount();
  });

  it('正对照：同一条 flush 路径落在槽位上时确实做了落点解析，且用的是最后一帧的坐标', () => {
    const { wrapper, api } = mountDragDrop();
    const slot = makeSlotEl();
    const hitTests = spyHitTests(slot);
    api().setCancelZoneEl(makeCancelZoneEl());

    beginSlotDrag(api(), slot);
    // 同样不 await 跨帧，但最后一次位置在槽位上：flush 必须拿**它**去解析落点
    movePointerTo(200, 300);
    hitTests.length = 0;
    window.dispatchEvent(new MockPointerEvent('pointerup', { pointerType: 'mouse', pointerId: 1 }));

    // 不锁调用**次数**（帧回调是否也跑过不影响这条路径的结论），只锁「解析发生了」与「用的是哪个坐标」——
    // 起拖那次是 (50, 50)，若 flush 拿的是它（或某个更早的位置），下面即红
    expect(hitTests.length).toBeGreaterThan(0);
    expect(hitTests.every(([x, y]) => x === 200 && y === 300)).toBe(true);
    wrapper.unmount();
  });
});
