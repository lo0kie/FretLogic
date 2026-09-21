/**
 * 轨道交互：点击跳转 / 翻页、长按连续跟随。
 *
 * 从 vScrollbar.ts 抽出（原 997~1166 行）。
 * 依赖 core 与 wheel（跳转前掐断缓动），并被 overlay 单向依赖（overlay 建好轨道后挂这些监听）。
 */

import { clamp } from '@/platform/utils/common';
import { resolveScrollBehavior } from '@/platform/utils/motion';

import { stampInteraction } from './scrollbarCore';
import { computeThumbGeometry, getLength, getScrollPos } from './scrollbarGeometry';
import { cancelWheelAnim } from './scrollbarWheel';

import type { ScrollbarState } from './scrollbarCore';

/** 轨道 jump：滚动到使拇指居中于指针位置。behavior 默认 'smooth'；
 *  长按连续跟随（含激活首跳、指针移动、静止时尺寸变化补发）也统一传 'smooth'，
 *  让滚动以缓动方式贴到鼠标处，而非瞬时裸跳 */
export const jumpToPointer = (
  state: ScrollbarState,
  axis: 'x' | 'y',
  e: { clientX: number; clientY: number },
  behavior: ScrollBehavior = 'smooth'
): void => {
  const { host } = state;
  const { endInset } = state.options;
  const realClient = axis === 'y' ? host.clientHeight : host.clientWidth;
  const clientLength = realClient - 2 * endInset;
  const scrollLength = getLength(host, axis, 'scroll');
  const maxScroll = Math.max(0, scrollLength - realClient);
  if (maxScroll <= 0) return;
  const hostRect = host.getBoundingClientRect();
  const rawPos = axis === 'y' ? e.clientY - hostRect.top : e.clientX - hostRect.left;
  const clickPos = clamp(rawPos - endInset, 0, clientLength);
  // 与显示映射互逆：点击位 → 拇指行程占比 → 滚动量（拇指居中于点击位）。
  // 偏移量用实际 thumbSize（可能被 minThumbSize 钳制）的一半，保证超长内容下落点仍贴合指针；
  // 旧的 realClient/2 写法仅在拇指未被钳制时近似成立，长内容下误差随可滚动长度线性放大。
  const { thumbSize } = computeThumbGeometry(scrollLength, clientLength, 0, state.options.minThumbSize, maxScroll);
  const maxThumbOffset = Math.max(1, clientLength - thumbSize);
  const target = clamp(((clickPos - thumbSize / 2) / maxThumbOffset) * maxScroll, 0, maxScroll);
  cancelWheelAnim(state);
  host.scrollTo(axis === 'y' ? { top: target, behavior } : { left: target, behavior });
};

/** 轨道点击（thumb 之外、非抑制态）：'jump' 直接跳到指针处，'page' 以拇指当前位置为界翻页（同原生滚动条）。 */
export const handleTrackAreaClick = (state: ScrollbarState, axis: 'x' | 'y', e: MouseEvent): void => {
  const { host } = state;
  const { endInset } = state.options;
  const realClient = axis === 'y' ? host.clientHeight : host.clientWidth;
  // 有效轨道长度扣除两侧留白，点击位同样扣除上/左缘留白
  const clientLength = realClient - 2 * endInset;
  const scrollLength = getLength(host, axis, 'scroll');
  if (scrollLength <= clientLength) return;
  const current = getScrollPos(host, axis);
  if (state.options.trackClick === 'jump') {
    jumpToPointer(state, axis, e);
    return;
  }
  const hostRect = host.getBoundingClientRect();
  const rawPos = axis === 'y' ? e.clientY - hostRect.top : e.clientX - hostRect.left;
  const clickPos = clamp(rawPos - endInset, 0, clientLength);
  // 翻页方向以拇指当前位置为界（同原生滚动条）：点在拇指上方/左侧 = 向回翻，反之向前翻
  const geo = computeThumbGeometry(
    scrollLength,
    clientLength,
    current,
    state.options.minThumbSize,
    Math.max(0, scrollLength - realClient)
  );
  const thumbCenter = endInset + geo.thumbOffset + geo.thumbSize / 2;
  const forward = clickPos > thumbCenter;
  const page = realClient * 0.8;
  const next = current + (forward ? page : -page);
  cancelWheelAnim(state);
  host.scrollTo({
    [axis === 'y' ? 'top' : 'left']: clamp(next, 0, Math.max(0, scrollLength - realClient)),
    behavior: resolveScrollBehavior('smooth'),
  });
};

