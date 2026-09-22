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
/** 气泡落点钳制时距滚动容器边缘的留白（px）：与拇指/轨道的边缘间隙同量级，
 *  滚到顶/底时气泡既不越界被裁、也不贴死容器边缘 */
const BUBBLE_EDGE_PADDING = 4;

/** 宿主在父元素内的布局坐标与可视尺寸（一次读数，双轴共用） */
export interface HostOffset {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 气泡自身盒子尺寸（border-box，含 1px 边框）：落点两轴的钳制量按它算，故与宿主几何分开定义 */
export interface BoxSize {
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
 * 纯几何：滚动气泡在 overlay 坐标系中的落点。
 *
 * 元素自身用 left/top 定位，伸缩方向由类上的 translate 固定，落点在气泡上的含义随之确定：
 *  - 纵向滚动条（--y）：translate(-100%,-50%) → 落点是气泡**右缘**与**纵向中位**，
 *    气泡整宽向左展开、纵向以落点居中；
 *  - 横向滚动条（--x）：translate(-50%,-100%) → 落点是气泡**横向中位**与**下缘**，
 *    气泡整高向上展开、横向以落点居中。
 *
 * 两个坐标**各自**钳制在滚动容器的范围内，两端各留 BUBBLE_EDGE_PADDING：overlay 的父元素常带
 * overflow:hidden，越界即被裁掉半个气泡（纵向滚动条上的宽读数会被裁掉文字开头，横向的会被裁掉左右两端）。
 * 钳制量由气泡在该轴上的**实测尺寸**决定——读数宽度随文案长度无界，固定上界挡不住长读数
 * （如乐谱页码「12 / 120」）；纵向读数虽小，同样按实测值收敛。
 * 用整尺寸还是用一半，取决于 translate 把气泡放在落点的哪一侧：整边落在落点上的轴
 * （--y 的 x、--x 的 y）用整宽/整高，以落点居中的轴（--y 的 y、--x 的 x）用一半。
 */
export const computeBubblePosition = (
  axis: 'x' | 'y',
  off: HostOffset,
  m: Pick<AxisMetrics, 'thumbSize' | 'thumbOffset'>,
  box: BoxSize,
  opts: { endInset: number; edgeOffset: number; offset: number }
): { left: number; top: number } => {
  const { endInset, edgeOffset, offset } = opts;
  const thumbCenter = m.thumbOffset + m.thumbSize / 2;
  // 钳制边界 = 容器实边两端各内缩留白；轨道基准与吸附基准仍取容器实边（off），不受留白影响
  const boundLeft = off.left + BUBBLE_EDGE_PADDING;
  const boundTop = off.top + BUBBLE_EDGE_PADDING;
  const boundRight = off.left + off.width - BUBBLE_EDGE_PADDING;
  const boundBottom = off.top + off.height - BUBBLE_EDGE_PADDING;
  if (axis === 'y') {
    // 轨道/拇指贴容器右缘，几何与 applyAxis 的 track.left 同源
    const railLeft = off.left + off.width - THICKNESS - edgeOffset;
    // 居中轴的钳制区间：气泡比容器还高时下界会越过上界，先把上界抬到不低于下界
    // （区间退化为下界一点）——与另一轴的 Math.max 同向：始终保住文字开头，而不是被推到某一侧把它截掉
    const minTop = boundTop + box.height / 2;
    const maxTop = Math.max(minTop, boundBottom - box.height / 2);
    return {
      // 气泡整宽在落点左侧：把落点右推到「左缘留出留白」为止（宁可盖住轨道，不可被裁）
      left: Math.max(railLeft - offset, boundLeft + box.width),
      // 纵向以落点居中：两端各留半个自身高度（吸附基准是拇指中位，不加留白）
      top: clamp(off.top + endInset + thumbCenter, minTop, maxTop),
    };
  }
  const railTop = off.top + off.height - THICKNESS - edgeOffset;
  // 同上：气泡比容器还宽时区间退化为下界一点，保住左缘（文字开头）
  const minLeft = boundLeft + box.width / 2;
  const maxLeft = Math.max(minLeft, boundRight - box.width / 2);
  return {
    left: clamp(off.left + endInset + thumbCenter, minLeft, maxLeft),
    // 气泡整高在落点上方：把落点下推到「上缘留出留白」为止
    top: Math.max(railTop - offset, boundTop + box.height),
  };
};
