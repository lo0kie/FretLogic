/**
 * 滚动气泡读数的「逐字符翻页」器：纯 DOM 的单元/字符两层结构与其过渡驱动。
 *
 * 从 vScrollbar.ts 抽出（原 151~162、574~657 行）。刻意保持**自包含**：
 * 只依赖 DOM 与 RollCell 类型，不认识 ScrollbarState，因此可被 core（持有 state 的那一层）
 * 单向引用而不形成环（ScrollbarState 持有 BubbleRoller，翻页器本身却不需要回指 state）。
 *
 * 为什么不直接复用 BaseRollingText 组件：气泡是 document.createElement 造出来的纯 DOM 节点，
 * 不在 Vue 组件树里，要用组件就得为每个滚动区单开一个 Vue 应用。所以复用的是**可复用的那部分**：
 * 过渡规则（全局 .br-roll-*）与字符对位算法（alignRollCells），只有「怎么驱动过渡」这一层自己写。
 */

import type { RollCell } from '@/platform/utils/motion';

/** 气泡读数单次翻页的时长（ms）：vScrollbar.scss 把它写成读数节点上的 --br-duration，
 *  供全局 .br-roll-*（与 BaseRollingText 共用的那份过渡规则）读取——不复用其兜底值，
 *  免得时长这个数字在两处各写一份。与 BaseRollingText 的默认 duration 一致 */
export const BUBBLE_ROLL_MS = 200;
/** 翻页收尾宽限（ms）：过渡结束与摘除离场节点之间留一点余量，不在动画最后一帧抢跑 */
const BUBBLE_ROLL_SETTLE_SLACK_MS = 40;
/** 翻页过渡的类名：与 transitions.scss 的 .br-roll-* 逐字同名（全局规则按名匹配，改这里必须同步改那边） */
const ROLL_ENTER_FROM_CLASS = 'br-roll-enter-from';
const ROLL_ENTER_ACTIVE_CLASS = 'br-roll-enter-active';
const ROLL_LEAVE_ACTIVE_CLASS = 'br-roll-leave-active';
const ROLL_LEAVE_TO_CLASS = 'br-roll-leave-to';
/** 翻页单元与字符的类名（静态样式在 vScrollbar.scss 里；结构对齐 BaseRollingText 的逐字符窗口） */
const BUBBLE_CELL_CLASS = 'v-scrollbar-bubble-cell';
const BUBBLE_CHAR_CLASS = 'v-scrollbar-bubble-char';

/** 进行一次翻页的单元记录：该单元内的离场/入场字符节点 */
export interface PendingRoll {
  leaving: HTMLElement;
  entering: HTMLElement;
}

export interface BubbleRoller {
  /** 当前字符单元（与 nodes 一一对应，供 alignRollCells 对位） */
  cells: RollCell[];
  /** 与 cells 一一对应的单元节点 */
  nodes: HTMLElement[];
  /** 新槽位的 key 游标：让 alignRollCells 保持无状态 */
  nextKey: number;
  /** 最近一次读数变化的时刻：变化密集时不翻页 */
  lastChangeAt: number;
  /** 进行中的翻页：新读数到来时先收尾，让节点结构回到「一单元一字符」 */
  pending: PendingRoll[];
  /** 收尾定时器（过渡结束后摘除离场节点） */
  timer: ReturnType<typeof setTimeout> | null;
}

/** 造一个单元节点：窗口 + 字符两层（静态样式见注入样式里的 .v-scrollbar-bubble-cell/char） */
export const makeBubbleCell = (char: string): HTMLElement => {
  const cell = document.createElement('span');
  cell.className = BUBBLE_CELL_CLASS;
  const ch = document.createElement('span');
  ch.className = BUBBLE_CHAR_CLASS;
  ch.textContent = char;
  cell.appendChild(ch);
  return cell;
};

/**
 * 结束进行中的翻页：摘除离场节点、去掉入场节点的过渡类（此刻它已是当前字符），并撤销收尾定时器。
 * 提前收尾（新读数在动画中途到来）会让做了一半的翻页瞬移到终态——读数即时性优先于动画完整，
 * 且此处只由「新读数」或「卸载」调用，静止时不会有人清它，不会留下半张的节点。
 */
export const settleBubbleRoll = (roller: BubbleRoller): void => {
  if (roller.timer !== null) {
    clearTimeout(roller.timer);
    roller.timer = null;
  }
  for (const p of roller.pending) {
    p.leaving.remove();
    // 起点类必须与 active 类一起摘：入场节点此刻已是当前字符，而 .br-roll-enter-from 带
    // translateY(110%) + opacity 0，只摘 active 会让这行读数永久停在「空白」——
    // 提前收尾时那条 rAF 会因 pending 已清空而早退，摘起点类这件事就没人接了。
    p.entering.classList.remove(ROLL_ENTER_ACTIVE_CLASS, ROLL_ENTER_FROM_CLASS);
  }
  roller.pending = [];
};

/** 单元内换字：roll 为真播翻页，否则就地替换字符（读数密集变化时的退化路径） */
export const setBubbleCellChar = (roller: BubbleRoller, cell: HTMLElement, char: string, roll: boolean): void => {
  // 调用前必已 settle，故首个子节点就是当前字符
  const current = cell.firstElementChild as HTMLElement;
  if (!roll) {
    current.textContent = char;
    return;
  }
  const entering = document.createElement('span');
  entering.className = `${BUBBLE_CHAR_CLASS} ${ROLL_ENTER_FROM_CLASS} ${ROLL_ENTER_ACTIVE_CLASS}`;
  entering.textContent = char;
  cell.appendChild(entering);
  roller.pending.push({ leaving: current, entering });
  // 插入与切类必须分帧：同一帧内完成的话浏览器只做一次样式计算，「from」与目标态被合并，过渡没有起点
  // （Vue <Transition> 的 nextFrame 同理）。收尾可能先于本帧回调发生，故用 pending 归属当门闩
  requestAnimationFrame(() => {
    if (!roller.pending.some(p => p.entering === entering)) return;
    entering.classList.remove(ROLL_ENTER_FROM_CLASS);
    current.classList.add(ROLL_LEAVE_ACTIVE_CLASS, ROLL_LEAVE_TO_CLASS);
  });
  if (roller.timer !== null) clearTimeout(roller.timer);
  roller.timer = setTimeout(() => {
    roller.timer = null;
    settleBubbleRoll(roller);
  }, BUBBLE_ROLL_MS + BUBBLE_ROLL_SETTLE_SLACK_MS);
};
