/**
 * 松手后补派的 click 落在哪里（回归锚点）。
 *
 * 把手（折叠头、面板标题行）往往同时是点击目标，而 sortablejs 的 fallback 通道在起拖瞬间
 * （mousedown）就置位内部的 ignoreNextClick、把紧随的原生 click 一律吞掉（sortablejs #1184）。
 * 本组合式为此在松手时补派一个合成 click，把「纯点击」的那一次找回来。
 *
 * 钉住的缺陷：「算拖拽还是算点击」若按**按下点 ↔ 松手点的直线距离**量，拖出去再拖回原位时
 * 两端几乎重合，一次真拖会被判成纯点击 —— 补派的 click 正好落在松手的那个把手上，
 * 用户看到的是「拖了但没换位，面板反而被点开或收起了」。判据改为「影像是否已浮现」后，
 * 阈值一越过就锁存，两端重合也仍是真拖。
 *
 * 同一处的第三条分支：触屏「长按 = 右键」弹出菜单后，这次松手同样不该再补派 click
 * （`longPressConsumed`）—— 判据是「本次手势已被长按消费」，与上面两条并列。
 *
 * 断言对象是**用户可感知的结果**：把手上的点击处理器收到几次。
 * sortablejs 用桩替身：本文件驱动的是「起拖 / 松手」两个回调与阈值判定，而真 sortable
 * 需要布局与指针命中测试（jsdom 都没有）。
 */
import { defineComponent, h, nextTick, ref } from 'vue';

import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GLOBAL_DRAGGING_CLASS, useSortableList } from '@/platform/composables/useSortableList';
import { DRAG_LONG_PRESS_DELAY } from '@/platform/composables/useSortableList/constants';

import type { VueWrapper } from '@vue/test-utils';

/** 桩替身捕获的 Sortable 选项：本文件只驱动 onStart / onEnd 两个回调 */
const harness = vi.hoisted(() => ({ options: [] as Record<string, unknown>[] }));

vi.mock('sortablejs', () => ({
  default: class {
    constructor(_element: unknown, options: Record<string, unknown>) {
      harness.options.push(options);
    }
    destroy() {
      /* 桩替身：真 sortable 的摘监听/摘克隆对本文件无意义 */
    }
    option() {
      /* 桩替身：本文件不传 handle / touchHandle，不会走到这里 */
    }
  },
}));

/** 本文件只用到这两个回调，故按实际驱动方式声明，不引 @types/sortablejs 的完整事件类型 */
interface CapturedOptions {
  onStart(event: { item: HTMLElement; originalEvent: Event }): void;
  onEnd(event: { item: HTMLElement; originalEvent: Event; oldIndex: number; newIndex: number }): void;
}

/**
 * jsdom 未实现 PointerEvent，而链路里要读 `pointerType`（触摸与鼠标的起拖阈值不同）。
 * 只补被读到的两个字段：本文件不对它做 `instanceof`，故不必挂到 globalThis 上。
 */
class MockPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
    this.pointerType = init.pointerType ?? '';
  }
}

const CARDS = ['a', 'b'];

/**
 * jsdom 的 `MouseEvent` 构造器会拒绝 vitest 注入的全局 `window`（`view` 必须是 jsdom 自己那个
 * Window 实例），而「纯点击」那条路补派的合成 click 带 `view: window` —— 直接跑会在微任务里抛
 * `member view is not of type Window`，把整个文件变成「未处理异常」。
 *
 * 垫一层只把 `view` 摘掉的子类：浏览器里那次构造本身合法，摘掉 view 不影响本文件要看的传播链
 * （落点、冒泡、以及 document 捕获层的拦截都还在）。与下面 MockPointerEvent 同属 jsdom 缺口垫片。
 */
class ViewlessMouseEvent extends MouseEvent {
  constructor(type: string, init: MouseEventInit = {}) {
    super(type, { ...init, view: null });
  }
}

let wrapper: VueWrapper | null = null;

const captured = (): CapturedOptions => harness.options[0] as unknown as CapturedOptions;

