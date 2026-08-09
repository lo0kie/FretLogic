// src/utils/paginateLines.ts
export interface PageChunk {
  lineIndices: number[];
  isFirstPage: boolean;
}

/**
 * 按每行的（缩放后）高度，贪心地把选中的行分配到若干个 A4 页面里。
 * capacityPx：每页内容区可用高度（已扣掉首页的歌名信息栏高度）
 */
export function paginateLinesByHeight(
  sortedIndices: number[],
  lineHeights: Map<number, number>,
  firstPageCapacityPx: number,
  restPageCapacityPx: number
): PageChunk[] {
  const pages: PageChunk[] = [];
  let current: number[] = [];
  let currentHeight = 0;
  let isFirst = true;

  for (const idx of sortedIndices) {
    const h = lineHeights.get(idx) ?? 0;
    const capacity = isFirst ? firstPageCapacityPx : restPageCapacityPx;
    // 单行就超页高的极端情况：单独成页，避免死循环
    if (currentHeight > 0 && currentHeight + h > capacity) {
      pages.push({ lineIndices: current, isFirstPage: isFirst });
      current = [];
      currentHeight = 0;
      isFirst = false;
    }
    current.push(idx);
    currentHeight += h;
  }
  if (current.length > 0) {
    pages.push({ lineIndices: current, isFirstPage: isFirst });
  }
  return pages;
}
