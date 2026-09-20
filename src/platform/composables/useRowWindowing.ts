/**
 * 通用「分区 + 网格行」虚拟化：行规划（纯几何）+ 滚动窗口计算。
 *
 * 适用场景：一个滚动容器里有一串「分区」，每个分区是一个网格（cols 列），
 * 单元格高度可以由调用方预先算出（纯几何推或实测均可）。机制只负责：
 *   1. 把分区的 items 切成行，行高取行内最高单元，行 top 逐行累加（含 gap）；
 *   2. 按滚动容器视口（± overscan）二分求出每个分区当前应渲染的行区间。
 *
 * 单元格的实际渲染仍由使用方组件承担——组合式函数 / 指令都省不掉组件挂载成本，
 * 本模块提供的正是「只挂视口附近的行、其余行用精确占位高度顶住」所需的全部几何与窗口逻辑。
 */
import { ref } from 'vue';

/** 一行：一行 items + 行高（行内最高单元）+ 相对分区网格顶部的 y 偏移（已含与前一行的间距） */
export interface VirtualRowPlan<T> {
  items: T[];
  height: number;
  top: number;
}

/** 一个分区的行规划；gridHeight 为网格容器总高（各行高 + 行距之和），空分区为 0 */
export interface VirtualSectionPlan<T> {
  rows: VirtualRowPlan<T>[];
  gridHeight: number;
}

/**
 * 把若干分区的 items 切成行规划。
 * @param groups 每个分区的单元列表（外层顺序即分区顺序，保持不变）
 * @param cols 每行列数（须与模板 grid-cols 同步）
 * @param gapPx 行间距（px）
 * @param getItemHeight 单元高度（px）；行高取行内最大值
 */
export const buildRowPlans = <T>(
  groups: readonly (readonly T[])[],
  cols: number,
  gapPx: number,
  getItemHeight: (item: T) => number
): VirtualSectionPlan<T>[] =>
  groups.map(items => {
    const rows: VirtualRowPlan<T>[] = [];
    let top = 0;
    for (let i = 0; i < items.length; i += cols) {
      const slice = items.slice(i, i + cols);
      const height = Math.max(...slice.map(getItemHeight));
      rows.push({ items: slice, height, top });
      top += height + gapPx;
    }
    return { rows, gridHeight: rows.length > 0 ? top - gapPx : 0 };
  });

/** 二分查找：y（网格局部坐标）所在或其后第一条行的下标；空数组返回 0 */
export const findFirstRowAt = (rows: readonly { top: number; height: number }[], y: number): number => {
  let lo = 0;
  let hi = rows.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid]!.top + rows[mid]!.height > y) hi = mid;
    else lo = mid + 1;
  }
  return rows.length > 0 ? lo : 0;
};

/** 二分查找：最后一条 top < y 的行下标；无则 -1 */
export const findLastRowAt = (rows: readonly { top: number }[], y: number): number => {
  let lo = 0;
  let hi = rows.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid]!.top < y) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
};

/** 窗口区间 [first, last]（闭区间）；last < first 表示该分区无可见行 */
export type RowWindowRange = { first: number; last: number };

/**
 * 分区行窗口化组合式函数：滚动时按视口位置重算每个分区应渲染的行区间。
 * 前提：分区壳常驻（网格容器元素真实存在），容器高度由 gridHeight 精确占位，
 * 因此读一次分区网格元素的 rect 即可把行规划的局部坐标换算到屏幕坐标。
 *
 * @param getScroller 滚动容器元素（可为空引用，空时窗口全空）
 * @param getList 分区列表根元素（querySelector 定位各分区网格容器）
 * @param getPlans 各分区的行规划（与模板 v-for 同源；其变化后调用方须自行调 updateWindow）
 * @param gridSelector 分区网格容器的选择器（顺序与 plans 对应）
 * @param overscanPx 视口上下各多渲染的像素量，滚动无感的缓冲
 */
export const useRowWindowing = <T>(options: {
  getScroller: () => HTMLElement | null;
  getList: () => HTMLElement | null;
  getPlans: () => VirtualSectionPlan<T>[];
  gridSelector: string;
  overscanPx?: number;
}) => {
  const overscanPx = options.overscanPx ?? 260;
  const windowRanges = ref<RowWindowRange[]>([]);

  const updateWindow = () => {
    const scroller = options.getScroller();
    const list = options.getList();
    if (!scroller || !list) return;
    const scRect = scroller.getBoundingClientRect();
    const top = scRect.top - overscanPx;
    const bottom = scRect.bottom + overscanPx;
    const plans = options.getPlans();
    const gridEls = list.querySelectorAll<HTMLElement>(options.gridSelector);
    const next: RowWindowRange[] = [];
    for (let si = 0; si < plans.length; si++) {
      const plan = plans[si]!;
      const gridEl = gridEls[si];
      if (!gridEl || plan.rows.length === 0) {
        next.push({ first: 0, last: -1 });
        continue;
      }
      const gridTop = gridEl.getBoundingClientRect().top;
      const first = findFirstRowAt(plan.rows, top - gridTop);
      const last = Math.max(findLastRowAt(plan.rows, bottom - gridTop), first - 1);
      next.push({ first, last });
    }
    // 等值守卫：每滚动帧都会调用本函数，区间没动时赋新数组会白白触发下游（picker 整屏）
    // 重渲染——只有任一分区窗口真的变化才替换引用（同 useStickyHeads 的 sameSet 范式）
    const prev = windowRanges.value;
    if (prev.length === next.length && prev.every((r, i) => r.first === next[i]!.first && r.last === next[i]!.last)) {
      return;
    }
    windowRanges.value = next;
  };

  /** 某分区当前应渲染的行 */
  const visibleRows = (sectionIndex: number): VirtualRowPlan<T>[] => {
    const plan = options.getPlans()[sectionIndex];
    const range = windowRanges.value[sectionIndex];
    if (!plan || !range || range.last < range.first) return [];
    return plan.rows.slice(range.first, range.last + 1);
  };

  return { windowRanges, updateWindow, visibleRows };
};
