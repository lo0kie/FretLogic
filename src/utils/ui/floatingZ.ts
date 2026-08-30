/**
 * 浮层层级单例分配器：所有浮层类元素（Popover、ContextMenu、Selector 下拉、Tooltip 等）共享一份状态。
 *
 * - acquireFloatingZ：分配「当前最高占用 + 1」的层级，保证后打开/后显示者必定压住已显示者；
 * - releaseFloatingZ：关闭（含离场动画结束）后释放，层号回收复用。
 *
 * 基准对应 tokens.scss 的 --z-menu（9999）；软上限 FLOATING_Z_CEILING（11000），
 * 超过后不再递增（同号 11000 退回 DOM 顺序决定），为静态高层 --z-top（12000）/ --z-toast（13000）
 * 留出安全边界——正常并发浮层远达不到该数量，clamp 只是防御性兜底。
 */
export const FLOATING_Z_BASE = 9999; // 对应 tokens.scss 的 --z-menu
export const FLOATING_Z_CEILING = 11000;
const activeFloatingZ = new Set<number>();

export function acquireFloatingZ(ceiling?: number): number {
  // 取「当前最高占用 + 1」而不是最小空闲层：保证后打开的浮层必定压住所有已打开的，
  // 否则先开的浮层占着高位时，后开的会分配到低位的空闲层而被压住。
  // ceiling（可选）：层号上限。父浮层置顶（bring-to-front）时传入「打开中的直接后代的最低层号 - 1」，
  // 避免父面板反超自己面板内打开中的子浮层（如 Selector 下拉）。
  let max = FLOATING_Z_BASE;
  for (const z of activeFloatingZ) {
    if (z > max) max = z;
  }
  const next = Math.min(max + 1, ceiling ?? FLOATING_Z_CEILING, FLOATING_Z_CEILING);
  activeFloatingZ.add(next);
  return next;
}

export function releaseFloatingZ(z: number): void {
  activeFloatingZ.delete(z);
}
