/**
 * 指板交互 —— 两块回归锚点：
 *
 * ① **滚动守卫**：「只有**起手落在可编辑格位**（空弦区 0 / 品格区 1..fretCount）的触摸手势才拦下
 *    外层容器滚动」。
 *
 * 背景：指板根上原先挂着 `touch-action: none`，它作用于整棵子树，等于把名字区、空弦区、板身左右与
 * 底部留白一起拦下 —— 手指落在指板任何位置都滚不动外层容器。改成按起手位置逐次判定后，
 * 有三件事会静默退化，本文件把它们钉住：
 *
 *  1. **判定基准是「起手」而不是「当前位置」**：触摸事件一路冒泡到根，与命中的是 SVG 内的音符还是根无关，
 *     但坐标必须取 `pointerdown` 那一刻的 —— 拿 `touchmove` 的坐标去判，手指滑出可编辑格位后判定会翻转；
 *  2. **起手登记必须在捕获阶段**：名字区在自己的 `pointerdown` 上 `stop` 了冒泡（见 Fretboard.vue），
 *     bubble 阶段根本收不到那里的起手 —— 标志会滞留在上一次手势的判定上，
 *     于是「上一次在品格区拖动、这一次在名字区上滑」会被错误地拦下。本文件用同构的
 *     `@pointerdown.stop` 子节点复现这条路径；
 *  3. **只在 touchmove 上拦**：轻点（无移动）不产生 touchmove，合成 click 因此不受影响 ——
 *     这是「换成自行 preventDefault」后必须保住的既有行为（本文件只钉「谁被拦」，点击链路由
 *     ActionButton / 槽位那些用例覆盖）。
 *
 * ② **空弦区与品格区同属一条滑动绘制路径**：空弦格就是品位 0，按下即按模式完成首次切换，横向滑过
 *    逐弦落笔。此前空弦区在 `pointerdown` 上早退成一次三态循环，拖动完全无响应 —— 这两条用例把
 *    「滑得动」与「按下的弦决定本次是添加还是删除」钉住。
 *
 * 断言取 `dispatchEvent` 的返回值（`preventDefault` 被调用即为 false），不引任何浏览器行为 ——
 * jsdom 不做真实滚动，「能不能滚」本身只能靠真机或 Playwright 验证。
 */
import { defineComponent, h, nextTick } from 'vue';

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import { toChordId, toGroupId } from '@/domains/chord/theory/entityFactories';
import { nameToSegments, Tuning } from '@/domains/chord/theory/theory';
import { useFretboardInteraction } from '@/domains/fretboard/composables/useFretboardInteraction';
import { MUTED_FRET } from '@/domains/fretboard/constants';
import { INTERACTIVE_GEOMETRY, interactiveGeometryFor } from '@/domains/fretboard/model/interactiveGeometry';

import type { Chord } from '@/domains/chord/types';
import type { GuitarStringsModel } from '@/domains/fretboard/types';

/** jsdom 未实现 PointerEvent（守卫按 `pointerType` 分流，故必须显式带上它） */
class MockPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly isPrimary = true;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? '';
  }
}

const chord: Chord = {
  id: toChordId('c_scroll_guard'),
  groupId: toGroupId('g1'),
  nameSegments: nameToSegments('C'),
  strings: [
    { fret: 0, preferFlat: false },
    { fret: 1, preferFlat: false },
    { fret: 0, preferFlat: false },
    { fret: 2, preferFlat: false },
    { fret: 3, preferFlat: false },
    { fret: 0, preferFlat: false },
  ],
  fretCount: 5,
  fretOffset: 0,
  tuning: Tuning.STANDARD,
  rootStringIndex: 0,
  createdAt: 1,
  updatedAt: 1,
};

/** 零品窗口那张图的几何：本用例的 `fretOffset` 为 0，纵向基准与它同源 */
const geometry = interactiveGeometryFor(true);

