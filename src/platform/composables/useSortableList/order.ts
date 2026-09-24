/**
 * useSortableList 的顺序解析与 FLIP 位移动画引擎。
 *
 * 从 useSortableList.ts 抽出（原 187~201、256~333 行）。
 *
 * 刻意做成**无闭包依赖的纯函数**（容器 / 快照 / 计时器表全部显式入参）：
 * 这样既能从组合式的大闭包里搬出来，又不会反向依赖它，避免循环引用。
 */

import { removeTransitionItems } from '@/platform/utils/motion';

import { PREVIEW_SETTLE_EASING } from './constants';

/** 一次位置快照：元素的视觉位置（含正在进行的 transform），用作下一段过渡的起点 */
export interface PositionSnapshot {
  el: HTMLElement;
  left: number;
  top: number;
}

/**
 * Sortable 打在元素上的动画标记（见 sortable.esm.js 的 animate 与 _onDragOver）。
 * 它自己开 animation 时会写这三个字段，并在 _onDragOver 开头用
 * `target.animated && target.animatingX && target.animatingY` 判定：正在动画的元素
 * 直接跳过换位判定。我们把 animation 设为 0 之后它不再写，这份保护就没了——必须自己补。
 */
export type SortableAnimating = HTMLElement & {
  animated?: number | false;
  animatingX?: boolean;
  animatingY?: boolean;
};

/** 打上 / 抹掉「本元素正在动画」的标记，告诉 Sortable 别拿它当交换目标 */
export const setAnimating = (el: HTMLElement, on: boolean, timer = 0): void => {
  const target = el as SortableAnimating;
  target.animated = on ? timer : false;
  target.animatingX = on;
  target.animatingY = on;
};

/**
 * 把快照里的元素平滑移动到它们当前的布局位置（FLIP）。
 * 位移不足半像素的不动——不给「其实没动」的元素白挂一段过渡。
 *
 * 用 CSS 过渡而不是 WAAPI：起始值必须先真正落地一次再切换，WAAPI 在首帧采样前可能
 * 先绘制一帧终态，那正是「动画没发生」。中间的强制回流是让起始值生效的关键。
 *
 * @param timers 收尾定时器表（以元素为键，新一轮动画顶掉上一轮）；由调用方持有，
 *               组合式销毁时也要能清掉，故不放在本模块内部。
 */
export const playFlip = (snapshots: PositionSnapshot[], duration: number, timers: Map<HTMLElement, number>): void => {
  const transition = `transform ${duration}ms ${PREVIEW_SETTLE_EASING}`;
  // 先全读再全写：读写交错会把一次布局变成 N 次强制重排
  const live = snapshots.map(snap => snap.el.getBoundingClientRect());
  const moves: HTMLElement[] = [];
  snapshots.forEach((snap, index) => {
    const { el } = snap;
    const rect = live[index];
    if (!rect || !el.isConnected) return;
    const dx = snap.left - rect.left;
    const dy = snap.top - rect.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    el.style.transition = 'none';
    el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    moves.push(el);
  });
  if (!moves.length) return;
  void document.body.offsetHeight; // 一次性强制回流：让所有起点真正落地
  for (const el of moves) {
    el.style.transition = transition;
    el.style.transform = '';
    // 收尾清掉自己那条内联 transition，别让它长期盖住元素自身的过渡；
    // 期间若已被新一轮动画接管则让位（判据见下方计时器回调）
    const previous = timers.get(el);
    if (previous) clearTimeout(previous);
    // 动画期间必须把自己标成「正在动画」，否则 Sortable 会继续拿它当交换目标：
    // 它的换位判定读 getRect，而我们正用 transform 把这个元素从旧位搬向新位，
    // 读到的是漂移中的中间位置——方向判定随之反转，立刻又换回来，来回往复就是那阵闪烁。
    // Sortable 自己开 animation 时由它写这三个字段；animation: 0 后只能我们自己补。
    const timer = window.setTimeout(() => {
      // 让位判据取**计时器身份**，不比 el.style.transition 的字符串：CSSOM 会把写入值重新
      // 序列化（浏览器把 200ms 读回成 0.2s、cubic-bezier 的空白也未必原样），字符串比对恒不
      // 相等 ⇒ 这条早退恒成立、内联 transition 永远回收不掉。jsdom 恰好原样回读，故单测看不见。
      if (timers.get(el) !== timer) return;
      timers.delete(el);
      setAnimating(el, false);
      // 只摘自己那一条，不整段清空：同一元素上可能还有 v-auto-height / v-edge-fade 并入的
      // 条目（motion.ts 的条目级合并就是为此），整段覆盖会连它们一起吞掉。
      el.style.transition = removeTransitionItems(el.style.transition, 'transform');
      el.style.transform = '';
    }, duration + 100);
    setAnimating(el, true, timer);
    timers.set(el, timer);
  }
};

