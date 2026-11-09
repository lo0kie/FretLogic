/**
 * 和弦名 AST 的解析器与渲染器。
 *
 * 解析路径（文本 → AST）与渲染路径（AST → 文本）**共用同一张 token 表**，
 * 这是本模块相对旧实现最要紧的一处结构改进：旧实现里「解析」读枚举、「识别」读语法表，
 * 两张表各写一份拼写规则，于是必然出现「能输入 `CM7`、但语法表里只有 `Maj7`」这类
 * 单向不对称（实测语法表覆盖率仅 42/74）。
 *
 * 解析策略：根音 → 斜杠低音 → 性质（token 表最长匹配）→ 尾随扩展音（`#9` / `b13` / `69`…）。
 * 与旧实现最大的行为差异是**扩展音不再抢在性质之前剥**：`C7b5` 会先匹配到 `7b5` token
 * （整个配方一体），而不是把 `b5` 剥成张力音后再回头用正则补丁把 `m7` 改写成 `m7b5`。
 * 半减七因此不再是「特判出来的」，而是 token 表里一个正常的配方。
 */

import { findTokenBySpelling, QUALITY_TOKENS, qualitySpellingsByLength } from './chordQualityAst';
import { formatAccidental } from './pitch';

import type { ChordNameAst, ChordQualityAst, ExtensionDegree, ExtensionNode, QualityToken } from './chordQualityAst';
import type { AccidentalType, NaturalPitchLetter, RootSegment } from '@/domains/chord/types';

// ============================================================
// 一、文本归一化与音名解析
// ============================================================

/**
 * 归一键：去首尾空白 + 全角括号转半角 + 全角/Unicode 升降号转半角（`♯`/`＃` → `#`、`♭` → `b`）。
 * 使 `Cm7（b5）` 与 `Cm7(b5)`、`F♯m7` 与 `F#m7` 走完全同一条解析路径。
 *
 * 本键**不处理反斜杠低音前缀**（`C\E` 这类记法全仓都不支持，旧 `toChordNameKey` 同样没有）——
 * 此前注释把「反斜杠低音前缀 → 半角」也算作在此收敛，与实现不符。
 */
export const normalizeChordNameText = (text: string): string =>
  text.trim().replaceAll(/（/g, '(').replaceAll(/）/g, ')').replaceAll(/[♯＃]/g, '#').replaceAll(/[♭]/g, 'b');