/**
 * 挂一块与 Fretboard.vue 同构的指板：根节点接 `fretBoardRef`，名字区子节点在自己的
 * `pointerdown` 上 `stop` 冒泡。板身矩形按几何给足尺寸（jsdom 的 getBoundingClientRect 恒为 0，
 * 不给就一律换算成 null，本用例会全数假绿）。
 *
 * `await nextTick()` 不可省：监听器由 vueuse 的 `useEventListener` 挂在**模板 ref 的 watch** 上，
 * 挂载当刻 ref 还是 null，要等一次刷新才真正 addEventListener。少了它，事件派发时监听器尚未挂上，
 * 「该拦的没拦」会被误读成实现有 bug（本用例第一次就踩了这个坑）。
 */
const mountBoard = async (onStringsChange?: (strings: GuitarStringsModel) => void) => {
  const wrapper = mount(
    defineComponent({
      setup() {
        useFretboardInteraction(
          { chord },
          () => {},
          onStringsChange ?? (() => {}),
          () => {}
        );
      },
      render: () =>
        h('div', { ref: 'fretBoardRef' }, [
          h('div', { class: 'name-zone', onPointerdown: (e: Event) => e.stopPropagation() }),
        ]),
    })
  );
  await nextTick();

  const board = wrapper.element as HTMLElement;
  // jsdom 未实现指针捕获：不打桩则滑动绘制会话的 `begin` 会因 `setPointerCapture` 抛错而提前返回
  //（按设计「只当一次普通点击」），空弦区那两条用例会假绿成「滑不动」。打桩即补齐浏览器能力，
  // 与「合成 PointerEvent 无法让 setPointerCapture 成功」那条真机约束无关 —— 真机路径由 tests/browser 覆盖。
  board.setPointerCapture = () => {};
  board.releasePointerCapture = () => {};
  const rawHeight = geometry.chordNameBlockH + geometry.boardBoxHeight(chord.fretCount);
  // 1:1 反算（宽 = 板宽、高 = rawHeight ⇒ scaleX/scaleY 均为 1），故板内偏移即客户端坐标
  board.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: INTERACTIVE_GEOMETRY.boardWidth(chord.strings.length),
      height: rawHeight,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;

  const nameZone = board.querySelector('.name-zone') as HTMLElement;
  return { wrapper, board, nameZone };
};

/** 板内纵坐标：各区域的代表点（横向恒取第 0 弦，避免落进横向越界分支） */
const Y = {
  /** 名字区（高度之内） */
  nameZone: geometry.chordNameBlockH / 2,
  /** 空弦区（品位 0）正中 */
  openString: geometry.chordNameBlockH + geometry.markerBlockH / 2,
  /** 第 1 品正中 */
  fret1: geometry.chordNameBlockH + geometry.gridTop + geometry.fretHeight / 2,
  /** 品格区之下（板身底部留白） */
  belowGrid: geometry.chordNameBlockH + geometry.gridTop + chord.fretCount * geometry.fretHeight + geometry.edgePad / 2,
};

const X = INTERACTIVE_GEOMETRY.firstStringX;

/** 第 sIdx 根弦的板内横坐标（从几何派生，不把弦距写死进用例） */
const xOf = (sIdx: number) => INTERACTIVE_GEOMETRY.firstStringX + sIdx * INTERACTIVE_GEOMETRY.stringSpacing;

/** 派发一次可取消的 touchmove，返回是否被守卫拦下（preventDefault 被调用 ⇒ dispatchEvent 返回 false） */
const touchMoveBlocked = (target: HTMLElement) =>
  !target.dispatchEvent(new Event('touchmove', { bubbles: true, cancelable: true }));

/** 在指定元素上登记一次起手（默认第 0 弦、触摸指针） */
const pointerDownAt = (target: HTMLElement, y: number, pointerType = 'touch', x = X) =>
  void target.dispatchEvent(
    new MockPointerEvent('pointerdown', { bubbles: true, button: 0, clientX: x, clientY: y, pointerType })
  );

/** 左键抬起：滑动绘制的末笔由它补齐到松手那一格（见 useFretboardInteraction 的 handlePointerUp） */
const pointerUpAt = (target: HTMLElement, x: number, y: number) =>
  void target.dispatchEvent(new MockPointerEvent('pointerup', { bubbles: true, button: 0, clientX: x, clientY: y }));