/** 收掉所有 FLIP 定时器并抹平残留的内联 transform（再次起拖 / 销毁时用） */
export const cancelFlip = (timers: Map<HTMLElement, number>): void => {
  for (const [el, timer] of timers) {
    clearTimeout(timer);
    setAnimating(el, false); // 标记残留会让 Sortable 永远跳过这个元素，之后再也不能换位
    el.style.transition = '';
    el.style.transform = '';
  }
  timers.clear();
};

/**
 * 记录容器子元素的视觉位置。
 *
 * 取 getBoundingClientRect（含正在进行的 transform）而不是布局位置：换位常常在上一段
 * 过渡还没跑完时就再次发生，只有以视觉位置为起点才能接住它继续跑完，否则每次换位都会
 * 先把元素瞬移回布局位置再重新起跳——快速连续拖动时那是一串可见的跳变。
 *
 * @param skip 被拖元素：它的视觉由 .drag-preview 接管、本体透明，不参与位移动画
 */
export const capturePositions = (container: HTMLElement | null, skip: HTMLElement | null): PositionSnapshot[] => {
  if (!container) return [];
  // 全是读操作、中间没有写，逐个取不会触发强制重排
  const snapshots: PositionSnapshot[] = [];
  for (const child of Array.from(container.children)) {
    if (!(child instanceof HTMLElement) || child === skip) continue;
    const rect = child.getBoundingClientRect();
    snapshots.push({ el: child, left: rect.left, top: rect.top });
  }
  return snapshots;
};

/**
 * 落定后的新顺序：以 DOM 为真源，而不是拿 oldIndex/newIndex 去数组里做下标运算。
 *
 * 下标运算隐含一个前提——容器的子元素与数组一一对应。这个前提很脆：
 * 列表里只要掺入任何非数据项（拼音分组的小标题行、末尾的「新建」行、指令注入的
 * overlay），DOM 下标就整体偏移，一次拖拽算出的新顺序与用户所见完全不同，
 * 且 DOM 与数组从此各自漂移，之后每拖一次错一次——表现就是「像被 random 洗过」。
 *
 * 改成读 DOM：起拖时把子元素与数组同序快照，落定时按容器当前子元素顺序把元素换回
 * 数据项。DOM 是用户刚拖出来的结果，这样得到的顺序必然与他松手时看到的一致。
 *
 * @returns 新顺序；数量对不上（拖拽期间列表被增删过，DOM 已不能当真源）时返回 null，
 *          由调用方退回下标运算
 */
export const resolveNextOrder = <T>(
  container: HTMLElement | null,
  originElements: Element[] | null,
  originItems: T[] | null
): T[] | null => {
  if (!container || !originElements || !originItems) return null;
  // 元素数与数据条数不相等说明列表里掺了非数据项，下标映射不可信
  if (originElements.length !== originItems.length) return null;
  const indexOfChild = new Map<Element, number>();
  originElements.forEach((child, index) => indexOfChild.set(child, index));
  const order: T[] = [];
  for (const child of Array.from(container.children)) {
    const index = indexOfChild.get(child);
    if (index === undefined) continue;
    const item = originItems[index];
    if (item !== undefined) order.push(item);
  }
  return order.length === originItems.length ? order : null;
};
