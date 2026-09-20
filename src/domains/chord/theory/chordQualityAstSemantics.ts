/**
 * 性质 AST 的**语义自洽性**校验。
 *
 * 与「能否被解析」是两件事：`parseQualityText` 只回答「这串文本能不能被拆成字段」，
 * 不回答「拆出来的字段组合在乐理上讲不讲得通」。例如字段化之后完全能表达
 * `{ third:'min3', fifth:'dim5', seventh:'dim7' }`（减七）与
 * `{ third:'maj3', fifth:'dim5', seventh:'dim7' }`（大三 + 减五 + 减七，即「大三度版减七」——
 * 现实中不存在这种和弦），两者都能解析成功，但后者是矛盾的。
 *
 * 这正是重构文档里那条悬而未决的待拍板事项（「解析成功但字段组合矛盾」应判非法）：
 * 旧的字符串枚举无法表达这类约束，字段化 AST 之后成本已经很低，故在此收口。
 *
 * 设计取舍：
 * - 判据只取**结构性矛盾**（同一音级既声明又省略、减七缺减五、sus 与三音并存），
 *   不取「和声习惯好不好」这类风格判断（如大七和弦挂自然十一度是否「脏」）——
 *   后者是编曲口味，不是合法性，判非法会把真实存在的谱面写法挡在门外；
 * - 只判矛盾、**不改 AST**：校验是纯读函数，修复（如果有）留给上层决定，
 *   避免「校验顺手把输入改写成另一个和弦」这种静默行为。
 */
import { normalizeAst } from './chordQualityAst';

import type { ChordQualityAst } from './chordQualityAst';

/** 归一化后的 AST（缺省字段已补成显式 'none'；省略标记仍是可选布尔，故判据一律显式比较） */
type NormalizedAst = ReturnType<typeof normalizeAst>;

/** 一条矛盾判据：命中即返回说明（说明用于诊断与语料库断言，不参与运行时分支） */
interface ContradictionRule {
  id: string;
  test: (ast: NormalizedAst) => boolean;
  reason: string;
}

/**
 * 矛盾判据表。
 *
 * 逐条说明为什么算矛盾：
 * 1. 三音与五音同时省略：和弦只剩根音（外加可能的七音/张力），不再是和弦而是单音加装饰音；
 *    与 `C5`（结构性无三音、五音在场）有本质区别。
 * 2. 减七（`seventh:'dim7'`）缺减五：减七和弦的定义就是根音上堆叠三个小三度，
 *    音集必为 {1, b3, b5, bb7}；减七配纯五/增五即自相矛盾。（五音被 `no5` 显式省略时不判——
 *    音已不在，无从矛盾。）
 * 3. 减七配非小三度：同理，减七的大三度版本不存在。
 *
 * **刻意不判的两类**（写在这里以免后来者重新发明）：
 * - 「声明了三音/五音又标 omit」不是矛盾：`no3` 的配方就是 `{ third:'maj3', omitThird:true }`
 *   —— 三音槽记作大三度是为了和 `5` 和弦（结构性 `third:'none'`）区分开，
 *   这是 token 表的既有编码约定（见 chordQualityAst 的 `no3` / `no5` 条目），不是字段打架。
 * - 「和声习惯好不好」不是矛盾：大七和弦挂自然十一度（`Cmaj7(11)`）在古典和声里要避免，
 *   但它在真实谱面上存在，属编曲口味，应交由编曲者而非校验器决定。
 */
const CONTRADICTION_RULES: ContradictionRule[] = [
  {
    id: 'third-and-fifth-both-omitted',
    test: ast => ast.omitThird === true && ast.omitFifth === true,
    reason: '三音与五音同时省略，只剩根音不构成和弦',
  },
  {
    id: 'dim7-without-dim5',
    test: ast => ast.seventh === 'dim7' && ast.omitFifth !== true && ast.fifth !== 'dim5',
    reason: '减七和弦必须带减五度（1 b3 b5 bb7）',
  },
  {
    id: 'dim7-with-non-minor-third',
    test: ast => ast.seventh === 'dim7' && ast.omitThird !== true && ast.third !== 'none' && ast.third !== 'min3',
    reason: '减七和弦的三音必须是小三度',
  },
  {
    id: 'sus-with-third',
    test: ast => ast.sus !== 'none' && ast.omitThird !== true && ast.third !== 'none',
    reason: '挂留和弦的语义是三音被替代，不能同时声明三音',
  },
];

/**
 * 列出 AST 里所有自相矛盾之处。
 *
 * 返回**说明数组**（空数组 = 自洽）：调用方拿到的是可断言、可打印的诊断信息，
 * 而不是一句「不合法」——语料库要锁的是「为什么非法」，不是「非法」这个布尔值，
 * 否则新增判据时旧用例的解释会漂移。
 */
export const findAstContradictions = (ast: ChordQualityAst): string[] => {
  const normalized = normalizeAst(ast);
  return CONTRADICTION_RULES.filter(rule => rule.test(normalized)).map(rule => rule.reason);
};

/** AST 字段组合是否在乐理上自洽（无矛盾）。 */
export const isSelfConsistentQualityAst = (ast: ChordQualityAst): boolean => findAstContradictions(ast).length === 0;
