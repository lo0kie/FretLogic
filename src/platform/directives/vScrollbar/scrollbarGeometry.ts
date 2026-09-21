/**
 * 滚动条的纯几何层：布局读取与位置换算。
 *
 * 从 vScrollbar.ts 抽出（原 320~321、403~412、419~461、232~246、547~572 行）。
 * 全部为「无状态、只依赖入参」的函数与常量：不碰 ScrollbarState、不写 DOM，
 * 故可被 core / drag / wheel / track 各行为模块安全共用而不产生循环依赖。
 */

import { clamp } from '@/platform/utils/common';

/** 拇指可视粗细（px） */
export const THICKNESS = 6;
/** 气泡单行读数的半高上界（px）：仅用于两端钳制——单行 nowrap 读数实际半高更小，
 *  取上界可保证钳制后气泡完整落在宿主可视区内（宁可多留白，不可越界被裁） */
const BUBBLE_HALF_SIZE = 16;

/** 宿主在父元素内的布局坐标与可视尺寸（一次读数，双轴共用） */
export interface HostOffset {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 单轴几何读数（纯读，不写 DOM） */
export interface AxisMetrics {
  thumbSize: number;
  thumbOffset: number;
  hidden: boolean;
  /** 该轴本次读到的滚动长度 / 视口长度 / 滚动位置：刷新路径已经读过一次，气泡读数直接取用，
   *  避免在每帧刷新里为拼装滚动明细再读一遍布局（多一次读就多一次强制同步回流风险） */
  scrollLength: number;
  clientLength: number;
  scrollPos: number;
}

export const getLength = (el: HTMLElement, axis: 'x' | 'y', kind: 'scroll' | 'client'): number =>
  axis === 'y'
    ? kind === 'scroll'
      ? el.scrollHeight
      : el.clientHeight
    : kind === 'scroll'
      ? el.scrollWidth
      : el.clientWidth;

export const getScrollPos = (el: HTMLElement, axis: 'x' | 'y'): number => (axis === 'y' ? el.scrollTop : el.scrollLeft);

/**
 * 宿主在父元素内的布局偏移：沿 offsetParent 链累加（父元素已保证为定位容器，链必然终止于父元素）。
 * offset 值是纯布局坐标，不受 CSS transform（模态框开合动画等）影响；
 * getBoundingClientRect 在过渡期间量到的是变换中的视口坐标，会导致 overlay 大幅偏移。
 */
export const getHostOffset = (host: HTMLElement, parent: HTMLElement): HostOffset => {
  let left = 0;
  let top = 0;
  let el: HTMLElement | null = host;
  let reachedParent = false;
  while (el) {
    if (el === parent) {
      reachedParent = true;
      break;
    }
    left += el.offsetLeft;
    top += el.offsetTop;
    el = el.offsetParent as HTMLElement | null;
  }
  if (!reachedParent) {
    // 不变式兜底（V7）：offsetParent 链未终止于 parent（如 overlayParent 指向非定位祖先、
    // 或中间有 transform/fixed 元素改变 offsetParent 链）时，链式累加结果是错的。
    // 回落到 rect 差值：无过渡变换时结果正确；过渡期间可能有偏差，但好于必然错误的累加值。
    const hr = host.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    left = hr.left - pr.left;
    top = hr.top - pr.top;
  }
  return { left, top, width: host.offsetWidth, height: host.offsetHeight };
};

/**
 * 纯几何：由滚动尺寸计算拇指长度与偏移。
 * scrollLength <= clientLength（内容不足一屏）时拇指尺寸为 0 即隐藏。
 * scrollLength/clientLength 为拇指行程尺寸（可含端部留白）；scrollable 为真实可滚动量
 * （scrollLength - clientLength 视口差），二者不等时必须显式传入，否则滚到底无法占满行程。
 */
export const computeThumbGeometry = (
  scrollLength: number,
  clientLength: number,
  scrollPos: number,
  minThumbSize: number,
  scrollable?: number
): { thumbSize: number; thumbOffset: number } => {
  if (scrollLength <= clientLength || clientLength <= 0) return { thumbSize: 0, thumbOffset: 0 };
  const track = Math.max(1, scrollable ?? scrollLength - clientLength);
  const ratio = clientLength / scrollLength;
  const thumbSize = Math.max(minThumbSize, Math.round(clientLength * ratio));
  const maxScrollOffset = Math.max(0, clientLength - thumbSize);
  const thumbOffset = Math.round((Math.min(scrollPos, track) / track) * maxScrollOffset);
  return { thumbSize, thumbOffset };
};

/**
 * 纯几何：滚动气泡在 overlay 坐标系中的落点（元素自身用 left/top 定位，伸缩方向由类上的
 * translate 固定：纵向滚动条贴容器右缘、气泡整宽向左展开；横向滚动条贴下缘、气泡向上展开）。
 *
 * 沿轴坐标吸附在拇指中位，并按 BUBBLE_HALF_SIZE 两端钳制：滚到顶/底时气泡改贴宿主边缘而不越界
 * ——overlay 的父元素常带 overflow:hidden，越界即被裁掉半个气泡。
 */
export const computeBubblePosition = (
  axis: 'x' | 'y',
  off: HostOffset,
  m: Pick<AxisMetrics, 'thumbSize' | 'thumbOffset'>,
  opts: { endInset: number; edgeOffset: number; offset: number }
): { left: number; top: number } => {
  const { endInset, edgeOffset, offset } = opts;
  const thumbCenter = m.thumbOffset + m.thumbSize / 2;
  if (axis === 'y') {
    // 轨道/拇指贴容器右缘，几何与 applyAxis 的 track.left 同源
    const railLeft = off.left + off.width - THICKNESS - edgeOffset;
    return {
      left: railLeft - offset,
      top: clamp(off.top + endInset + thumbCenter, off.top + BUBBLE_HALF_SIZE, off.top + off.height - BUBBLE_HALF_SIZE),
    };
  }
  const railTop = off.top + off.height - THICKNESS - edgeOffset;
  return {
    left: clamp(
      off.left + endInset + thumbCenter,
      off.left + BUBBLE_HALF_SIZE,
      off.left + off.width - BUBBLE_HALF_SIZE
    ),
    top: railTop - offset,
  };
};