describe('指板滚动守卫：按起手位置决定是否拦下外层容器滚动', () => {
  it.each([
    { label: '起手在第 1 品格内 ⇒ 拦下（滑动绘制要独占这次手势）', y: Y.fret1, expected: true },
    { label: '起手在空弦区（品位 0）⇒ 拦下（空弦格同属滑动绘制）', y: Y.openString, expected: true },
    { label: '起手在名字区 ⇒ 放行', y: Y.nameZone, expected: false },
    { label: '起手在品格区之下的底部留白 ⇒ 放行', y: Y.belowGrid, expected: false },
  ])('$label', async ({ y, expected }) => {
    const { board } = await mountBoard();

    pointerDownAt(board, y);

    expect(touchMoveBlocked(board)).toBe(expected);
  });

  it('判定基准是起手位置：起手在板身留白，随后滑到格子里也不拦', async () => {
    const { board } = await mountBoard();

    pointerDownAt(board, Y.belowGrid);

    // 滑到第 1 品之内（touchmove 的坐标一律不参与判定）
    const move = new Event('touchmove', { bubbles: true, cancelable: true });
    Object.defineProperty(move, 'touches', { value: [{ clientX: X, clientY: Y.fret1 }] });
    expect(board.dispatchEvent(move)).toBe(true);
  });

  it('名字区的起手必须被捕获阶段收到：上一次在品格区拖动，不残留成这一次的判定', async () => {
    const { board, nameZone } = await mountBoard();

    // 上一次手势：起手在品格区 ⇒ 标志置为「拦」
    pointerDownAt(board, Y.fret1);
    expect(touchMoveBlocked(board)).toBe(true);

    // 这一次手势：起手在名字区 —— 那里的 pointerdown 被 stop 了冒泡，只有捕获阶段收得到
    pointerDownAt(nameZone, Y.nameZone);

    expect(touchMoveBlocked(board)).toBe(false);
  });

  it('鼠标起手在品格区也不拦（touchmove 只属于触摸手势）', async () => {
    const { board } = await mountBoard();

    pointerDownAt(board, Y.fret1, 'mouse');

    expect(touchMoveBlocked(board)).toBe(false);
  });
});

/**
 * 空弦区（品位 0）与品格区共用同一条滑动绘制路径 —— 两条用例分别钉住「按下的弦决定本次是添加还是
 * 删除」这一对模式。末笔由 pointerup 直发补齐（见 handlePointerUp），故不必驱动 rAF 合帧。
 */
describe('空弦区：与品格区共用同一条滑动绘制路径', () => {
  it('起手在按品的弦的空弦位 ⇒ 添加模式，横向滑过即逐弦设空弦', async () => {
    const changes: GuitarStringsModel[] = [];
    const { board } = await mountBoard(strings => changes.push(strings));

    // 第 1 弦按在 1 品 ⇒ 起手落在它的空弦位是「添加」
    pointerDownAt(board, Y.openString, 'mouse', xOf(1));
    // 末笔补到第 3 弦的空弦位（该弦按在 2 品）
    pointerUpAt(board, xOf(3), Y.openString);

    // 会话没开时 changes 为空，`.at(-1)` 是 undefined —— 断言照样红，不会静默通过
    const last = changes.at(-1);
    expect(last?.[1]?.fret).toBe(0);
    expect(last?.[3]?.fret).toBe(0);
  });

  it('起手在空弦的弦上 ⇒ 删除模式，横向滑过即逐弦抹掉空弦', async () => {
    const changes: GuitarStringsModel[] = [];
    const { board } = await mountBoard(strings => changes.push(strings));

    // 第 0 弦本就是空弦 ⇒ 起手即进入「删除」
    pointerDownAt(board, Y.openString, 'mouse', xOf(0));
    // 末笔补到第 2 弦的空弦位（同为 0 品）
    pointerUpAt(board, xOf(2), Y.openString);

    const last = changes.at(-1);
    expect(last?.[0]?.fret).toBe(MUTED_FRET);
    expect(last?.[2]?.fret).toBe(MUTED_FRET);
  });
});
