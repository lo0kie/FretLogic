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

import type { ChordNameAst, ChordQualityAst, ExtensionDegree, ExtensionNode, QualityToken } from './chordQualityAst';
import type { AccidentalType, NaturalPitchLetter, RootSegment } from '@/domains/chord/types';

// ============================================================
// 一、文本归一化与音名解析
// ============================================================

/**
 * 归一键：去首尾空白 + 全角括号 / 全角升降号转半角。
 * 与旧 `toChordNameKey` 的反斜杠低音前缀 → 半角、`♯♭` → `#b` 统一在此收敛，
 * 使 `Cm7（b5）`、`Cm7(b5)` 走完全同一条解析路径。
 */
export const normalizeChordNameText = (text: string): string =>
  text.trim().replace(/（/g, '(').replace(/）/g, ')').replace(/[♯＃]/g, '#').replace(/[♭]/g, 'b');

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
 */
const parseTrailingExtensions = (text: string): { nodes: ExtensionNode[]; consumed: number } => {
  const nodes: ExtensionNode[] = [];
  let i = 0;
  while (i < text.length) {
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
    if (!digitMatch) return { nodes: [], consumed: 0 };

    const degree = canonicalizeDegree(digitMatch[0]);
    if (!degree) return { nodes: [], consumed: 0 };

    i += digitMatch[0].length;
    if (parenOpen) {
      if (text[i] !== ')') return { nodes: [], consumed: 0 };
      i++;
    }
    nodes.push({ degree, accidental });
  }
  return { nodes, consumed: i };
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

/** 空性质兜底 token（大三和弦）。 */
const MAJOR_TOKEN = (): QualityToken => findTokenBySpelling('')!;

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
 */
export const parseQualityAst = (text: string): ChordQualityAst | null => {
  const trimmed = normalizeChordNameText(text);
  if (trimmed === '') return MAJOR_TOKEN().ast;

  // 1. 整体先试最长 token（`m7b5` / `ø7` / `sus4` / `7#5` 这类自带完整配方的优先）
  const wholeHit = matchQualityToken(trimmed);
  if (wholeHit && wholeHit.length === trimmed.length) return wholeHit.token.ast;

  // 2. 组合式：基础 token + 可选 add 家族 + 尾随扩展音
  //    基础 token 缺省为大三和弦；`maj7#11` 会在此切成 `maj7` + `#11`
  const baseHit = wholeHit ?? { token: MAJOR_TOKEN(), length: 0 };
  let ast: ChordQualityAst = { ...baseHit.token.ast };
  let i = baseHit.length;

  // 2b. add 家族：add9 / add2 / add11 / add13（`madd9` 的 m 已由基础 token 提供）
  if (trimmed.slice(i, i + 3).toLowerCase() === 'add') {
    const rest = trimmed.slice(i + 3);
    const ext = parseTrailingExtensions(rest);
    if (ext.nodes.length === 0) return null;
    ast = mergeAst(ast, { extensions: ext.nodes });
    i += 3 + ext.consumed;
  }

  // 2c. 尾随扩展音：7#9 / maj7#11 / 9b13
  if (i < trimmed.length) {
    const trailing = parseTrailingExtensions(trimmed.slice(i));
    if (trailing.nodes.length === 0) return null;
    ast = mergeAst(ast, { extensions: trailing.nodes });
    i += trailing.consumed;
  }

  if (i !== trimmed.length) return null;
  return ast;
};

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
const parseQualityWithToken = (
  text: string
): { ast: ChordQualityAst; tokenId?: string; spelling: string; trailing: ExtensionNode[] } | null => {
  const trimmed = normalizeChordNameText(text);
  if (trimmed === '') return { ast: MAJOR_TOKEN().ast, tokenId: 'major', spelling: '', trailing: [] };

  const wholeHit = matchQualityToken(trimmed);
  if (wholeHit && wholeHit.length === trimmed.length)
    return { ast: wholeHit.token.ast, tokenId: wholeHit.token.id, spelling: wholeHit.spelling, trailing: [] };

  // 基础写作：整词命中但未覆盖全部输入时，它仍是**质量部分的文本**
  // （`7b9b13` 的 `7b9`、`7#9#11` 的 `7#9`），必须保留而不是丢弃。
  const baseHit = wholeHit ?? { token: MAJOR_TOKEN(), spelling: '', length: 0 };
  let ast: ChordQualityAst = { ...baseHit.token.ast };
  let { spelling } = baseHit;
  let i = baseHit.length;
  const trailing: ExtensionNode[] = [];

  // add 家族：写法需整体保留（`add2` 与 `add9` 在 AST 上无法区分）
  if (trimmed.slice(i, i + 3).toLowerCase() === 'add') {
    const rest = trimmed.slice(i + 3);
    const ext = parseTrailingExtensions(rest);
    if (ext.nodes.length === 0) return null;
    ast = mergeAst(ast, { extensions: ext.nodes });
    spelling = `${baseHit.spelling}add${rest.slice(0, ext.consumed)}`;
    i += 3 + ext.consumed;
  }

  // 尾随扩展音：`7#9` 之外的 `7b9b13` / `sus4add9#11` 等组合
  if (i < trimmed.length) {
    const rest = parseTrailingExtensions(trimmed.slice(i));
    if (rest.nodes.length === 0) return null;
    ast = mergeAst(ast, { extensions: rest.nodes });
    // 剥离括号：`C7(#9)` 与 `C7#9` 同构，写法统一收敛到无括号形态。
    // 与旧实现的行为差别：旧实现把整串 suffix 原样留着，于是 `m7(b5)` 与 `m7b5`
    // 在缓存里占两个键、在下游正则里要判两次；这里在解析层就收敛掉。
    trailing.push(...rest.nodes);
    i += rest.consumed;
  }

  if (i !== trimmed.length) return null;
  // 组合写法（基础 + add / 基础 + 尾随张力音）不对应任何单条 token 的写法，
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

const formatAccidentalText = (acc: AccidentalType, useUnicode: boolean): string =>
  acc === 1 ? (useUnicode ? '♯' : '#') : acc === -1 ? (useUnicode ? '♭' : 'b') : '';

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
  if (ast.sus === 'sus4' || ast.sus === 'sus2') {
    const seat = ast.seventh === 'min7' ? '7' : ast.seventh === 'maj7' ? 'M7' : '';
    const extText = sortExtensions(ast.extensions ?? [])
      .map(n => `${formatAccidentalText(n.accidental, false)}${n.degree}`)
      .join('');
    return `${seat}${ast.sus}add${extText}`;
  }

  let text = baseTriadText(ast);
  for (const node of sortExtensions(ast.extensions ?? []))
    text += `${formatAccidentalText(node.accidental, false)}${node.degree}`;

  if (ast.alt) text += 'alt';
  return text;
};