/** 轨道点击：thumb 之外的区域按策略翻页或跳转（监听挂在 track overlay 上）；
 *  长按轨道时持续滚动到指针位置——按住期间用指针捕获把整个手势事件稳定钉在 track 上，
 *  即使光标移出细窄轨道甚至移到内容区也继续「滚到此处」；每次移动都用最新指针位置与最新滚动
 *  度量重算目标，因此可滚动高度/宽度在按住期间变化也能持续正确跟随（修复高度变化后不再跟随的缺陷）。 */
export const attachTrackClick = (state: ScrollbarState, axis: 'x' | 'y'): void => {
  const track = state.tracks[axis];
  if (!track) return;
  const LONG_PRESS_MS = 300;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let suppressClick = false;
  let longPressActive = false;
  const cancelLongPress = (): void => {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };
  // 长按激活后，按住期间持续把滚动贴住鼠标：事件经指针捕获已稳定落在 track 上，
  // 每次移动都用最新指针位置与最新滚动度量（scrollHeight/Width、clientHeight/Width）重算目标，
  // 因此可滚动高度/宽度在按住期间变化也能持续正确跟随。
  const reJump = (e: { clientX: number; clientY: number }): void => {
    if (!longPressActive) return;
    // 长按跟随的每次重算都补打用户手势时间戳：判定窗口短于按住时长
    stampInteraction(state);
    state.trackPressPointer = { clientX: e.clientX, clientY: e.clientY };
    jumpToPointer(state, axis, e, 'smooth');
  };
  const onMove = (e: PointerEvent): void => {
    reJump(e);
  };
  const endPress = (e: PointerEvent): void => {
    cancelLongPress();
    if (!longPressActive) return;
    longPressActive = false;
    state.trackPressAxis = null;
    state.trackPressPointer = null;
    state.host.style.userSelect = '';
    try {
      track.releasePointerCapture(e.pointerId);
    } catch {
      // 部分环境无 pointer capture，忽略
    }
    // 松手后紧随的 click 由 click 处理器用 suppressClick 抑制；延后清空避免污染下一次点击。
    setTimeout(() => {
      suppressClick = false;
    }, 0);
  };
  track.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0 || state.options.trackClick === 'none') return;
    // 轨道上的指针事件不冒泡到宿主（overlay 是兄弟节点），用户手势埋点必须在此自打
    stampInteraction(state);
    // 事件落到轨道说明指针处不是拇指；长按（300ms）后开始「滚到此处」并持续跟随
    suppressClick = false;
    longPressActive = false;
    cancelLongPress();
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      suppressClick = true;
      longPressActive = true;
      state.trackPressAxis = axis;
      state.trackPressPointer = { clientX: e.clientX, clientY: e.clientY };
      state.host.style.userSelect = 'none'; // 按住拖拽期间禁止选中文本
      // 指针捕获：把后续 pointermove/up 稳定重定向到 track，光标移出细窄轨道或移到内容区仍持续响应，
      // 避免此前「指针移出轨道即取消长按、跟随中断」的缺陷。
      try {
        track.setPointerCapture(e.pointerId);
      } catch {
        // 部分环境无 pointer capture，忽略（退化为仅 track 内跟随）
      }
      reJump(e);
    }, LONG_PRESS_MS);
  });
  // 注意：不再在 pointerleave 上取消长按——细窄轨道指针轻微移出即误取消；改用指针捕获后
  // 按住期间事件稳定落在 track 上，跟随不受指针移出轨道影响。
  track.addEventListener('pointermove', onMove);
  track.addEventListener('pointerup', endPress);
  track.addEventListener('pointercancel', endPress);
  // 兜底：pointer capture 在极少数场景下可能未能把 up/cancel 重定向回 track
  // （例如快速二次按下打断了捕获），届时 track 自身的 up/cancel 监听不会触发，
  // longPressActive 会永久卡 true，之后任何静止悬停都会被 reJump 误判为长按跟随。
  // 在 document 捕获阶段兜底调用同一个 endPress（内部已按 longPressActive 判空，幂等安全）。
  document.addEventListener('pointerup', endPress, true);
  document.addEventListener('pointercancel', endPress, true);
  state.disposers.push(() => {
    // 兜底清理：updated 重建路径摘除监听时，若长按定时器仍挂起或 userSelect 写死，必须一并复位，
    // 否则旧宿主残留 userSelect:'none'（V5）。
    cancelLongPress();
    if (longPressActive) {
      longPressActive = false;
      state.host.style.userSelect = '';
    }
    document.removeEventListener('pointerup', endPress, true);
    document.removeEventListener('pointercancel', endPress, true);
  });
  track.addEventListener('click', (e: MouseEvent) => {
    if (state.options.trackClick === 'none') return;
    const thumb = state.thumbs[axis];
    if (thumb && (thumb === e.target || thumb.contains(e.target as Node))) return;
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    handleTrackAreaClick(state, axis, e);
  });
};
