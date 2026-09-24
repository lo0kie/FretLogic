import { SEMANTIC_FAMILY_SOURCE } from './semanticFamilies';

import type { SemanticFamily } from './semanticFamilies';
import type { DeclarationTable, Derivation } from './types';

/**
 * lift（强调色提亮档）族的派生声明。
 *
 * 口径：lift-<族>-<NN> = 该族的语义色与**纯白**按 NN% 混合，逐通道 round-half-to-even。
 * 与 shade 成对 —— 两者的锚点都是**绝对色**（白 / 黑），故**不随主题漂移**；
 * tint 的锚点是主题底色，会漂移。这正是「实心档的悬停 / 按下」需要的语义：
 * 亮色与暗色下都应当朝同一个方向走（更亮一点 / 更暗一点），而不是各自朝底色靠。
 *
 * 用途：实心强调色底（勾选框勾选态、开关轨道开态）的**悬停**档。
 * 此前由 `group-hover:brightness-105` 现算，两个问题：
 * ① 滤镜由引擎现算，产物的真实色值既不可审查、也上不了对比度门禁；
 * ② `brightness()` 是「通道乘系数」而非混合 —— 对通道触顶的色（如饱和蓝的 R≈0）表现不是提亮。
 * 这里收敛为实色令牌。
 *
 * 与 tint / shade 一样刻意没有「按变量名覆盖某一档」的入口：派生值是权威，
 * 某档观感不合适时改**源色**，不要在派生结果上打补丁。
 */

/** 提亮档：NN = 白的占比。10% 是「足以肉眼分辨、又不至于把饱和色洗淡」的一档 */
const LIFT_WEIGHT = 10;

/**
 * 产出全部 lift 声明。
 *
 * 键序即输出顺序，按族名字母序书写。
 */
export const buildLiftDeclarations = (): DeclarationTable => {
  const declarations: DeclarationTable = {};
  for (const family of Object.keys(SEMANTIC_FAMILY_SOURCE) as SemanticFamily[]) {
    const name = `--lift-${family}-${LIFT_WEIGHT}`;
    const derived: Derivation = { kind: 'lift', source: SEMANTIC_FAMILY_SOURCE[family], weight: LIFT_WEIGHT };
    declarations[name] = derived;
  }
  return declarations;
};
