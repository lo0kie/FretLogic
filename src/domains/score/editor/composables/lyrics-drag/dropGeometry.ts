/**
 * 拖拽落点的几何判定：行「悬停」用宽容判断（决定哪一行是落点行），槽位「落点」用精确判断（决定边框与写入）。
 *
 * 两者容差不同，原因不同：
 * - 落点行是「我准备往这一行放」的行级判定（两枚「+」据此显形），只关心指针在不在这一行的垂直范围内 ——
 *   行内水平方向哪怕落在字符之间的空隙、行首行号区、行被 min-w-full 拉伸出的行尾空白，
 *   都应该稳定判为落点行（否则指针一移出字符就闪断，体验很差）。
 * - 落点是真正要写入的槽位，必须与视觉所见一致：行矩形被拉伸到容器整宽，
 *   行矩形右侧的空白远大于槽位实际覆盖范围，若只按「矩形钳制距离」取最近槽，
 *   拖到行尾外侧的空白也会吸附到末槽（行首同理），所以水平方向要收紧到「槽位并集 ± 容差」。
 *
 * ⚠️ 排列区 canvas 化后，入参从「行 / 槽的 DOM 元素」换成宿主给的**几何表**（`ArrangeRowGeometry`）：
 * canvas 行里没有逐槽元素，槽位矩形只有一份来源 —— `arrangeLineLayout` 的排版产物（同一份矩形表
 * 也用来绘制，故「点得中」与「看得见」必然一致）。判据与容差值与 DOM 版逐值相同。
 */

/** 行垂直命中容差（px）：指针在行上下这一范围内仍算悬停该行；超出即视为不在任何行上 */
export const LINE_HIT_VERTICAL_TOLERANCE = 12;

/** 槽位水平命中容差（px）：指针在行内槽位并集左右这一范围内仍算命中；超出即视为行首/行尾空白，不落点 */
export const SLOT_HIT_HORIZONTAL_TOLERANCE = 12;

/** 一行在视口坐标下的命中几何（由宿主从行元素矩形 + 排版表换算而来） */
export interface ArrangeRowGeometry {
  /** 歌词行 id（`data-line-index`） */
  lineId: string;
  /** 行矩形上下沿（视口坐标 px） */
  top: number;
  bottom: number;
  /** 槽位并集的左右沿（视口坐标 px） */
  slotsLeft: number;
  slotsRight: number;
  /**
   * 行内每个槽位的矩形（视口坐标 px）：落点吸附用。
   *
   * **必须带 y**：一行折成多段（续行）后，同一水平位置在每一段上各有一个槽 —— 只按 x 取最近
   * 会吸到别的段上去（见 `snapToSlotInRow`）。
   */
  slots: { slotKey: string; left: number; right: number; top: number; bottom: number }[];
}

/**
 * 宽容行判定：只按垂直命中带选行，不看水平位置。
 * 取垂直钳制距离最小的一条：指针在行内即为 0，且贴着某行底边时稳定吸该行、
 * 不会因为用中心距离而被判给下一行。
 */
export function resolveHoverRow(rows: readonly ArrangeRowGeometry[], y: number): ArrangeRowGeometry | null {
  let bestRow: ArrangeRowGeometry | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    // 垂直钳制距离：指针在行内为 0，在行外为到最近边的距离；超出容差即视为不在该行
    const dy = y < row.top ? row.top - y : y > row.bottom ? y - row.bottom : 0;
    if (dy > LINE_HIT_VERTICAL_TOLERANCE) continue;
    if (dy < bestDist) {
      bestDist = dy;
      bestRow = row;
    }
  }
  return bestRow;
}

/**
 * 精确槽位吸附：在已选定的行内取槽位——要求指针落在该行槽位并集的水平容差内，
 * 命中的槽位取**二维**钳制距离最近者；不满足即返回 null（行被拉伸出来的空白区不产生落点）。
 *
 * 为什么是二维：一行折成多段（续行）后，同一水平位置在每一段上各有一个槽，而两段的 x 区间往往
 * 完全重叠 —— 只按水平距离取最近会稳定吸到别的段上。
 *
 * 入参收一个已解析好的行，而非行数组：行是宽容判定的产物，调用方本来就要先算一次拿去做落点行判定，
 * 这里再扫一遍行列表只会把矩形比较翻倍（指针移动事件上是实打实的开销）。
 */
export function snapToSlotInRow(row: ArrangeRowGeometry, x: number, y: number): string | null {
  if (row.slots.length === 0) return null;
  let bestKey: string | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const slot of row.slots) {
    const dx = x < slot.left ? slot.left - x : x > slot.right ? x - slot.right : 0;
    const dy = y < slot.top ? slot.top - y : y > slot.bottom ? y - slot.bottom : 0;
    // 比平方距离即可（开方单调，省一次 sqrt）；两轴同为 0 时它就是 0，即指针正在槽内
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      bestKey = slot.slotKey;
    }
  }
  if (bestKey === null) return null;
  if (x < row.slotsLeft - SLOT_HIT_HORIZONTAL_TOLERANCE || x > row.slotsRight + SLOT_HIT_HORIZONTAL_TOLERANCE)
    return null;
  return bestKey;
}
