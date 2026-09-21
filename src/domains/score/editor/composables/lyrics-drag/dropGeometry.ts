/**
 * 拖拽落点的几何判定：行「悬停」用宽容判断（决定哪一行撑开），槽位「落点」用精确判断（决定边框与写入）。
 *
 * 两者容差不同，原因不同：
 * - 撑开行是「我准备往这一行放」的视觉反馈，只关心指针在不在这一行的垂直范围内——
 *   行内水平方向哪怕落在字符之间的空隙、行首行号区、行被 min-w-full 拉伸出的行尾空白，
 *   都应该稳定撑开该行（否则指针一移出字符就闪断，体验很差）。
 * - 落点是真正要写入的槽位，必须与视觉所见一致：行元素被 min-w-full 拉伸到容器整宽，
 *   行矩形右侧的空白远大于槽位实际覆盖范围，若只按「矩形钳制距离」取最近槽，
 *   拖到行尾外侧的空白也会吸附到末槽（行首同理），所以水平方向要收紧到「槽位并集 ± 容差」。
 */

/** 行垂直命中容差（px）：指针在行上下这一范围内仍算悬停该行；超出即视为不在任何行上 */
export const LINE_HIT_VERTICAL_TOLERANCE = 12;

/** 槽位水平命中容差（px）：指针在行内槽位并集左右这一范围内仍算命中；超出即视为行首/行尾空白，不落点 */
export const SLOT_HIT_HORIZONTAL_TOLERANCE = 12;

export interface HoverLine {
  /** 命中的歌词行元素（[data-line-index]） */
  el: HTMLElement;
  /** 所属歌词行 id（data-line-index），可能缺失 */
  lineId: string | null;
}

export interface SnappedSlot extends HoverLine {
  /** 命中的槽位 key（data-slot-key） */
  key: string;
}

/**
 * 宽容行判定：只按垂直命中带选行，不看水平位置。
 * 取垂直钳制距离最小的一条：指针在行内即为 0，且贴着某行底边时稳定吸该行、
 * 不会因为用中心距离而被判给下一行。
 */
export function resolveHoverLine(lines: HTMLElement[], y: number): HoverLine | null {
  let bestLine: HTMLElement | null = null;
  let bestLineDist = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    const r = line.getBoundingClientRect();
    // 垂直钳制距离：指针在行内为 0，在行外为到最近边的距离；超出容差即视为不在该行
    const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    if (dy > LINE_HIT_VERTICAL_TOLERANCE) continue;
    if (dy < bestLineDist) {
      bestLineDist = dy;
      bestLine = line;
    }
  }
  if (!bestLine) return null;
  return { el: bestLine, lineId: bestLine.dataset['lineIndex'] ?? null };
}

/**
 * 精确槽位吸附：在已选定的行内取槽位——要求指针落在该行槽位并集的水平容差内，
 * 命中的槽位取水平最近者；不满足即返回 null（行被拉伸出来的空白区不产生落点）。
 *
 * 入参收一个已解析好的行，而非行数组：行是宽容判定的产物，调用方本来就要先算一次拿去做撑开提示，
 * 这里再扫一遍行列表只会把 getBoundingClientRect 的强制布局读翻倍（指针移动事件上是实打实的开销）。
 */
export function snapToSlotInLine(hovered: HoverLine, x: number): SnappedSlot | null {
  const slots = Array.from(hovered.el.querySelectorAll<HTMLElement>('[data-slot-key]'));
  if (slots.length === 0) return null;

  let bestSlot: HTMLElement | null = null;
  let bestSlotDist = Number.POSITIVE_INFINITY;
  let minLeft = Number.POSITIVE_INFINITY;
  let maxRight = Number.NEGATIVE_INFINITY;
  for (const slot of slots) {
    const r = slot.getBoundingClientRect();
    minLeft = Math.min(minLeft, r.left);
    maxRight = Math.max(maxRight, r.right);
    const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
    if (dx < bestSlotDist) {
      bestSlotDist = dx;
      bestSlot = slot;
    }
  }
  if (!bestSlot || x < minLeft - SLOT_HIT_HORIZONTAL_TOLERANCE || x > maxRight + SLOT_HIT_HORIZONTAL_TOLERANCE)
    return null;

  const key = bestSlot.dataset['slotKey'];
  if (!key) return null;
  return { el: hovered.el, lineId: hovered.lineId, key };
}
