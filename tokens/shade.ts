/**
 * shade（强调色压深档）族的派生声明。
 *
 * 口径：shade-<族>-<NN> = 该族的语义色与**纯黑**按 NN% 混合，逐通道 round-half-to-even。
 * 与 tint 族是同一套混合口径的两端——tint 朝主题底色走（变淡），shade 朝黑走（压深）。
 *
 * 用途：需要「比常态色再压一档」的场合（当前是 ghost 按钮悬停时的文字色）。
 * 此前由组件现算 `color-mix(in srgb, var(--color-x) 88%, black)`，等价 NN = 12；现算有两个问题：
 * 混合比例（88%）散落在组件字符串里、且算出来的色值无法被审查。这里收敛为实色令牌。
 *
 * 与 tint 一样刻意没有「按变量名覆盖某一档」的入口：派生值是权威，
 * 某档观感不合适时改**源色**，不要在派生结果上打补丁。
 */
import type { DeclarationTable, Derivation } from './types';

/** shade 族名（与 tint 族同名同源，只取需要压深档的四族） */
type ShadeFamily = 'danger' | 'primary' | 'success' | 'warning';

/** 族 → 源色令牌。令牌名三主题一致（各主题在自己的调色板里给不同取值） */
const SHADE_SOURCE: Record<ShadeFamily, string> = {
  danger: '--color-danger',
  primary: '--color-primary',
  success: '--color-success',
  warning: '--color-warning',
};

/** 压深档：NN = 黑的占比（= 原先 `color-mix(色 88%, black)` 的补数） */
const SHADE_WEIGHT = 12;

/**
 * 产出全部 shade 声明。
 *
 * 键序即输出顺序，按族名字母序书写。
 */
export const buildShadeDeclarations = (): DeclarationTable => {
  const declarations: DeclarationTable = {};
  for (const family of Object.keys(SHADE_SOURCE) as ShadeFamily[]) {
    const name = `--shade-${family}-${SHADE_WEIGHT}`;
    const derived: Derivation = { kind: 'shade', source: SHADE_SOURCE[family], weight: SHADE_WEIGHT };
    declarations[name] = derived;
  }
  return declarations;
};
