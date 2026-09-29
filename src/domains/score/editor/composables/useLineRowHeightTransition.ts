import { parseSlotKey } from '@/domains/score/model/scoreModel';
import { prefersReducedMotion } from '@/platform/utils/motion';

import type { SlotKey } from '@/domains/score/types';
import type { Ref } from 'vue';

export interface UseLineRowHeightTransitionOptions {
  /** 谱面滚动容器：按槽位键反查行元素时的查询根 */
  scoreZoneRef: Ref<HTMLElement | null>;
  /** 视觉 px → 容器局部 px（行高钉住写的是容器内长度，量到的却是视觉 px） */
  toContainerPx: (visualPx: number) => number;
}

/** 行高过渡的 transition 简写：时长 / 缓动直接取 token，与 v-auto-height 注入的那条同源 */
const ROW_HEIGHT_TRANSITION = 'height var(--duration-base, 0.18s) var(--ease-standard, ease)';
/** 行高过渡的兜底回收窗口(ms)：`--duration-base` = 180ms 的镜像。正常路径由 transitionend /
 *  transitioncancel 回收，这里只是最后一道保险 —— 内联高度一旦滞留，本行此后就再也长不高
 *  （内容变了也不动），那是比「少一次动画」严重得多的故障 */
const ROW_HEIGHT_RELEASE_FALLBACK_MS = 400;

/**
 * 行高的**钉住 / 过渡 / 交回 auto** 三件套（删掉或撤销一个和弦时手动补一次高度动画）。
 *
 * 三条不变量（改动本文件前先读这三条）：
 * 1. **一切行高都在容器局部 px 上记与写**（经 toContainerPx）：`getBoundingClientRect()` 报视觉 px，
 *    而 `style.height` 是容器内长度、渲染时会被 zoom 再乘一次。不换算等于把行高钉成 zoom 倍，
 *    且「钉 → 量 → 钉」往复会把它推成 zoom² 倍。
 * 2. **旧高必须在改数据之前量**：事后已量不到。`pinRowHeight` 的返回值就是给调用方当 fromHeight 的。
 * 3. **内联高度必须被回收**（transitionend / transitioncancel / 兜底定时器三路），滞留即行高钉死。
 */
