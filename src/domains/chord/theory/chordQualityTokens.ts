/**
 * 和弦性质表（「写法真相源」数据表）。
 *
 * 表本体在 `data/chord-qualities.json`。本次改动把原先分散在三处的**同一批投影**合并成
 * 「一条 token 记录」，新增同义写法只改数据文件一处：
 *
 * | 原先位置              | 内容                                              | 合并后                                |
 * | --------------------- | ------------------------------------------------- | ------------------------------------- |
 * | chordQualityTokens.ts | AST 配方 + 可接受写法                             | `ast` / `spellings`                   |
 * | chordDegree.ts        | `ROMAN_SUFFIX_BY_QUALITY`，111 条**按写法**建的表 | `romanSuffix`（+ 少数按写法的覆盖）   |
 * | chordQualityAstParse  | `SHORTHAND_SPELLING`，22 条**按 token** 的简写    | `shorthand`                           |
 * | chordName.ts          | `KNOWN_QUALITIES`，125 条写法镜像                 | 由 `spellings` 展平派生               |
 *
 * 合并掉的不只是行数，还有两处绕行：
 *
 * 1. 罗马后缀原表按**写法**建（111 条），而同一 token 的写法远多于表里列出的
 *    （`halfDim7` 一个 token 就有 6 种拼写），查不到时只能走
 *    `parseQualityText → tokenId → spellings[0] → 再查一次`。后缀现在是 token 的属性，绕行整段消失；
 *    少数**同一 token 内按写法取值不同**的情形（裸 `ø` 记作 `ø`、`ø7` 记作 `ø7`）沉到
 *    `romanSuffixBySpelling`，反而比原先 111 条扁平表更能看出「这里为什么不一样」。
 * 2. `KNOWN_QUALITIES` 是 `spellings` 的手抄镜像，实测已是真子集（少 54 项、多 1 个不可达的
 *    `13sus2`），与它自己声称的「值域真相源是 QUALITY_TOKENS」相矛盾。改为派生后不再会漂移。
 *
 * 依赖方向：本文件只 **type-only** 依赖 chordQualityAst 的 ChordQualityAst，运行时零出边；
 * 反向由 chordQualityAst 值依赖本文件——故运行时依赖单向，不存在循环。
 */

import rawChordQualities from '@data/chord-qualities.json';

import type { ChordQualityAst } from './chordQualityAst';

// ============================================================
// 记录形状
// ============================================================

/** 一个性质 token：AST 「配方」+ 该配方的全部投影（写法 / 罗马后缀 / 简写）。 */
export interface QualityToken {
  /** token 稳定标识（供调试与 diff，不参与业务判定） */
  id: string;
  /** 该 token 代表的性质 AST */
  ast: ChordQualityAst;
  /**
   * 可接受的**原始写法**（解析用）。数组首项同时作为渲染时的**首选全称**。
   * 匹配时对「候选写法」与「输入」同时做大小写折叠比较——但只有在
   * 表里显式列出过的大写变体才折叠，绝不会把 `M7`（大七）与 `m7`（小七）混为一谈：
   * 两者是两个不同 token，各自列出自己的写法。
   */
  spellings: string[];
  /** 罗马数字级数后缀（`maj7` → `maj7`、`m7` → `7`、`dim` → `°`）；无后缀为空串。 */
  romanSuffix: string;
  /**
   * 同一 token 内**按写法**区分的罗马后缀覆盖。
   * 只在「同一配方的不同写法在罗马数字里习惯写法不同」时出现（如 `sus4dom9` 的
   * `9sus4` / `9sus` / `11sus4` / `11sus` 各保留原写法后缀）；未列出的写法取 `romanSuffix`。
   */
  romanSuffixBySpelling?: Record<string, string>;
  /** 渲染简写（`maj7` → `M7`）；缺省即 `spellings[0]`。 */
  shorthand?: string;
  /**
   * 是否为**纯记谱写法**：表达的是「本该有的音被撤掉」（`no3` / `no5`）或
   * 「同一块音被声明两遍」（`9sus2`），而非一个独立的配方。
   *
   * 解析 / 渲染必须认识它们（`Cno3` 是合法输入，往返要原样还原），但**识别端要排除**：
   * 从音集无法区分「撤掉」与「本来就没弹」，放进候选只会制造无法证伪的歧义
   * （实测：`{C, E}` 被读成 `Cno5` 而不是更常规的 `C`）。
   */
  notationOnly?: boolean;
  /** 该条的设计说明。JSON 没有注释位，所以「为什么」随数据一起放在这里。 */
  _note?: string;
}

/** 数据文件里的记录形状：可选字段在加载时归一，故 `romanSuffix` 在此亦为可选。 */
type RawQualityToken = Omit<QualityToken, 'romanSuffix'> & { romanSuffix?: string };

const RAW_TOKENS = (rawChordQualities as unknown as { tokens: RawQualityToken[] }).tokens;

// ============================================================
// 加载期校验
// ============================================================

