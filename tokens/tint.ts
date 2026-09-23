/**
 * tint（实色强调色替身）族的派生声明。
 *
 * 口径（原 tokens.scss 的 SOLID TINTS 注释，现已落实为代码）：
 *   tint-<族>-<NN> = 该族的语义色以 (100-NN)% 叠加在**主题底色**上，逐通道 round-half-to-even。
 * NN 越大越接近底色。业务侧禁止再写 x/NN 半透明色工具类，一律取这一族实色。
 *
 * 三主题共用同一份档位表与源色映射——差异只来自「各主题自己的语义色取值」。
 * 刻意没有「某一档在某主题下单独覆盖」的通道：派生值是权威，光看源色与档位就能推出全部结果；
 * 某档观感不合适时改**源色**，不要在这里加例外（那会让同族同档在不同主题下口径不一）。
 */
import type { DeclarationTable, Derivation } from './types';

/** tint 族名 */
type TintFamily = 'borderbase' | 'current' | 'danger' | 'panelhover' | 'primary' | 'success' | 'texttitle' | 'warning';

/**
 * 族 → 源色令牌。
 * 令牌名三主题一致（各主题在自己的调色板里给不同取值）；
 * 命名不直观的四族（current / borderbase / panelhover / texttitle）对应关系由改前实测值反推确认。
 */
const TINT_SOURCE: Record<TintFamily, string> = {
  borderbase: '--border-base',
  current: '--text-body',
  danger: '--color-danger',
  panelhover: '--bg-panel-hover',
  primary: '--color-primary',
  success: '--color-success',
  texttitle: '--text-title',
  warning: '--color-warning',
};

/**
 * 族 → 档位（NN）列表。
 * 键序即输出顺序，按族名字母序书写——与 tokens.scss 接管前的书写顺序一致，便于逐行 diff。
 */
const TINT_SCALES: Record<TintFamily, readonly number[]> = {
  borderbase: [85],
  current: [82, 85],
  danger: [20, 50, 70, 75, 78, 80, 82, 88, 90, 95],
  panelhover: [30, 50],
  primary: [20, 30, 40, 45, 60, 80, 82, 85, 88, 90, 92],
  success: [20, 82, 88],
  texttitle: [90],
  warning: [20, 40, 65, 78, 80, 82, 88, 90],
};

/**
 * 产出全部 tint 声明。
 *
 * 刻意**没有**「按变量名覆盖某一档」的入口：派生值是权威，光看源色与档位就能推出全部结果。
 * 若某档观感不合适，正确的做法是改**源色**（该族对应的语义色令牌），而不是在派生结果上打补丁——
 * 打补丁会让「同一族同一档在不同主题下遵循不同口径」，正是本目录要消除的那类双源。
 */
export const buildTintDeclarations = (): DeclarationTable => {
  const declarations: DeclarationTable = {};
  for (const family of Object.keys(TINT_SCALES) as TintFamily[])
    for (const weight of TINT_SCALES[family]) {
      const name = `--tint-${family}-${weight}`;
      const derived: Derivation = { kind: 'tint', source: TINT_SOURCE[family], baseWeight: weight };
      declarations[name] = derived;
    }
  return declarations;
};
