/**
 * 拇指拖拽：与几何映射互逆的拖动换算 + pointer capture 手势绑定。
 *
 * 从 vScrollbar.ts 抽出（原 885~952 行）。
 * 依赖 core（显隐/埋点）与 wheel（拖拽起手要掐断进行中的滚轮缓动），不被它们反向依赖。
 */
import { clamp } from '@/platform/utils/common';

import { setThumbsVisible, showThumb, stampInteraction } from './scrollbarCore';
import { getLength, getScrollPos } from './scrollbarGeometry';
import { cancelWheelAnim } from './scrollbarWheel';

import type { ScrollbarState } from './scrollbarCore';

/**
 * 拖拽拇指：与 computeThumbGeometry 完全互逆的映射——
 * 拇指位移 / 最大拇指位移 = 滚动位移 / 最大滚动位移，显式钳制防越界
 *
 * 换算的前提不成立（无行程 / 无可滚量）时不动宿主。
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
  if (axis === 'y') host.scrollTop = target;
  else host.scrollLeft = target;
};

export const attachThumbDrag = (state: ScrollbarState, axis: 'x' | 'y'): void => {
  const thumb = state.thumbs[axis];
  if (!thumb) return;
  thumb.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    cancelWheelAnim(state);
    // 拇指上的指针事件不冒泡到宿主（overlay 是兄弟节点），用户手势埋点必须在此自打
    stampInteraction(state);
    state.dragAxis = axis;
    state.dragStartPos = axis === 'y' ? e.clientY : e.clientX;
    state.dragStartScroll = getScrollPos(state.host, axis);
    try {
      thumb.setPointerCapture(e.pointerId);
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
    // 拖拽过程持续补打：判定窗口（120ms）短于拖拽时长，只在起点打点会让后半程被判为非交互
    stampInteraction(state);
    handleThumbPointerMove(state, e, axis);
    showThumb(state);
  });
  const endDrag = () => {
    // 守卫：endDrag 同时挂在 thumb 与 document 捕获阶段；
    // 未处于拖拽时（如页面其它位置的 pointerup）直接返回，避免误触发 showThumb
    // 导致所有实例滚动条一起显形（回归：之前无守卫，侧栏点击会让其它滚动条也显示）。
    if (state.dragAxis === null) return;
    state.dragAxis = null;
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
