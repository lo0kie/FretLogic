import { SEMANTIC_FAMILY_SOURCE } from './semanticFamilies';

import type { SemanticFamily } from './semanticFamilies';
import type { DeclarationTable } from './types';

/**
 * shade（强调色压深档）族的派生声明。
 *
 * 口径：shade-<族>-<NN> = 该族的语义色与**纯黑**按 NN% 混合，逐通道 round-half-to-even。
 * 与 tint / lift 是同一套混合口径的三端：tint 朝主题底色走（变淡），shade 朝黑走、lift 朝白走。
 *
 * 用途：`-12` —— 需要「比常态色再压一档」的浅底文字色（ghost 按钮悬停）。此前由组件现算
 * `color-mix(in srgb, var(--color-x) 88%, black)`，等价 NN = 12；现算的问题是混合比例散落在
 * 组件字符串里、且算出来的色值无法被审查。
 *
 * 此前还带一档 `-20`（实心档的**按下**档，与 Element Plus 的 `dark-2` 同口径），**已删**：
 * 全仓零消费 —— 实心档（ActionButton 的 default/subtle、BaseBadge 的 filled、BaseCheckbox
 * 的勾选态）的按下反馈要么走通用 `active:brightness-95`、要么根本没有按下态，没有任何地方读
 * `--shade-*-20`。留着只会让「改主题时要不要同步它」变成每次都要重新判断的假问题 ——
 * 与 tokens/themes/light.ts 里 `--color-{danger,info}-rgb` 不声明分量的判据同源。
 * 将来真要做实心按下档，把权重加回下面那个常量所在的循环即可。
 *
 * 与 tint 一样刻意没有「按变量名覆盖某一档」的入口：派生值是权威，
 * 某档观感不合适时改**源色**，不要在派生结果上打补丁。
 */

/** shade 族名 = 语义五族 + 中性填充族 borderbase（后者供中性底的悬停 / 按下档） */
type ShadeFamily = SemanticFamily | 'borderbase';

/** 族 → 源色令牌。语义族与 tint / lift 共用同一份映射（见 semanticFamilies.ts） */
const SHADE_SOURCE: Record<ShadeFamily, string> = {
  borderbase: '--border-base',
  ...SEMANTIC_FAMILY_SOURCE,
};

/**
 * 压深档（NN = 黑的占比）。
 *
 * 只有一档：`borderbase` 与语义五族统一取 12。中性底本就没有「按下再压深」的需求
 * （开关轨道的悬停与按下同档），语义族那档 `-20` 零消费后同上删除，于是各族只剩同一个值。
 */
const SHADE_WEIGHT = 12;

/**
 * 产出全部 shade 声明。
 *
 * 键序即输出顺序，按族名字母序书写。
 */
export const buildShadeDeclarations = (): DeclarationTable => {
  const declarations: DeclarationTable = {};
  for (const family of Object.keys(SHADE_SOURCE) as ShadeFamily[])
    declarations[`--shade-${family}-${SHADE_WEIGHT}`] = {
      kind: 'shade',
      source: SHADE_SOURCE[family],
      weight: SHADE_WEIGHT,
    };
  return declarations;
};