export function useLineRowHeightTransition({ scoreZoneRef, toContainerPx }: UseLineRowHeightTransitionOptions) {
  /**
   * 尚未回收的行高钉住（每行至多一条）。同一行上再次钉 / 过渡时先把上一条结清：
   * 否则新过渡会以「上一次钉住的中间值」为起点，且量到的新高也正是那个中间值 —— 动画静默失效、
   * 行高卡在半途（删完立刻撤销、或同一行连删两个和弦时就会撞上）。
   */
  const pendingRowHeightReleases = new WeakMap<HTMLElement, () => void>();

  /** 摘掉本行的内联高度与过渡，并从待回收表里注销。
   *  ⚠️ 它**不能**改走 releaseRowHeight：后者是「取出已登记的回调并调用」，而登记的回调又会
   *  回头调它 —— 那就是一次无限递归（表现为 RangeError: Maximum call stack size exceeded，
   *  且内联高度永远摘不掉、本行此后钉死）。 */
  const clearRowHeightPin = (rowEl: HTMLElement): void => {
    rowEl.style.removeProperty('height');
    rowEl.style.removeProperty('transition');
    pendingRowHeightReleases.delete(rowEl);
  };

  /** 交回自然高度：本行若有未回收的钉住（含正在跑的过渡），先把它结清。幂等，无钉住时什么都不做 */
  const releaseRowHeight = (rowEl: HTMLElement): void => void pendingRowHeightReleases.get(rowEl)?.();

  /**
   * 把行高钉在当前值上（不写过渡），返回钉住的高度（**容器局部 px**）。
   *
   * 用于「异步动作期间先冻住高度」：撤销要等一个宏任务才结算，那一帧若让行按自然高排出来，
   * 用户看到的就是先弹回满高、再缩回去重放动画。钉与量都在同一个任务内完成，中间不落绘制。
   *
   * 量高发生在结清上一条之前：上一条若还在过渡中，此刻的视觉高度正是它插值到的值 ——
   * 那也正是新过渡该接上的起点。
   *
   * 量出来的视觉 px 必须换成容器局部 px 再写回（见 toContainerPx）：`getBoundingClientRect()`
   * 报的是**视觉** px，而 `style.height` 是容器内长度、渲染时会被 zoom 再乘一次 —— 不换算
   * 等于把行高钉成 zoom 倍；下一次钉又在这个已放大的值上量一遍，于是「钉 → 量 → 钉」往复
   * 把它推成 zoom² 倍。返回局部 px 也让 fromHeight 在缩放下是不变量（与 lineRowHeights 同口径）。
   */
  const pinRowHeight = (rowEl: HTMLElement): number => {
    const height = toContainerPx(rowEl.getBoundingClientRect().height);
    releaseRowHeight(rowEl);
    rowEl.style.transition = 'none';
    rowEl.style.height = `${height}px`;
    pendingRowHeightReleases.set(rowEl, () => clearRowHeightPin(rowEl));
    return height;
  };

  /**
   * 让一行的行高变化走一次过渡。
   *
   * 【为什么不能纯 CSS】行高是内容撑出来的（行内最高的那个槽决定），而 CSS 无法对 auto ↔ auto
   * 插值，也没有哪个属性承载得住「旧高」这个起点。故手动做一次：
   * 量旧高 → 钉旧高 → 读一次布局 → 改钉新高 → 过渡结束把高度交回 auto。
   *
   * 【为什么不用现成的 v-auto-height】那要逐行常驻一份观察者（宿主 + 逐子元素 + 子树
   * MutationObserver），而谱面行数可达数百、绝大多数行一辈子不会变高变矮。本过渡只发生在
   * 「删掉 / 撤销一个和弦」这一条路径上，一次性钉高度就够，常态零成本。
   *
   * 【调用时机】同步执行，量到的是**此刻已排好版**的高度 —— 调用方必须保证 DOM 已经更新
   * （删除侧 `await nextTick()` 之后再调，撤销侧 `undo()` 已经结算完）。结清上一条、量新高、
   * 重新钉住三步在同一个任务内跑完，中间不落绘制，故看不到「先弹到新高」的闪。
   *
   * @param rowEl 要过渡的行元素（`.line-row`）
   * @param fromHeight 变化**之前**量到的行高（**容器局部 px**）—— 必须由调用方在改数据之前量好，
   *                   事后已量不到。同样要经 toContainerPx 换算，否则起点会被放大 zoom 倍，
   *                   过渡从「比真实高一个 zoom 倍」的位置起步，看着就是先跳一下再滑
   */
  const animateLineRowHeight = (rowEl: HTMLElement, fromHeight: number): void => {
    // 先结清（可能存在的）钉住：高度交回 auto 才量得到自然高
    releaseRowHeight(rowEl);
    // 行可能已随窗口化卸载 / 换歌重渲：此时不量也不写（离了文档的元素 rect 全是 0）。
    // 减弱动效则直接停在终态（不插值，保持 auto 的自然行为）
    if (!rowEl.isConnected || prefersReducedMotion()) return;

    // 与 fromHeight 同口径：视觉 px → 容器局部 px（理由见 pinRowHeight）
    const toHeight = toContainerPx(rowEl.getBoundingClientRect().height);
    // 行高没变（本行还有别的和弦撑着）就什么都不做：别平白写一次内联高度
    if (Math.abs(toHeight - fromHeight) < 1) return;

    rowEl.style.transition = 'none';
    rowEl.style.height = `${fromHeight}px`;
    // 读一次布局，把「旧高 + 无过渡」这一帧真正落实：否则下面改高度会与它并进同一帧，过渡根本不触发
    void rowEl.offsetHeight;
    rowEl.style.transition = ROW_HEIGHT_TRANSITION;
    rowEl.style.height = `${toHeight}px`;

    let fallbackTimer = 0;
    /** 交回 auto：此刻行高的自然值就是 toHeight，故不会跳；内联 transition 一并摘掉，还给类过渡 */
    const release = (event?: Event) => {
      // transitionend / transitioncancel 都会冒泡：子元素（槽上那一堆 duration-fast 过渡）打上来的
      // 事件必须滤掉，否则过渡刚起步就被提前交回 auto —— 那一交等于把动画掐断
      if (event && (event.target !== rowEl || (event as TransitionEvent).propertyName !== 'height')) return;
      window.clearTimeout(fallbackTimer);
      rowEl.removeEventListener('transitionend', release);
      rowEl.removeEventListener('transitioncancel', release);
      clearRowHeightPin(rowEl);
    };
    rowEl.addEventListener('transitionend', release);
    rowEl.addEventListener('transitioncancel', release);
    pendingRowHeightReleases.set(rowEl, release);
    fallbackTimer = window.setTimeout(() => release(), ROW_HEIGHT_RELEASE_FALLBACK_MS);
  };

  /**
   * 槽位所在的行元素（`.line-row`）。
   *
   * `[data-line-index]` 挂在歌词行上、是拖拽系统与行几何共用的寻址契约，故直接复用它再往上取一行 ——
   * 行高过渡的落点必须是 `.line-row`：行号与两侧槽位都靠 items-stretch 撑高，钉住它的高度才会
   * 整行一起收；钉歌词行则只有内容区在动，行号那一列会留出一截高度不变的边。
   */
  const lineRowElOf = (slotKey: SlotKey): HTMLElement | null => {
    const parsed = parseSlotKey(slotKey);
    const line = parsed
      ? scoreZoneRef.value?.querySelector<HTMLElement>(`[data-line-index="${CSS.escape(parsed.lineId)}"]`)
      : null;
    return line?.closest<HTMLElement>('.line-row') ?? null;
  };

  return { pinRowHeight, releaseRowHeight, animateLineRowHeight, lineRowElOf };
}
