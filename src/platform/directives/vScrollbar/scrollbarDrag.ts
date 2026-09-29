/**
 * 拇指拖拽：与几何映射互逆的拖动换算 + pointer capture 手势绑定。
 *
 * 从 vScrollbar.ts 抽出（原 885~952 行）。
 * 依赖 core（显隐/埋点）与 wheel（拖拽起手要掐断进行中的滚轮缓动），不被它们反向依赖。
 */
import { clamp } from '@/platform/utils/common';

import { setThumbsVisible, showThumb, snapCountOf, stampInteraction } from './scrollbarCore';
import { getLength, getScrollPos, snapScrollPos } from './scrollbarGeometry';
import { cancelWheelAnim } from './scrollbarWheel';

import type { ScrollbarState } from './scrollbarCore';

/**
 * 拖拽拇指：与 computeThumbGeometry 完全互逆的映射——
 * 拇指位移 / 最大拇指位移 = 滚动位移 / 最大滚动位移，显式钳制防越界
 *
 * 换算的前提不成立（无行程 / 无可滚量）时不动宿主。
 *
 * 宿主声明了分段吸附时，写回前先把目标量化到最近停靠点（见 snapScrollPos）：
 * 分段布局里滚动位置只有那几个合法值，按像素连续映射会停在两段中间（内容停在半页上、
 * 页码读数没有唯一答案）。量化后拖拽即「逐段吸附」，与宿主的 CSS 吸附也天然一致。
 */
export const handleThumbPointerMove = (state: ScrollbarState, e: PointerEvent, axis: 'x' | 'y'): void => {
  const { host } = state;
  const { endInset } = state.options;
  const realClient = getLength(host, axis, 'client');
  const clientLength = realClient - 2 * endInset;
  const scrollLength = getLength(host, axis, 'scroll');
  // 真实可滚动量：行程内缩不改变内容可滚距离
  const maxScroll = Math.max(0, scrollLength - realClient);
  const maxThumbOffset = Math.max(0, clientLength - state.thumbLens[axis]);
  if (maxThumbOffset <= 0 || maxScroll <= 0) return;
  const delta = (axis === 'y' ? e.clientY : e.clientX) - state.dragStartPos;
  const target = clamp(state.dragStartScroll + (delta / maxThumbOffset) * maxScroll, 0, maxScroll);
  const next = snapScrollPos(target, maxScroll, snapCountOf(state, axis));
  if (axis === 'y') host.scrollTop = next;
  else host.scrollLeft = next;
};

export const attachThumbDrag = (state: ScrollbarState, axis: 'x' | 'y'): void => {
  const thumb = state.thumbs[axis];
  if (!thumb) return;
  /** 本次拖拽取得的指针捕获（pointerId + 目标元素）；未取得时为 null，收尾据此主动释放 */
  let capturedPointerId: number | null = null;
  thumb.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return;
    // 已有在途拖拽（同一宿主上另一根手指正按着这条拇指）：不接管这次按下 —— 否则第二指会
    // 抢走指针捕获，并把 dragStartPos / dragStartScroll 覆盖成它按下时的位置，第一指的拖动
    // 当场跳到别处（捕获被接管后，第一指后续的 move 也不再派发到这条拇指上）
    if (state.dragAxis !== null) return;
    e.preventDefault();
    cancelWheelAnim(state);
    // 拇指上的指针事件不冒泡到宿主（overlay 是兄弟节点），用户手势埋点必须在此自打
    stampInteraction(state);
    state.dragAxis = axis;
    state.dragStartPos = axis === 'y' ? e.clientY : e.clientX;
    state.dragStartScroll = getScrollPos(state.host, axis);
    try {
      thumb.setPointerCapture(e.pointerId);
      capturedPointerId = e.pointerId;
    } catch {
      // jsdom 等环境无 pointer capture 能力，忽略
    }
    // 拖拽期间常显，不受自动隐藏影响
    setThumbsVisible(state, true);
    if (state.hideTimer !== null) {
      clearTimeout(state.hideTimer);
      state.hideTimer = null;
    }
  });
  thumb.addEventListener('pointermove', (e: PointerEvent) => {
    if (state.dragAxis !== axis) return;
    // 自愈：pointerup 未必收得到。拖拽途中按下右键会唤起原生上下文菜单，菜单持有指针之后左键的抬起
    // 不再派发给页面（拖出窗口松手同理），dragAxis 就此**永久**停在非空 —— 此后仅凭悬停移动就能把
    // 内容拖着走（「不点滑块也跟随移动」）。后续 move 的 buttons 为 0 即说明所有键都已松开，借此收尾；
    // 判据与 useSliderInteraction / BaseSwitch 的同名守卫同口径。
    if (e.buttons === 0) {
      endDrag();
      return;
    }
    // 拖拽过程持续补打：判定窗口（120ms）短于拖拽时长，只在起点打点会让后半程被判为非交互
    stampInteraction(state);
    handleThumbPointerMove(state, e, axis);
    showThumb(state);
  });
  /**
   * 主动释放拖拽期间取得的指针捕获。
   *
   * **不能指望隐式释放**：隐式释放挂在 pointerup / pointercancel 的派发上，而拖拽途中按下右键唤出的
   * 原生菜单会把这次手势的 pointerup 整个吞掉，那一条就不会发生 —— 捕获留在拇指上，此后页面内
   * **任意位置**的按下/抬起都被重定向到它（点哪都点不动，反而是滚动条跟着光标走）。与 BaseSwitch 的
   * abortPress 同因同口径。未持有捕获时调用是空操作，多释放一次没有副作用。
   */
  const releaseCapture = () => {
    const pointerId = capturedPointerId;
    capturedPointerId = null;
    if (pointerId === null) return;
    try {
      thumb.releasePointerCapture(pointerId);
    } catch {
      // 指针已失效 / 环境无 pointer capture 能力，忽略
    }
  };
  const endDrag = () => {
    // 守卫：endDrag 同时挂在 thumb 与 document 捕获阶段；
    // 未处于拖拽时（如页面其它位置的 pointerup）直接返回，避免误触发 showThumb
    // 导致所有实例滚动条一起显形（回归：之前无守卫，侧栏点击会让其它滚动条也显示）。
    if (state.dragAxis === null) return;
    state.dragAxis = null;
    releaseCapture();
    showThumb(state);
  };
  thumb.addEventListener('pointerup', endDrag);
  thumb.addEventListener('pointercancel', endDrag);
  document.addEventListener('pointerup', endDrag, true);
  document.addEventListener('pointercancel', endDrag, true);
  state.disposers.push(() => {
    document.removeEventListener('pointerup', endDrag, true);
    document.removeEventListener('pointercancel', endDrag, true);
  });
};