const PITCH_RE = /^([A-Ga-g])([#b]?)/;

/** 从字符串开头解析一个音名（自然音名 + 可选升降号）。 */
export const parsePitchAt = (text: string, start = 0): { segment: RootSegment; length: number } | null => {
  const match = PITCH_RE.exec(text.slice(start));
  if (!match) return null;
  const [, naturalRaw, accChar] = match;
  const natural = naturalRaw!.toUpperCase() as NaturalPitchLetter;
  const accidental: AccidentalType = accChar === '#' ? 1 : accChar === 'b' ? -1 : 0;
  return { segment: [natural, accidental], length: match[0].length };
};

// ============================================================
// 二、尾随扩展音解析
// ============================================================

/** 把度数写法折算成标准扩展度数：`add2` 与 `add9` 同义、`add4` 与 `add11` 同义。 */
const canonicalizeDegree = (raw: string): ExtensionDegree | null => {
  if (raw === '2') return '9';
  if (raw === '4') return '11';
  if (raw === '6' || raw === '9' || raw === '11' || raw === '13') return raw;
  return null;
};

/**
 * 从性质之后的残余串里解析扩展音序列，例如 `#9b13`、`(b5)`、`69`、`#11`。
 * 返回消费掉的字符长度与解析出的扩展音。
 *
 * **消费的是「能解析出的最长前缀」，不是「整串」**：解析到某一位失败时回退到上一个成功节点，
 * 把已解析出的节点与长度照实返回。调用方一律用 `nodes.length === 0` 判「这一段根本不是扩展音」，
 * 剩余未消费的字符由调用方自己的「是否还有残余」判据兜住（`i !== trimmed.length` → 解析失败），
 * 故两种口径对既有调用方等价。
 *
 * 之所以必须是前缀而非全串：省略标记可以缀在张力音之后（`7#9(no3)`），组合式解析要能
 * 「先吃掉 `#9`、再把剩下的 `(no3)` 交给省略标记解析」——整串失败就丢弃已解析结果的话，
 * 这一位之后的省略标记永远读不到。
 */
const parseTrailingExtensions = (text: string): { nodes: ExtensionNode[]; consumed: number } => {
  const nodes: ExtensionNode[] = [];
  let i = 0;
  while (i < text.length) {
    const start = i; // 本轮起点：任一步失败即回退到此，绝不吃掉半截

    // 可选括号包裹单个扩展音
    const parenOpen = text[i] === '(';
    if (parenOpen) i++;

    let accidental: AccidentalType = 0;
    const accChar = text[i];
    if (accChar === '#') {
      accidental = 1;
      i++;
    } else if (accChar === 'b') {
      accidental = -1;
      i++;
    }

    const digitMatch = /^\d+/.exec(text.slice(i));
    if (!digitMatch) {
      i = start;
      break;
    }

    const degree = canonicalizeDegree(digitMatch[0]);
    if (!degree) {
      i = start;
      break;
    }

    i += digitMatch[0].length;
    if (parenOpen) {
      if (text[i] !== ')') {
        i = start;
        break;
      }
      i++;
    }
    nodes.push({ degree, accidental });
  }
  return { nodes, consumed: i };
};

/**
 * 从性质残余串开头解析**省略标记**：`no3` / `no5` / `(no3)` / `(no5)`，大小写不敏感。
 *
 * 省略标记是**可叠加的后缀**（`7(no3)(no5)`），也是**可与其它性质组合**的
 * （`maj9(no3)` = 大九和弦撤掉三音）—— 与 token 表里那两条 `notationOnly` 条目
 * （`no3` / `no5`）是同一套语义，只是那两条只能整体命中、拼不出组合形态。
 *
 * 括号必须成对：`(no3)` 合法，`(no3` / `no3)` 不合法。写法上的括号只是变体，
 * 渲染端一律收敛到无括号形态（与 `C7(#9)` → `C7#9` 同一口径）。
 */
const parseOmitMarkers = (text: string): { omitThird: boolean; omitFifth: boolean; consumed: number } => {
  let i = 0;
  let omitThird = false;
  let omitFifth = false;
  while (i < text.length) {
    const match = /^(\(?)no([35])(\)?)/i.exec(text.slice(i));
    if (!match) break;
    // 括号必须成对
    if (Boolean(match[1]) !== Boolean(match[3])) break;
    if (match[2] === '3') omitThird = true;
    else omitFifth = true;
    i += match[0].length;
  }
  return { omitThird, omitFifth, consumed: i };
};

/**
 * 省略标记的规范文本：**一律带括号**（固定 3 在前、5 在后，与 `baseTriadText` 的既有次序一致）。
 *
 * 与张力音的「收敛掉括号」是两条口径，别混：`#9` / `b13` 紧跟性质、与度数不粘连，
 * `C7(#9)` 收敛成 `C7#9` 无损可读；省略标记却常常接在一个数字后面（`maj9no3` / `13no3`），
 * 不隔开既难读、也容易被读成度数的一部分。故这里保留括号：`maj9(no3)` / `13(no3)`。
 *
 * 解析端两种写法都收（`Gmaj9no3` 与 `Gmaj9(no3)` 解析结果相同），规范化只收敛到带括号这一种。
 */
const omitMarkerText = (flags: { omitThird?: boolean; omitFifth?: boolean }): string => {
  const parts: string[] = [];
  if (flags.omitThird) parts.push('no3');
  if (flags.omitFifth) parts.push('no5');
  return parts.length > 0 ? `(${parts.join('')})` : '';
};

// ============================================================
// 三、性质解析
// ============================================================

/**
 * 在文本开头做 token 最长匹配，返回命中的 token 与消耗长度。
 * 使用全局按长度降序的写法表，保证 `maj7` 不会被 `maj` 前半截走、`m7b5` 不会被 `m7` 截走。
 */
/**
 * 在文本开头做 token 最长匹配，返回命中的 token、**原始写法串**与消耗长度。
 *
 * 返回原始写法是因为同义写法（`add2`/`add9`、`°7`/`dim7`、`M7`/`maj7`）必须能原样还原：
 * 只回 token 的话渲染端只能取首选写法，`Cdim7` 会被显示成 `C°7`。
 *
 * 匹配分两轮，顺序不能颠倒：
 * 1. **精确匹配**（含大小写）：`M7` 必须有别于 `m7`，这是语义红线
 * 2. **受限折叠匹配**：表里显式登记过、且不含 `M`/`m`/`-` 记号的写法才参与
 *
 * 写法表按长度降序，保证 `maj7` 不被 `maj` 前半截走、`m7b5` 不被 `m7` 截走。
 */
export const matchQualityToken = (text: string): { token: QualityToken; spelling: string; length: number } | null => {
  if (text === '') return { token: MAJOR_TOKEN(), spelling: '', length: 0 };

  /**
   * 一轮内取**最长命中**，且两轮的结果按「先精确、再折叠」定优先级——但**长度优先于轮次**。
   *
   * 为什么长度必须优先：`MAJ7` 上精确轮能命中 `M`（长度 1），折叠轮能命中 `MAJ7`（长度 4）。
   * 若按「精确轮先返回」，`CMAJ7` 会被切成 `C` + 残余 `AJ7` 而整体解析失败
   * （这正是实测踩到的 case）。故先各自取本轮最长，再比长度；长度相同才让精确轮赢。
   */
  const longestIn = (compare: (candidate: string, spelling: string) => boolean) => {
    let best: { token: QualityToken; spelling: string; length: number } | null = null;
    for (const spelling of qualitySpellingsByLength()) {
      if (spelling.length > text.length) continue;
      if (best && spelling.length <= best.length) continue;
      const candidate = text.slice(0, spelling.length);
      if (!compare(candidate, spelling)) continue;
      const token = findTokenBySpelling(candidate);
      if (token) best = { token, spelling: candidate, length: spelling.length };
    }
    return best;
  };

  const exact = longestIn((candidate, spelling) => candidate === spelling);
  const folded = longestIn((candidate, spelling) => candidate.toLowerCase() === spelling.toLowerCase());

  if (exact && folded) return folded.length > exact.length ? folded : exact;
  return exact ?? folded;
};

/** 空性质兜底 token（大三和弦）。
 *
 *  表在加载期已断言「空写法存在」（见 chordQualityTokens 的 assertValidTokens），这里不再用非空断言：
 *  非空断言只把「表被改坏」的后果留给运行期 —— 打开任意裸三和弦时抛一句 `Cannot read properties of
 *  undefined (reading 'ast')`，看不出是表的问题。显式抛错把成因写清楚，成本是一个分支。 */
const MAJOR_TOKEN = (): QualityToken => {
  const token = findTokenBySpelling('');
  if (!token) throw new Error('[chord-qualities] 缺少空写法：裸三和弦的兜底 token 不可用');

  return token;
};

/** 合并 AST：把 `overlay` 的非空字段盖到 `base` 上（扩展音做并集，按度数与升降去重）。 */
export const mergeAst = (base: ChordQualityAst, overlay: ChordQualityAst): ChordQualityAst => {
  const merged: ChordQualityAst = { ...base, ...overlay };
  const exts = [...(base.extensions ?? []), ...(overlay.extensions ?? [])];
  if (exts.length > 0) {
    const seen = new Set<string>();
    const deduped: ExtensionNode[] = [];
    for (const e of exts) {
      const key = `${e.degree}|${e.accidental}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(e);
    }
    deduped.sort((a, b) => DEGREE_ORDER[a.degree] - DEGREE_ORDER[b.degree] || a.accidental - b.accidental);
    merged.extensions = deduped;
  }
  return merged;
};

const DEGREE_ORDER: Record<ExtensionDegree, number> = { '6': 0, '9': 1, '11': 2, '13': 3 };

/**
 * 解析性质文本（不含根音 / 斜杠低音）为 AST。
 *
 * 处理三类形态：
 * 1. 纯 token：`m7` / `maj7` / `ø7` / `13`
 * 2. token + 尾随扩展音：`7#9` / `maj7#11` / `m7b5`（后者本身即有专属 token，走 token 分支）
 * 3. 基础 token + `add` 家族：`sus4add9` / `madd9` —— 「基础性质 + add 音」的组合式，
 *    正是旧枚举无法表达、被 `sus4add9` 逐字列一行的那种情况
 *
 * 省略标记（`no3` / `no5` / `(no3)` / `(no5)`）与上述三类一样**可组合**：
 * `maj9(no3)` = 大九和弦撤掉三音。它缀在基础性质之后、可与尾随张力音交替出现，
 * 与「只有单独一条 `no3` token」是两件事（那一条只能整体命中）。
 *
 * ⚠️ 当前**没有生产调用方**（`chordName` 侧只走 `parseQualityText` / `renderQualityAst`）。
 * 保留是因为它是解析层的对外 API 入口之一；**实现直接委托 `parseQualityWithToken`** ——
 * 这里原先另抄了一份「整词优先 + 组合式」的策略，两份并存意味着解析策略一改就要改两处，
 * 漏一处就是「同一个性质串在两个入口解析出不同 AST」。委托后只剩一份实现。
 */
export const parseQualityAst = (text: string): ChordQualityAst | null => parseQualityWithToken(text)?.ast ?? null;

// ============================================================
// 四、完整和弦名解析
// ============================================================

export interface ParseChordNameAstResult {
  ast: ChordNameAst;
  /** 性质命中的 token id（同义写法区分用；未识别时为 undefined） */
  qualityTokenId?: string;
  /** 性质命中的**原始写法**（渲染优先还原它，使 `Cdim7` 不会变成 `C°7`） */
  qualitySpelling?: string;
  /** 性质文本是否被完整识别；false 时调用方应视为「未知性质」 */
  qualityRecognized: boolean;
  /** 未识别的性质残余（供 UI 原样展示） */
  unknownQuality?: string;
}

/**
 * 性质文本 → AST，同时给出**可拼回原文的两段**：质量部分文本 + 尾随扩展音。
 *
 * 返回契约的关键是「质量文本」与「尾随扩展音」要能**无损拼回输入**：
 *   `质量文本 + 依次渲染(尾随扩展音) === 输入`
 * 调用方（`nameToSegments`）据此把两者分别落到 `quality` 与 `extensions` 两个字段。
 *
 * 这里曾有一处缺陷：只要基础 token 只覆盖输入的一部分（`7b9b13` 里的 `7b9`），
 * 就把 `spelling` 置为 `undefined`，于是**基础写作文本整个丢失**，调用方只能拿
 * 整串 `7b9b13` 当质量文本、再把 `b13` 单列一遍，拼回时就成了 `C7b9b13b13`。
 * 正确做法是把基础写作作为质量文本返回，尾随部分单独列出。
 *
 * `tokenId` 只在**整词命中**时给出：组合写法（基础 + add / 基础 + 张力音）
 * 与任何单条 token 的写法都不完全等价，渲染时须走 `findTokenByAst` 或组合式兜底。
 */
/**
 * 叠加一个**后续**记号片段：只取它**明确断言**的部分。
 *
 * 【为什么不能直接 `mergeAst`】后者是「后者覆盖前者」，而 token 的 AST 里带着**默认值** ——
 * 大三和弦的 `third: 'maj3'`、`fifth: 'perf5'` 不是断言，只是「这里用的是常规三音 / 纯五」。
 * 让默认值参与覆盖，`+`（`fifth: 'aug5'`）就会被后面的 `M9`（`fifth: 'perf5'`）抹掉 ——
 * 实测 `+M9` 曾解析成 `{大三, 纯五, 大七, 九音}`（增五丢了），而 `M9#5` 因为顺序相反反倒是对的。
 * 按「默认值不参与覆盖」处理，两种顺序才都得到 `{大三, 增五, 大七, 九音}`。
 *
 * 这也符合记号的读法：`+M9` 里 `M9` 断言的是「大七 + 九音」，它的「大三音」是隐含的、
 * 不是在给一个已经写明增五的和弦改五音。
 *
 * 跳过的是**默认值**，不是「空值」：`third: 'none'`（`sus` / 强力 / no3 断言「没有三音」）、
 * `sus`、`omitThird` / `omitFifth` / `alt` 都要带上；`fifth: 'none'`（类型注释写明是「未指定」）
 * 与 `seventh: 'none'` 才是真的「不表态」。
 */
const overlayAsserted = (ast: ChordQualityAst): ChordQualityAst => {
  const out: ChordQualityAst = {};
  if (ast.third !== undefined && ast.third !== 'maj3') out.third = ast.third;
  if (ast.fifth !== undefined && ast.fifth !== 'perf5' && ast.fifth !== 'none') out.fifth = ast.fifth;
  if (ast.seventh !== undefined && ast.seventh !== 'none') out.seventh = ast.seventh;
  if (ast.sus !== undefined && ast.sus !== 'none') out.sus = ast.sus;
  if (ast.omitThird) out.omitThird = true;
  if (ast.omitFifth) out.omitFifth = true;
  if (ast.alt) out.alt = true;
  if (ast.extensions && ast.extensions.length > 0) out.extensions = ast.extensions;
  return out;
};

const parseQualityWithToken = (
  text: string
): { ast: ChordQualityAst; tokenId?: string; spelling: string; trailing: ExtensionNode[] } | null => {
  const trimmed = normalizeChordNameText(text);
  if (trimmed === '') return { ast: MAJOR_TOKEN().ast, tokenId: 'major', spelling: '', trailing: [] };

  const wholeHit = matchQualityToken(trimmed);
  if (wholeHit?.length === trimmed.length)
    return { ast: wholeHit.token.ast, tokenId: wholeHit.token.id, spelling: wholeHit.spelling, trailing: [] };

  // 【组合式：**依次**吃下若干「基础片段 + 可选后缀」，逐段合并】
  // 原先只允许**一个**基础 token，于是「两个记号叠起来」的写法一律解析不出来：
  // `+M9` 里 `+` 命中 `aug`（`+` 是它的拼写），剩下的 `M9` 是另一个基础，无处安放 ——
  // 表里那些 `+M7` / `+Δ7` / `M7#5` 整词拼写就是为了绕过这条限制而逐个列出来的。
  // 改成循环后，`+M9` / `+Δ9` / `M9#5` 这类组合由 `aug` 与 `maj9` 两块 AST 合并得到，
  // 不必再为每一种记号组合补一行数据（`+M9` 的合并结果正是 {大三, 增五, 大七, 九音}）。
  //
  // **这是纯增量**：整词命中仍在上方提前返回；单片段输入的走法与原先逐字相同
  // （首轮迭代就是原来的「基础 + add + 尾随扩展音/省略标记」），只有原先返回 null 的
  // 「多基础」输入从「不认识」变成「认识」。
  let ast: ChordQualityAst = {};
  let spelling = '';
  let i = 0;
  const trailing: ExtensionNode[] = [];

  while (i < trimmed.length) {
    const segmentStart = i;

    // ① 基础片段：命中一个 token 就并入。**首个**片段没命中时退回大三和弦 ——
    //    `#9` / `(no3)` 这类「只有后缀」的写法，质量部分本就是空的大三和弦；
    //    后续片段没命中就是真不认识（返回 null）
    const hit = matchQualityToken(trimmed.slice(i));
    if (hit && hit.length > 0) {
      // 首个片段定骨架（整份 AST 都要）；后续片段只贡献它明确断言的部分（见 overlayAsserted）
      ast = mergeAst(ast, i === 0 ? hit.token.ast : overlayAsserted(hit.token.ast));
      spelling += hit.spelling;
      i += hit.length;
    } else {
      if (i > 0) return null;
      // 首个片段没命中 → 退回大三和弦：`#9` / `(no3)` 这类「只有后缀」的写法，
      // 质量部分本就是空的大三和弦
      ast = mergeAst(ast, MAJOR_TOKEN().ast);
    }

    // ② add 家族：写法需整体保留（`add2` 与 `add9` 在 AST 上无法区分）
    if (trimmed.slice(i, i + 3).toLowerCase() === 'add') {
      const rest = trimmed.slice(i + 3);
      const ext = parseTrailingExtensions(rest);
      if (ext.nodes.length === 0) return null;
      ast = mergeAst(ast, { extensions: ext.nodes });
      spelling += `add${rest.slice(0, ext.consumed)}`;
      i += 3 + ext.consumed;
    }

    // ③ 尾随扩展音与省略标记：`7#9` 之外的 `7b9b13` / `sus4add9#11` / `maj9(no3)` / `7#9(no3)`
    // 两者可交替出现（`maj7no3#9` 与 `maj7#9(no3)` 同构），故用循环逐段吃
    while (i < trimmed.length) {
      const omit = parseOmitMarkers(trimmed.slice(i));
      if (omit.consumed > 0) {
        ast = mergeAst(ast, {
          ...(omit.omitThird ? { omitThird: true } : {}),
          ...(omit.omitFifth ? { omitFifth: true } : {}),
        });
        // 省略标记并入**质量文本**（而不是像张力音那样单列）：`extensions` 是「度数 + 升降」的形状，
        // 装不下「撤掉某个音」这件事，硬塞只会让下游把它当成一个真实的音。故与基础写作拼在一起，
        // 位置紧接基础性质之后（`maj7no3#9`）—— 与 `baseTriadText` 的既有次序一致，
        // 也使「质量文本 + 依次渲染(尾随扩展音) ≡ 输入」这条契约继续成立（括号写法按惯例收敛）。
        spelling += omitMarkerText(omit);
        i += omit.consumed;
        continue;
      }

      const rest = parseTrailingExtensions(trimmed.slice(i));
      if (rest.nodes.length === 0) break;
      ast = mergeAst(ast, { extensions: rest.nodes });
      // 剥离括号：`C7(#9)` 与 `C7#9` 同构，写法统一收敛到无括号形态。
      // 与旧实现的行为差别：旧实现把整串 suffix 原样留着，于是 `m7(b5)` 与 `m7b5`
      // 在缓存里占两个键、在下游正则里要判两次；这里在解析层就收敛掉。
      trailing.push(...rest.nodes);
      i += rest.consumed;
    }

    // ④ 本片段一个字符都没吃下 —— 再循环就是死循环，按不认识处理
    if (i === segmentStart) return null;
  }

  // 组合写法（多基础片段 / 基础 + add / 基础 + 尾随张力音）不对应任何单条 token 的写法，
  // 故不给 tokenId —— 整词命中已在上面提前返回。
  return { ast, spelling, trailing };
};

/**
 * 只解析**性质文本**（不含根音）。
 *
 * `parseChordNameAst` 要求输入是一个完整和弦名（开头必须有音名），
 * 因此 `nameToSegments` 在剥掉根音、低音之后剩下的 `m7b5` / `7alt` / `no3`
 * 不能直接交给它 —— 会被判成「无根音」而返回 null。
 * 本函数是那条路径的入口：输入即性质串，输出 AST 与来源写法。
 *
 * `recognized` 为 false 时，`ast` 是兜底的大三和弦，调用方应视为「未知性质」，
 * 不可拿它去做音集判定（否则 `Cxyz` 会被当成 `C`）。
 */
export const parseQualityText = (
  text: string
): { ast: ChordQualityAst; tokenId?: string; spelling: string; trailing: ExtensionNode[]; recognized: boolean } => {
  const parsed = parseQualityWithToken(text);
  if (!parsed) {
    const ast: ChordQualityAst = { ...MAJOR_TOKEN().ast };
    return { ast, spelling: '', trailing: [], recognized: false };
  }
  // 空性质串 = 裸三和弦，这是**识别成功**（`C` 是合法的），故 recognized 为 true
  return { ...parsed, recognized: true };
};

/**
 * 解析完整和弦名文本为 AST。
 * 失败（无根音）返回 null；性质无法识别时 `qualityRecognized: false`，但 AST 仍可用（兜底大三和弦）。
 *
 * ⚠️ 当前**没有生产调用方**（`nameToSegments` 走的是「先剥根音/低音、再把剩下的性质串交给
 * `parseQualityText`」那条路，因为本函数要求输入自带根音）。保留为解析层的完整名入口：
 * 需要「一次拿到根音 + 性质 + 斜杠低音」时用它，不要在外层再拼一遍剥根音的逻辑。
 */
export const parseChordNameAst = (input: string): ParseChordNameAstResult | null => {
  if (!input || typeof input !== 'string') return null;
  const text = normalizeChordNameText(input);
  if (!text) return null;

  // 1. 根音
  const rootHit = parsePitchAt(text, 0);
  if (!rootHit) return null;

  // 2. 斜杠低音：从**末尾**找；`6/9` 的 `/9` 因 9 非音名天然不会被误判
  let bass: RootSegment | undefined;
  let qualityEnd = text.length;
  const slashMatch = /\/\s*([A-Ga-g][#b]?)$/.exec(text);
  if (slashMatch && slashMatch.index >= rootHit.length) {
    const bassSeg = parsePitchAt(slashMatch[1]!, 0);
    if (bassSeg) {
      bass = bassSeg.segment;
      qualityEnd = slashMatch.index;
    }
  }

  // 3. 性质 = 根音之后、斜杠低音之前
  const qualityText = text.slice(rootHit.length, qualityEnd);
  const parsed = parseQualityWithToken(qualityText);

  if (!parsed)
    return {
      ast: { root: rootHit.segment, quality: {}, ...(bass ? { bass } : {}) },
      qualityRecognized: false,
      unknownQuality: qualityText,
    };

  return {
    ast: { root: rootHit.segment, quality: parsed.ast, ...(bass ? { bass } : {}) },
    ...(parsed.tokenId ? { qualityTokenId: parsed.tokenId } : {}),
    ...(parsed.spelling !== undefined ? { qualitySpelling: parsed.spelling } : {}),
    qualityRecognized: true,
  };
};

// ============================================================
// 五、渲染
// ============================================================

const DEGREE_RENDER_ORDER: ExtensionDegree[] = ['6', '9', '11', '13'];

// 升降号渲染与解析共用 pitch.formatAccidental（原先这里另持一份 formatAccidentalText 拷贝）

const sortExtensions = (exts: ExtensionNode[]): ExtensionNode[] =>
  [...exts].sort(
    (a, b) =>
      DEGREE_RENDER_ORDER.indexOf(a.degree) - DEGREE_RENDER_ORDER.indexOf(b.degree) || a.accidental - b.accidental
  );

const astEqualsToken = (a: ChordQualityAst, b: ChordQualityAst): boolean => {
  const key = (x: ChordQualityAst): string => {
    const exts = (x.extensions ?? [])
      .map(e => `${e.accidental === 1 ? '#' : e.accidental === -1 ? 'b' : ''}${e.degree}`)
      .join(',');
    return [
      x.third ?? 'none',
      x.fifth ?? 'none',
      x.seventh ?? 'none',
      x.sus ?? 'none',
      exts,
      x.omitThird ? 1 : 0,
      x.omitFifth ? 1 : 0,
      x.alt ? 1 : 0,
    ].join('|');
  };
  return key(a) === key(b);
};

/** 在 token 表里找与给定 AST 配置等价的 token（用于渲染回标准写法）。 */
export const findTokenByAst = (ast: ChordQualityAst): QualityToken | undefined =>
  QUALITY_TOKENS.find(t => astEqualsToken(t.ast, ast));

/** AST 去掉扩展音之后的**骨架** —— 「这个和弦叫什么」由骨架决定，扩展音是叠加在它上面的一维。 */
const skeletonOf = (ast: ChordQualityAst): ChordQualityAst => {
  const { extensions: _extensions, ...rest } = ast;
  return rest;
};

/**
 * 扩展度的层级，用于「高扩展度蕴含低扩展度」（见 `applyExtensionRules` 的规则①）。
 * 只列 9 / 11 / 13：`6` 不是堆叠出来的度数，变化音是独立张力音，两者都不参与蕴含。
 */
const EXTENSION_RANK: Partial<Record<ExtensionDegree, number>> = { '9': 1, '11': 2, '13': 3 };

/**
 * 「借 `N` 这个名字」所要求的低度数堆叠 —— `11` 蕴含九音、`13` 蕴含九音（十一音可省，
 * `13` 与 `13#11` 都不写十一音）。
 *
 * 这张表是规则②的**前提**，不是可选项：堆叠不完整时借用那个名字会把音集说错 ——
 * `m7` + 11（没有九音）若写成 `m11`，读回来就多了一个九音。缺项时基名保留 `7`、度数原样缀在后面
 * （`m711`），与表里 `M7#11`（maj7 + #11，同样没有九音）的处理方式一致。
 */
const REQUIRED_BELOW: Partial<Record<ExtensionDegree, ExtensionDegree[]>> = {
  '9': [],
  '11': ['9'],
  '13': ['9'],
};

const canAbsorbAs = (degree: ExtensionDegree, exts: ExtensionNode[]): boolean =>
  (REQUIRED_BELOW[degree] ?? []).every(need => exts.some(n => n.degree === need && n.accidental === 0));

/**
 * 骨架基名：在表里找一个**骨架相同**的 token，取它的首选写法（简写时取它的 shorthand）。
 *
 * 【为什么按骨架找而不是按整个 AST 找】扩展音是可叠加的一维，骨架才是命名的主体。
 * `augMaj7` 表里有、`augMaj7add9` 没有，但两者骨架都是 `{大三, 增五, 大七}` —— 后者的基名
 * 直接取前者的写法即可，**不必为每一种扩展组合再补一行**。这正是原先那张表要按组合铺开的原因：
 * 它把「骨架的命名」与「扩展音的记法」揉进了同一行，于是两者只能一起增加。
 *
 * 优先取**不带扩展音**的同骨架 token：`{大三, 纯五}` 这一骨架同时属于裸三和弦、`6`、`add9`，
 * 其中不带扩展的那条才是「骨架本身」的名字（裸三和弦 → 空串）。取错的话 `C6` 会被当成
 * 「骨架叫 6」而把 6 再叠一遍。
 *
 * 返回 `null` 表示表里没有同骨架的 token（此时调用方回落到拼装式骨架，见 `baseTriadText`）；
 * 返回空串是**有效结果**（裸大三和弦的写法就是空串），两者必须分开。
 */
const findSkeletonTokenText = (ast: ChordQualityAst, shorthand: boolean): string | null => {
  const skeleton = skeletonOf(ast);
  const candidates = QUALITY_TOKENS.filter(t => astEqualsToken(skeletonOf(t.ast), skeleton));
  if (candidates.length === 0) return null;
  const bare = candidates.find(t => (t.ast.extensions ?? []).length === 0) ?? candidates[0]!;
  return shorthand ? (bare.shorthand ?? bare.spellings[0]!) : bare.spellings[0]!;
};

/**
 * 把扩展音按记谱惯例接到基名上。三条规则都能在表内逐条对上（对照见
 * `tests/domain/chordQualitySurface.test.ts`）：
 *
 * ① **高扩展度蕴含低扩展度**：`11` 本就是 7+9+11、`13` 本就是 7+9+11+13。把被蕴含的那些也写出来，
 *    会让「和弦本来的堆叠」与「额外加了这几个音」看起来一样（`13` 写成 `9#11 13`）——
 *    故只留**不低於被吸收那个度数**的项。变化音（`#9` / `b13`）不受影响：它们是独立张力音。
 * ② **最高的自然扩展度吸收七音位**：`7`+9 记作 `9`、`maj7`+9 记作 `maj9`、`m7b5`+9 记作 `m9b5`、
 *    `7sus4`+9+13 记作 `13sus4` —— 一律是「把基名里那个 `7` 换成那个度数」，而不是并排写成
 *    `79` / `maj79`。这一条同时解决了顺序问题：度数落在七音位原本的位置上，不必再争论
 *    「七音在前还是五音在前」。
 * ③ **无七音时 9/11/13 要写 `add`**：`add9` 是三和弦加九音、`9` 是七和弦（含 b7）的九音 ——
 *    同一批音在两种骨架下名字不同，靠这一条分开。6 不在此列（`6` 就是裸 `6`）。
 *
 * ⚠️ 规则②有**前提**（见 `REQUIRED_BELOW`）：名字里的度数蕴含它下面的堆叠，故只有堆叠完整时
 * 才能借那个名字。`m7` + 11 若并成 `m11`，就把「没有九音」的和弦说成了「有九音」—— 音集不同，
 * 是实打实的语义错误（`Gm711` 与 `Gm11` 差一个 A 音）。
 */
const applyExtensionRules = (base: string, ast: ChordQualityAst): string => {
  const exts = sortExtensions(ast.extensions ?? []);
  if (exts.length === 0) return base;

  /** 自然扩展度的层级；`6` 与变化音不在其中（不参与蕴含，也不吸收七音位） */
  const rankOf = (node: ExtensionNode): number | undefined =>
    node.accidental !== 0 ? undefined : EXTENSION_RANK[node.degree];

  const naturalTop = [...exts].reverse().find(n => rankOf(n) !== undefined);
  // 吸收的前提：堆叠完整（见 REQUIRED_BELOW）且基名里确有一个七音位可换
  const absorb = naturalTop && base.includes('7') && canAbsorbAs(naturalTop.degree, exts) ? naturalTop : undefined;

  // ① 只留不低於被吸收度数的项（6 与变化音 rank 为 undefined，一律保留）
  const kept = absorb ? exts.filter(n => rankOf(n) === undefined || rankOf(n)! >= rankOf(absorb)!) : exts;

  // ② 把基名里的 `7` 换成被吸收的度数
  let head = base;
  let rest = kept;
  if (absorb) {
    head = base.replace('7', absorb.degree);
    rest = kept.filter(n => n !== absorb);
  }

  const suffix = rest.map(n => `${formatAccidental(n.accidental, false)}${n.degree}`).join('');
  // ③ 无七音才写 add（6 不算，它本来就不带 add）
  const addPrefix = (ast.seventh ?? 'none') === 'none' && naturalTop !== undefined ? 'add' : '';
  return `${head}${addPrefix}${suffix}`;
};

/**
 * 基础三音 / 五音 / 挂留 / 七音的组合式骨架（不匹配任何 token 时的输出起点）。
 *
 * **必须补写 `no3` / `no5`**：`{ third:'maj3', fifth:'perf5', omitThird:true }` 与
 * 纯大三和弦展开出**同一个音集** `{0,4,7}`，只有写进 `no3` 才能把两者分开。
 * 早期版本漏写这两项，导致识别层即使通过槽位信息认出了省略类写法，
 * 渲染层也拿不出对应文本 —— `Cno3` 会被静默渲染回 `C`。
 */
const baseTriadText = (ast: ChordQualityAst): string => {
  const omitText = `${ast.omitThird ? 'no3' : ''}${ast.omitFifth ? 'no5' : ''}`;
  if (ast.sus === 'sus4') return `${ast.seventh === 'min7' ? '7' : ''}sus4${omitText}`;
  if (ast.sus === 'sus2') return `${ast.seventh === 'min7' ? '7' : ''}sus2${omitText}`;
  if (ast.third === 'none' && ast.fifth === 'perf5') return `${ast.seventh === 'min7' ? '7' : ''}5${omitText}`;
  const third = ast.third === 'min3' ? 'm' : '';
  const fifth = ast.fifth === 'dim5' ? 'b5' : ast.fifth === 'aug5' ? '#5' : '';
  const seat = ast.seventh === 'min7' ? '7' : ast.seventh === 'maj7' ? 'M7' : ast.seventh === 'dim7' ? '°7' : '';
  return `${third}${seat}${fifth}${omitText}`;
};

/**
 * 简写（`maj7` → `M7`）原先在这里按 token id 列成一张 22 条的表，现已随 token 合并进
 * `data/chord-qualities.json` 的 `shorthand` 字段（缺省即 `spellings[0]`）。
 * 合并后「同一配方的全称与简写」在数据文件里相邻可读，不再分处两个模块、靠 id 字符串对齐。
 */

/**
 * 需要「组合式」输出而非 token 首选写法的条目。
 *
 * `add` 家族与 `6/9` 是两类典型：
 * - `add9`（无七音）与 `9`（有七音）音集**不同**，全称必须保留 `add` 前缀，
 *   否则 `Cadd9` 会被渲染成 `C9` —— 语义漂移。
 * - `C6/9` 与 `C69` 同音，但只有 `6/9` 是无歧义写法。
 */
const COMPOSED_QUALITY_IDS = new Set([
  'add9',
  'add2',
  'add11',
  'add4',
  'add13',
  'madd9',
  'madd2',
  'madd11',
  'madd4',
  'madd13',
  'sixNine',
  'm6Nine',
]);

/**
 * add 家族 / 6-9 的组合式渲染。
 *
 * `add2` 与 `add9` 音集相同但写法不同，故优先用 `explicitSpelling`（用户当初的写法），
 * 没有时再回落到 token 的首选写法。这样 `Cadd2` 不会显示成 `Cadd9`。
 */
const renderComposed = (token: QualityToken, _ast: ChordQualityAst, explicitSpelling?: string): string => {
  if (token.id === 'sixNine') return '6/9';
  if (token.id === 'm6Nine') return 'm6/9';

  // add 家族：优先保留用户当初的写法（`add2` 与 `add9` 音集相同但写法不同），否则回落含 add 的首选拼写
  return explicitSpelling ?? token.spellings.find(s => s.includes('add')) ?? token.spellings[0]!;
};

/**
 * **规则层**：从 AST 直接推出写法，不查「整配方」的 token。
 *
 * 与 `renderQualityAst` 的分工：后者优先复用表内条目（用户写的 `dim7` 要还他 `dim7`、
 * `add2` 与 `add9` 同音集要靠 token id 区分），查不到才落到这里；本函数则**不查整配方**，
 * 只按骨架与扩展音两条规则拼。它的存在有两个用途：
 * ① 作为渲染的最后兜底，保证**任意** AST 都有与表内同源的写法；
 * ② 作为「表能缩到多小」的判据 —— 拿它对全部 token 跑一遍，与表内首选写法比对，
 *    对得上的那些行就是规则能替代的（对照见 `tests/domain/chordQualitySurface.test.ts`）。
 */
export const renderQualityFromRules = (ast: ChordQualityAst, shorthand = false): string => {
  const base = findSkeletonTokenText(ast, shorthand) ?? baseTriadText(ast);
  const text = applyExtensionRules(base, ast);
  // `alt` 后缀：基名已自带时（骨架 token 就是 `7alt`）不再重复追加
  return ast.alt && !text.includes('alt') ? `${text}alt` : text;
};

/**
 * 渲染性质 AST 回文本。
 *
 * 渲染优先级：
 * 1. add 家族 / 6-9 → 组合式（保留 `add` 前缀，避免与纯扩展和弦混淆）
 * 2. AST 与某 token 等价 → 用该 token 首选写法（或简写映射）
 * 3. 其余 → 「基础骨架 + 扩展音串联」兜底
 *
 * 第 3 条是旧枚举做不到的：**任意** AST 组合都有输出，不必在枚举里预先把这一行抄好。
 * 例如 `{ third:'min3', fifth:'dim5', seventh:'min7' }` 有专属 token 输出 `m7b5`，
 * 而 `{ third:'min3', fifth:'aug5' }`（小三 + 增五）枚举里没有，兜底输出 `m#5`。
 */
export const renderQualityAst = (
  ast: ChordQualityAst,
  options: { shorthand?: boolean; tokenId?: string; spelling?: string } = {}
): string => {
  const shorthand = options.shorthand ?? false;

  // 1. 来源写法优先：用户写的是 `dim7` 就还他 `dim7`，不擅自改成首选写法 / 简写。
  //    但 `(no3)` / `7(#9)` 这类**带括号的同义写法**除外——括号只是书写变体，
  //    收敛到无括号标准形态，避免 `C(no3)` 与 `Cno3` 在下游各占一条缓存键。
  //    这条承诺依赖数据侧配合：`data/chord-qualities.json` 里每个 token 的 `spellings[0]`
  //    （第 2 / 3 步回落取用的首选写法）**必须不带括号** —— 带括号的首选会让「无来源信息」
  //    的和弦渲染成 `Maj7(b5)`，与用户写 `M7b5` 时的回显形态不一致，同一配方在下游分出
  //    多条缓存键 / 指纹。曾有一批首选写法自带括号（`Maj7(b5)` / `Maj9(#11)` / `Maj7(#11)` /
  //    `9(#11)` / `13(#11)`），已统一把无括号形态提前、带括号的留在数组末尾（仍可被
  //    `findTokenBySpelling` 命中，只是不再作为回显形态）。
  if (!shorthand && options.spelling !== undefined && options.spelling !== '') {
    const hit = findTokenBySpelling(options.spelling);
    if (hit && astEqualsToken(hit.ast, ast)) {
      if (options.spelling.includes('add')) return renderComposed(hit, ast, options.spelling);
      if (!options.spelling.includes('(')) return options.spelling;
    }
  }

  // 2. 同义写法区分：`add2` 与 `add9` 的 AST 完全相同，只有 token id 能区分
  if (options.tokenId) {
    const byId = QUALITY_TOKENS.find(t => t.id === options.tokenId);
    if (byId && astEqualsToken(byId.ast, ast)) {
      if (COMPOSED_QUALITY_IDS.has(byId.id)) return renderComposed(byId, ast);
      if (shorthand) return byId.shorthand ?? byId.spellings[0]!;
      return byId.spellings[0]!;
    }
  }

  // 3. 按 AST 反查 token（无来源信息时的兜底，如从音集识别出来的和弦）
  const hit = findTokenByAst(ast);
  if (hit) {
    if (COMPOSED_QUALITY_IDS.has(hit.id)) return renderComposed(hit, ast);
    if (shorthand) return hit.shorthand ?? hit.spellings[0]!;
    return hit.spellings[0]!;
  }

  // 4. 组合式兜底：任意 AST 组合都有输出，这是旧枚举做不到的
  //    （枚举里没有 `sus4add9`，只能逐字列一行；这里由骨架 + 扩展音自动拼出）
  //
  //    走规则层（`renderQualityFromRules`），不在这里另写一套拼接 ——
  //    「增五写 `+` 还是 `#5`」「七音位排在五音前还是后」这类选择因此与表内同源。
  //    这正是 `GaugMaj7add9` 曾渲染成 `GM7#59`（兜底自己写 `#5` + 七音位前置）而表内
  //    `augMaj7` 写 `+M7` 的成因；改走规则层后两者收敛到同一形态。
  return renderQualityFromRules(ast, shorthand);
};
