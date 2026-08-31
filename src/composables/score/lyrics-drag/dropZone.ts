/**
 * 和弦拖拽分区落点：把目标槽位按垂直中点分为上下两个分区，
 * 松手所在分区直接决定落地动作（替代原确认弹窗）。
 */

export type DropZone = 'top' | 'bottom';

/**
 * 落地动作：交换 / 替换 / 复制 / 移位。
 * 注：replace（落到占用目标）与 move（落到空槽位）在数据层等价（目标覆盖 + 源清空，
 * 均走 moveSlotChord），区分仅为语义/UI 文案清晰。
 */
export type DropAction = 'swap' | 'replace' | 'copy' | 'move';

/** 分区判定迟滞带比例（按格高）：中点 ±(height * 12%) 内保持上一次分区，避免边界抖动 */
export const ZONE_HYSTERESIS_RATIO = 0.12;

/** 迟滞带下限（px）：过窄的格子也能保持最小防抖宽度 */
export const ZONE_HYSTERESIS_MIN = 2;

interface ZoneRect {
  top: number;
  height: number;
}

/**
 * 按槽位垂直中点判定指针所在分区。
 * 迟滞带按格高 12%（下限 2px）动态计算，迟滞带内优先保持 prevZone（无 prev 时落最近侧）。
 */
export const resolveDropZone = (rect: ZoneRect, clientY: number, prevZone: DropZone | null): DropZone => {
  const mid = rect.top + rect.height / 2;
  const hysteresis = Math.max(ZONE_HYSTERESIS_MIN, rect.height * ZONE_HYSTERESIS_RATIO);
  if (prevZone && Math.abs(clientY - mid) <= hysteresis) return prevZone;
  return clientY < mid ? 'top' : 'bottom';
};

/**
 * 分区 → 落地动作（与原弹窗语义一一对应）：
 * 占用目标：上=交换，下=替换；空槽位：上=复制，下=移位。
 */
export const resolveDropAction = (zone: DropZone, occupied: boolean): DropAction => {
  if (occupied) return zone === 'top' ? 'swap' : 'replace';
  return zone === 'top' ? 'copy' : 'move';
};