/**
 * AST 各字段的运行时值域。
 *
 * 与 chordQualityAst.ts 的联合类型是两份——类型是编译期的，校验要的是运行时的值。
 * 这不是「又一份真相源」，而是「数据 → 校验 → 类型」这条链上应有的 schema 位；
 * 新增 AST 成员时同步这里，漏加的后果是**新值被判非法、加载时抛错**（偏向失败，而非静默）。
 */
const AST_ENUM = {
  third: ['maj3', 'min3', 'none'],
  fifth: ['perf5', 'dim5', 'aug5', 'none'],
  seventh: ['maj7', 'min7', 'dim7', 'none'],
  sus: ['sus4', 'sus2', 'none'],
  degree: ['6', '9', '11', '13'],
} as const;

/** 校验一个可选枚举字段（`undefined` 视为「未指定」，合法） */
const checkEnum = (where: string, value: unknown, allowed: readonly string[]): void => {
  if (value !== undefined && !(allowed as readonly string[]).includes(value as string))
    throw new Error(`[chord-qualities] ${where} = ${JSON.stringify(value)} 不在 ${allowed.join(' / ')} 中`);
};

/**
 * 加载期校验（一次，成本可忽略）。
 *
 * 为什么必须有：表搬到 JSON 后 `ast` 的值域不再受编译期约束——把 `"third": "min3"`
 * 打成 `"min"` 不报任何错，只会让该 token 的 AST 键永远匹配不上，
 * 表现为「解析能过、识别不到」的静默退化。而配置化这张表的初衷，恰恰是让改动它的人
 * 不必先读懂内部细节。
 *
 * 为什么不用 zod：zod 是懒加载 chunk（导入 / 同步链路才拉取），乐理层在首屏静态闭包里，
 * 引它会把 120KB 拖进首屏预算。故用零依赖的结构校验。
 *
 * 宁松勿紧：只检查**真正的不变量**——误判会让整个乐理层在模块加载时就挂掉。
 */
const assertValidTokens = (tokens: RawQualityToken[]): void => {
  const seenId = new Set<string>();
  const spellingOwner = new Map<string, string>();

  for (const token of tokens) {
    if (!token.id || !Array.isArray(token.spellings) || token.spellings.length === 0)
      throw new Error(`[chord-qualities] token 缺少 id 或 spellings：${token.id || '(无 id)'}`);

    if (seenId.has(token.id)) throw new Error(`[chord-qualities] token id 重复：${token.id}`);

    seenId.add(token.id);

    // 写法在两个 token 间重复，会让「谁先登记谁赢」的查找变成顺序依赖的隐式规则
    for (const spelling of token.spellings) {
      const owner = spellingOwner.get(spelling);
      if (owner !== undefined)
        throw new Error(`[chord-qualities] 写法重复：${JSON.stringify(spelling)} 同属 ${owner} 与 ${token.id}`);

      spellingOwner.set(spelling, token.id);
    }

    const ast = token.ast ?? {};
    checkEnum(`${token.id}.ast.third`, ast.third, AST_ENUM.third);
    checkEnum(`${token.id}.ast.fifth`, ast.fifth, AST_ENUM.fifth);
    checkEnum(`${token.id}.ast.seventh`, ast.seventh, AST_ENUM.seventh);
    checkEnum(`${token.id}.ast.sus`, ast.sus, AST_ENUM.sus);
    for (const ext of ast.extensions ?? []) {
      checkEnum(`${token.id}.ast.extensions[].degree`, ext.degree, AST_ENUM.degree);
      if (ext.accidental !== 1 && ext.accidental !== 0 && ext.accidental !== -1)
        throw new Error(
          `[chord-qualities] ${token.id}.ast.extensions[].accidental = ${String(ext.accidental)} 必须是 1 / 0 / -1`
        );
    }

    // 覆盖表的键必须真是该 token 的写法，否则是永远不会命中的死数据
    for (const spelling of Object.keys(token.romanSuffixBySpelling ?? {}))
      if (!token.spellings.includes(spelling))
        throw new Error(
          `[chord-qualities] ${token.id}.romanSuffixBySpelling 的键 ${JSON.stringify(spelling)} 不是该 token 的写法`
        );
  }
};

assertValidTokens(RAW_TOKENS);

// ============================================================
// 表本体
// ============================================================

/**
 * 性质 token 表。顺序即优先级：解析时先匹配到的 token 胜出；渲染时用 `spellings[0]`。
 * 长写法排在前面，避免 `m` 抢走 `maj7` 的前缀。
 */
export const QUALITY_TOKENS: QualityToken[] = RAW_TOKENS.map(token => ({
  ...token,
  romanSuffix: token.romanSuffix ?? '',
}));

// 「写法 → 罗马后缀」的派生索引与 token 查找设施一起放在 chordQualityAst.ts 的「查表设施」一节：
// 本文件只管表本体与记录形状，索引属于消费侧设施——与 TOKEN_BY_SPELLING 同处便于一起看。
