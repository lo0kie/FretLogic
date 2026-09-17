/**
 * 全局指针位置跟踪：所有浮层实例共享一个监听，供关闭前做**几何复核**。
 *
 * 只靠 `:hover` 判定「指针是否还在区域内」有个致命盲点：`:hover` 只描述**最顶层**命中的元素。
 * 相邻菜单、级联子菜单、Tooltip 等任何另一个浮层压在指针下时，本浮层的 `:hover` 会凭空消失，
 * 而它的面板其实正被指针压着 —— 计时到期就关，现象即「鼠标明明还压在菜单上，它自己关了」。
 * 几何判定不看层级，只看坐标是否落在合法矩形内，正好补上这一刀。
 *
 * 用「最近一次 pointermove 的坐标」而不是「mouseleave 时的坐标（leavePoint）」：后者在指针
 * 快速移动时可能已经远在界外，且指针停下后永远不会再刷新，据此判据会时真时假 —— 这正是
 * 「偶尔自己关」这类不稳定现象的温床。
 */

let pointerX = -1;
let pointerY = -1;
/** 是否已有可用坐标（指针离开窗口后失效，此时不宜再据旧坐标判定「在里面」） */
let pointerTracked = false;
let pointerBound = false;

const trackPointer = (e: PointerEvent) => {
  pointerX = e.clientX;
  pointerY = e.clientY;
  pointerTracked = true;
};

/** 指针移出文档（移到浏览器 UI / 其它窗口）：坐标就此作废，回退到「不在区域内」的保守判定 */
const dropPointer = () => {
  pointerTracked = false;
};

/** 首个浮层实例初始化时挂上唯一的全局监听（捕获 + 被动，开销可忽略） */
export const ensurePointerTracking = () => {
  if (pointerBound) return;
  pointerBound = true;
  window.addEventListener('pointermove', trackPointer, { capture: true, passive: true });
  document.addEventListener('pointerleave', dropPointer, { capture: true, passive: true });
  window.addEventListener('blur', dropPointer);
};

/** 最近一次指针坐标快照：tracked=false 表示坐标已失效（指针离窗 / 从未移动），不可用于「在里面」判定 */
export interface PointerState {
  tracked: boolean;
  x: number;
  y: number;
}

export const getPointerState = (): PointerState => ({ tracked: pointerTracked, x: pointerX, y: pointerY });