/** 等实例建起来：watcher 先等一帧 DOM，start 里还有一次 sortablejs 的动态 import */
const waitForInstance = async () => {
  for (let attempt = 0; attempt < 20 && harness.options.length === 0; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  expect(harness.options.length).toBeGreaterThan(0);
};

/** 挂一个最小宿主：两张卡片、每张一个把手（把手同时是点击目标），返回被点到的把手 id */
const mountList = async (options: { longPressMenu?: boolean } = {}) => {
  const clicked: string[] = [];
  const listRef = ref<HTMLElement | null>(null);

  wrapper = mount(
    defineComponent({
      setup() {
        useSortableList<string>({
          target: listRef,
          items: () => CARDS,
          enabled: true,
          onReorder: () => undefined,
          ...(options.longPressMenu ? { longPressMenu: { onDismiss: () => undefined } } : {}),
        });
        return () =>
          h(
            'div',
            {
              ref: (el: unknown) => {
                listRef.value = el instanceof HTMLElement ? el : null;
              },
            },
            CARDS.map(id =>
              h('div', { 'key': id, 'class': 'card', 'data-card': id }, [
                h('button', { type: 'button', class: 'grip', onClick: () => clicked.push(id) }, id),
              ])
            )
          );
      },
    }),
    { attachTo: document.body }
  );

  await waitForInstance();
  return { clicked, root: wrapper.element as HTMLElement };
};

/** 取一张卡片与它的把手 */
const parts = (root: HTMLElement, id: string) => {
  const card = root.querySelector<HTMLElement>(`[data-card="${id}"]`)!;
  return { card, grip: card.querySelector<HTMLElement>('.grip')! };
};

/** 按下把手并起拖（fallback 通道下 mousedown 即起拖，无需长按） */
const beginDrag = (grip: HTMLElement, card: HTMLElement, at: { x: number; y: number }) => {
  const press = new MockPointerEvent('pointerdown', {
    bubbles: true,
    button: 0,
    pointerType: 'mouse',
    pointerId: 1,
    clientX: at.x,
    clientY: at.y,
  });
  grip.dispatchEvent(press);
  captured().onStart({ item: card, originalEvent: press });
};

/** 松手：真实浏览器随后还会补派一次 click，由用例自己补 */
const endDrag = (grip: HTMLElement, card: HTMLElement, at: { x: number; y: number }) => {
  const release = new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y });
  grip.dispatchEvent(release);
  captured().onEnd({ item: card, originalEvent: release, oldIndex: 0, newIndex: 0 });
};

const movePointer = (at: { x: number; y: number }) => {
  document.dispatchEvent(
    new MockPointerEvent('pointermove', {
      bubbles: true,
      pointerType: 'mouse',
      pointerId: 1,
      clientX: at.x,
      clientY: at.y,
    })
  );
};

beforeEach(() => {
  harness.options.length = 0;
  document.body.className = '';
  // jsdom 未实现 Web Animations：复位动画只在本用例里被调到，桩掉即可（动画本身不是断言对象）
  Element.prototype.animate = vi.fn(() => ({ cancel() {} })) as unknown as Element['animate'];
  Object.defineProperty(globalThis, 'MouseEvent', { value: ViewlessMouseEvent, configurable: true });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('松手后补派的 click', () => {
  it('拖出去又拖回原位：手势已成立，补派的 click 被吞，把手不被点开', async () => {
    const { clicked, root } = await mountList();
    const { card, grip } = parts(root, 'a');

    beginDrag(grip, card, { x: 100, y: 100 });
    // 先拖出去（越阈值 ⇒ 影像浮现、手势成立），再拖回按下点：净位移 0，但手势并未撤销
    movePointer({ x: 100, y: 200 });
    movePointer({ x: 100, y: 100 });
    expect(document.body.classList.contains(GLOBAL_DRAGGING_CLASS)).toBe(true);

    endDrag(grip, card, { x: 100, y: 100 });
    // 浏览器在 mouseup 之后补派的那一次 click
    grip.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await nextTick();

    expect(clicked).toEqual([]);
  });

  it('没动过的纯点击：把手仍收到一次 click（补偿补派那条路没被误伤）', async () => {
    const { clicked, root } = await mountList();
    const { card, grip } = parts(root, 'a');

    beginDrag(grip, card, { x: 100, y: 100 });
    // 非空跑前提：确实没越阈值 —— 影像未浮现，走的是「纯点击」那条路
    expect(document.body.classList.contains(GLOBAL_DRAGGING_CLASS)).toBe(false);

    endDrag(grip, card, { x: 100, y: 100 });
    await nextTick();

    expect(clicked).toEqual(['a']);
  });

  /**
   * 触屏上「长按 = 右键」：到点弹菜单是一次**完整手势**，同一次手势不该再被当成一次点击 ——
   * 否则折叠头当场收起 / 卡片当场选中，与刚弹出的菜单同时生效（长按一次干了两件事）。
   */
  it('触摸长按弹出菜单：这次松手不补派 click，把手也不被原生 click 点开', async () => {
    const { clicked, root } = await mountList({ longPressMenu: true });
    const { card, grip } = parts(root, 'a');

    // 宿主的委托监听就挂在 document 上：用收到的次数证明长按确实到点（非空跑前提）
    let menuOpened = 0;
    const countContextMenu = () => {
      menuOpened += 1;
    };
    document.addEventListener('contextmenu', countContextMenu);

    try {
      // 长按定时器在 pointerdown 那一刻登记，故假时钟必须先于按下装好（否则推的是真时钟）
      vi.useFakeTimers();
      const press = new MockPointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        pointerType: 'touch',
        pointerId: 2,
        clientX: 100,
        clientY: 100,
      });
      grip.dispatchEvent(press);
      captured().onStart({ item: card, originalEvent: press });

      // 按住不动，推进长按定时器
      vi.advanceTimersByTime(DRAG_LONG_PRESS_DELAY + 10);
      expect(menuOpened).toBe(1);

      const release = new MockPointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        pointerType: 'touch',
        pointerId: 2,
        clientX: 100,
        clientY: 100,
      });
      grip.dispatchEvent(release);
      captured().onEnd({ item: card, originalEvent: release, oldIndex: 0, newIndex: 0 });
      // 浏览器在 pointerup 之后补派的那一次 click
      grip.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await nextTick();

      expect(clicked).toEqual([]);
    } finally {
      vi.useRealTimers();
      document.removeEventListener('contextmenu', countContextMenu);
    }
  });
});
