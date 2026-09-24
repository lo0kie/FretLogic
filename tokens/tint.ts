import { SEMANTIC_FAMILY_SOURCE } from './semanticFamilies';

import type { SemanticFamily } from './semanticFamilies';
import type { DeclarationTable, Derivation } from './types';

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

/** tint 族名 = 语义五族 + 四个中性填充族 */
type TintFamily = SemanticFamily | 'borderbase' | 'current' | 'panelhover' | 'texttitle';

/**
 * 族 → 源色令牌。语义五族与 shade / lift 共用同一份映射（见 semanticFamilies.ts）；
 * 命名不直观的四族（current / borderbase / panelhover / texttitle）对应关系由改前实测值反推确认。
 */
const TINT_SOURCE: Record<TintFamily, string> = {
  ...SEMANTIC_FAMILY_SOURCE,
  borderbase: '--border-base',
  current: '--text-body',
  panelhover: '--bg-panel-hover',
  texttitle: '--text-title',
};

/**
 * 语义五族共用的**场景档位表**。
 *
 * 为什么要有这张表：此前各族的档位是按需长出来的，于是彼此不齐 —— `success` 只有
 * `[20, 82, 88]`，而 `primary` 有 11 档。后果是给 success 找「浅底悬停档」时无档可取
 * （`buttonThemes` 只能退到 `-82`，因为 `-78` / `-80` 在该族不存在），这类死角会在每次改组件时重现。
 * 现在五族共用同一张表，「这一族能取到哪些档」不再取决于「它当初被用到哪几档」。
 *
 * 档位的场景含义（对齐 Element Plus 的 `light-1..9` 与 Ant Design 的 `*Bg / *BgHover / *Border / *BorderHover`，
 * 但落在本项目的 NN 口径上 —— NN = 底色占比，**越大越浅**）：
 * - `88` 常态浅底（subtle 按钮 / 徽章 / 选中片），`80` `82` 为其悬停档；
 * - `90` `92` 更浅一档的底（行选中 / 统计小格 / 极浅强调）；`85` 浅底与底色之间的半档；
 * - `45` 描边常态；`20` `30` `40` 描边加强 / 悬停档；`60` 描边按下档。
 */
const SEMANTIC_SCENARIO_SCALE = [20, 30, 40, 45, 60, 80, 82, 85, 88, 90, 92] as const;

/** 升序去重：与场景档取并集后必须仍是升序，否则同族的输出顺序随录入顺序漂移 */
const mergedScale = (...extra: readonly number[]): readonly number[] =>
  [...new Set([...SEMANTIC_SCENARIO_SCALE, ...extra])].sort((a, b) => a - b);

/**
 * 族 → 档位（NN）列表。
 * 键序即输出顺序，按族名字母序书写——与 tokens.scss 接管前的书写顺序一致，便于逐行 diff。
 *
 * `warning` / `danger` 另有几个**先于本表统一**就存在的档位（`-65` / `-78` 与 `-50` / `-70` / `-75` / `-95`）：
 * 它们各自已被消费，故取并集保留、不算异类；删掉它们只会打断消费方。
 */
const TINT_SCALES: Record<TintFamily, readonly number[]> = {
  borderbase: [85],
  current: [82, 85],
  danger: mergedScale(50, 70, 75, 78, 95),
  info: mergedScale(),
  panelhover: [30, 50],
  primary: mergedScale(),
  success: mergedScale(),
  texttitle: [90],
  warning: mergedScale(65, 78),
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
