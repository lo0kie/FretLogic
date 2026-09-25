/**
 * 和弦语料库（CHORD_CORPUS）。
 *
 * 为什么要有这个文件：核心链路（解析 → 音集 → 识别）此前只靠「注释里写着的实测数字」
 * 证明自己（`实测覆盖率 42/74`、`实测踩到的 case`…），改动权重规则时没有任何基线能阻止
 * 已经填过的坑重新裂开。本文件把历次回归现场固化成可回归的断言。
 *
 * **每条语料跑三条断言**，缺一条就等于只验证了「能不能解析」这一件事：
 *
 * 1. **解析结果**：`isValidChordName` 判合法（判据是「能解析 + 字段组合自洽」，不是写法白名单），
 *    且展开出的音集与期望一致——识别端的一切权重都建立在这个集合上，集合错了后面全错。
 * 2. **渲染回显**：`getChordName` 输出的**规范写法**，且「解析 → 渲染 → 再解析」后 AST 不变（幂等）。
 *    回显的既定原则是**来源写法优先**（`renderQualityAst` 第 1 步）：用户写 `C+5` 就还他 `C+5`，
 *    不擅自改成 `Caug`。因此本条断言锁的是「不许乱改用户写法」——只有两类写法会收敛：
 *    - 带括号的同义写法（`Cm7(b5)` → `Cm7b5`、`C7(#9)` → `C7#9`）：括号只是书写变体，
 *      不收敛会让同一个和弦在缓存里各占一条键；
 *    - 半减七整体（`Cø7` / `Cø` / `Cmin7b5` / `C-7b5` → 一律 `Cm7b5`）：它是**一个整质量**，
 *      不能被剥成 `m7` + b5 张力，故由解析层整体归一。
 *    幂等那条不需要手写期望值，却能抓住渲染层把 `Cadd2` 写成 `Cadd9` 这类回归。
 * 3. **识别候选**：把音集喂回识别器——
 *    3a 本写法必须**回到候选里**（`notationOnly` 的纯记谱写法除外，它们本就不参与识别）；
 *    3b 标了 `preferred` 的用例还要锁**首选读法**（同音集时谁胜出，是权重规则的直接产物）。
 *
 * 新增用例的约定：`why` 必须写明这条锁的是什么坑。没有出处的新用例
 * 等于给未来留下一个无法判断对错的失败。
 */
import { describe, expect, it } from 'vitest';

import { astToKey, chordQualityAstToIntervals, QUALITY_TOKENS } from '@/domains/chord/theory/chordQualityAst';
import { parseQualityText } from '@/domains/chord/theory/chordQualityAstParse';
import { findAstContradictions, isSelfConsistentQualityAst } from '@/domains/chord/theory/chordQualityAstSemantics';
import { compositeTokens, preferredHit, recognizeByIntervals } from '@/domains/chord/theory/chordRecognitionAst';
import { getChordName, isValidChordName, nameToSegments } from '@/domains/chord/theory/theory';

import type { ChordQualityAst } from '@/domains/chord/theory/chordQualityAst';
import type { RecognitionHit } from '@/domains/chord/theory/chordRecognitionAst';

interface ChordCorpusCase {
  /** 输入写法——谱面 / 用户实际会敲的形态（含简写、括号、符号） */
  name: string;
  /**
   * 同一配方、同一音集、同一渲染结果的**其它写法**（`C(no3)` 之于 `Cno3`、`Cø7` 之于 `Cm7b5`）。
   * 它们与主写法跑完全相同的三条断言：换的是输入拼写，不是规则，故不再各占一行。
   */
  aliases?: readonly string[];
  /** 断言一：期望音集（相对根音的半音，升序） */
  intervals: number[];
  /** 断言二：期望的规范写法。省略 = 与输入同形 */
  canonical?: string;
  /**
   * 断言三 b：把音集喂回识别器后的**首选读法**。
   * - 给数组 = 同音异名的合理并列（`add2` / `add9` 由 token 表顺序裁决），命中任一即通过；
   * - 省略 = 不锁首选，只要求「本写法回到候选里」。
   *
   * 注意：首选读法只由**音集**决定，与输入写法无关——`Cadd2` 与 `Cadd9` 的首选是同一条。
   * 写法差异只在渲染层保留（见断言二）。
   */
  preferred?: string | readonly string[];
  /** 这条用例锁住的是什么（填过的坑） */
  why: string;
}

/** 合法语料：来自真实谱面与历次回归现场 */
export const CHORD_CORPUS: readonly ChordCorpusCase[] = [
  // ---------- 三和弦 ----------
  { name: 'C', intervals: [0, 4, 7], preferred: 'C', why: '裸音名 = 大三和弦（空性质串也是一次识别成功）' },
  {
    name: 'CM',
    intervals: [0, 4, 7],
    preferred: 'C',
    why: '大小写：大写 M 是 major 的简写（对比小写 m）。回显保留来源写法 M，识别端仍读大三和弦',
  },
  { name: 'Cm', intervals: [0, 3, 7], preferred: 'Cm', why: '小写 m = 小三和弦，与 CM 只差一个字母大小写' },
  { name: 'Cdim', intervals: [0, 3, 6], preferred: 'Cdim', why: '减三和弦：小三 + 减五' },
  {
    name: 'Cmb5',
    intervals: [0, 3, 6],
    preferred: 'Cdim',
    why: 'mb5 与 dim 同配方（旧实现拆成「m + 张力 b5」，归并后同音同 AST）：回显保留 mb5，识别首选取 dim',
  },
  { name: 'Caug', intervals: [0, 4, 8], preferred: 'Caug', why: '增三和弦' },
  {
    name: 'C+5',
    intervals: [0, 4, 8],
    preferred: 'Caug',
    why: '+5 与 aug 同配方（旧实现拆成 + 张力 #5）：回显保留 +5，识别首选取 aug',
  },
  { name: 'C5', intervals: [0, 7], preferred: 'C5', why: '强力和弦：结构性无三音（third = none，非 omitThird）' },
  {
    name: 'Cno3',
    intervals: [0, 7],
    // C(no3) 与主写法同配方、同音集、同渲染，差别只在书写形态，故收为别名而非独立一行：
    // 它锁的仍是「括号写法不得在下游各占一条缓存键」这同一条规则
    aliases: ['C(no3)'],
    preferred: 'C5',
    why: 'no3 误判现场：音集与 C5 相同，但 no3 是纯记谱写法、不进识别候选，该音集一律读 C5',
  },
  { name: 'Cno5', intervals: [0, 4], why: 'no5：五音省略、三音保留；该音集没有别的配方占用，故不锁首选' },
  // ---------- 挂留 ----------
  { name: 'Csus4', intervals: [0, 5, 7], preferred: 'Csus4', why: '挂四：四音替代三音，third 必须为空' },
  { name: 'Csus2', intervals: [0, 2, 7], preferred: 'Csus2', why: '挂二' },
  { name: 'C7sus4', intervals: [0, 5, 7, 10], preferred: 'C7sus4', why: '属七挂四' },
  {
    name: 'C9sus4',
    intervals: [0, 2, 5, 7, 10],
    preferred: 'C9sus4',
    why: '九挂四：九音与挂四音是两个不同的音，不冗余（对比 9sus2——九音与挂二同音，故被排除出识别候选）',
  },
  // ---------- 七和弦 ----------
  { name: 'C7', intervals: [0, 4, 7, 10], preferred: 'C7', why: '属七基线' },
  {
    name: 'CM7',
    intervals: [0, 4, 7, 11],
    preferred: 'Cmaj7',
    why: '大小写区分：M7 = 大七，与 Cm7 只差一个字母（旧实现曾把两者读成同一个）。回显保留 M7，识别首选取 maj7',
  },
  { name: 'Cm7', intervals: [0, 3, 7, 10], preferred: 'Cm7', why: '小七（与 CM7 对照）' },
  { name: 'CmMaj7', intervals: [0, 3, 7, 11], preferred: 'CmMaj7', why: '小大七（小三 + 大七）' },
  {
    name: 'Cdim7',
    intervals: [0, 3, 6, 9],
    preferred: 'Cdim7',
    why: '减七回归：三音（小三度）+ 五音（减五）+ 减七三者必须同在，语义层据此判「dim7 缺减五」非法',
  },
  {
    name: 'C°7',
    intervals: [0, 3, 6, 9],
    preferred: 'Cdim7',
    why: '减七的符号写法与 dim7 同配方：回显保留 °7（只有半减七才整体收敛到 m7b5）',
  },
  {
    name: 'CdimMaj7',
    intervals: [0, 3, 6, 11],
    preferred: 'CdimMaj7',
    why: '减大七：减五配大七合法——不能被 dim7 的判据误杀（seventh 是 maj7 不是 dim7）',
  },
  {
    name: 'C7b5',
    intervals: [0, 4, 6, 10],
    preferred: 'C7b5',
    why: '属七降五：大三 + 减五 + 小七，是变化属和弦而非减系（三音是大三度，半减七不成立）',
  },
  {
    name: 'C7#5',
    intervals: [0, 4, 8, 10],
    preferred: 'Caug7',
    why: '属七升五 = aug7：回显保留 7#5，识别首选取 aug7',
  },
  {
    name: 'C7(#9)',
    intervals: [0, 3, 4, 7, 10],
    canonical: 'C7#9',
    preferred: 'C7#9',
    why: '属七升九：同「括号收敛」一类；三音与 #9 只差半音，音集密集，最易被别的读法挤掉',
  },
  { name: 'CaugMaj7', intervals: [0, 4, 8, 11], preferred: 'CaugMaj7', why: '增大七：增五配大七' },
  // ---------- 半减七（历次回归重灾区） ----------
  {
    name: 'Cm7b5',
    intervals: [0, 3, 6, 10],
    canonical: 'Cm7b5',
    // 半减七的其余五种写法（token 数据里同属 halfDim7）：括号 m7(b5)、符号 ø7 / ø（ø 不带 7 旧实现
    // 曾判成未知写法）、min 全拼、减号简写。它们与主写法同配方、同音集、同渲染结果——输入不同但
    // 命中的是同一条「整体归一到标准拼写」规则，故收为别名，行内只留一条基线。
    aliases: ['Cm7(b5)', 'Cø7', 'Cø', 'Cmin7b5', 'C-7b5'],
    preferred: 'Cm7b5',
    why: '半减七基线：整体是一个整质量，不能被剥成 m7 + b5 张力',
  },
  // ---------- 扩展和弦 ----------
  { name: 'C9', intervals: [0, 2, 4, 7, 10], preferred: 'C9', why: '属九' },
  { name: 'C11', intervals: [0, 2, 4, 5, 7, 10], preferred: 'C11', why: '属十一：九音与十一音同时在场' },
  {
    name: 'C13',
    intervals: [0, 2, 4, 5, 7, 9, 10],
    preferred: 'C13',
    why: '属十三：扩展度数是累积的（13 蕴含 9 与 11）',
  },
  { name: 'Cm9', intervals: [0, 2, 3, 7, 10], preferred: 'Cm9', why: '小九' },
  { name: 'Cm11', intervals: [0, 2, 3, 5, 7, 10], preferred: 'Cm11', why: '小十一' },
  // ---------- 六和弦 / add 家族 ----------
  { name: 'C6', intervals: [0, 4, 7, 9], preferred: 'C6', why: '六和弦：六度是扩展音，不并入核心' },
  { name: 'Cm6', intervals: [0, 3, 7, 9], preferred: 'Cm6', why: '小六（同音集的 madd13 让位于 token 表顺序）' },
  { name: 'C6/9', intervals: [0, 2, 4, 7, 9], preferred: 'C6/9', why: '六九和弦；`/9` 不能被斜杠低音解析吃掉' },
  {
    name: 'Cadd9',
    intervals: [0, 2, 4, 7],
    canonical: 'Cadd9',
    // Cadd2 / Cadd4 与本组主写法同音集、同 AST，唯一没被覆盖的信息是「渲染必须还原成用户写的那种
    // 形式」，而这条只有渲染能用（幂等断言抓不到：AST 本就相同）——故从主表移出，单独留一张渲染表
    // （见 RENDER_ECHO_CORPUS，与 add9 / add11 的取舍同口径）
    preferred: ['Cadd9', 'Cadd2'],
    why: 'add9：与 add2 同音同 AST，首选由 token 表顺序裁决，故只锁「必须是这两者之一」',
  },
  {
    name: 'Cadd11',
    intervals: [0, 4, 5, 7],
    canonical: 'Cadd11',
    preferred: ['Cadd11', 'Cadd4'],
    why: 'add11：挂四音与十一度同音，但 add11 声明的是「三音上方的十一音」，三音仍在场',
  },
  {
    name: 'Cadd13',
    intervals: [0, 4, 7, 9],
    canonical: 'Cadd13',
    preferred: 'C6',
    why: '历史坑：add13 与 six 同音集，识别端按惯例读成 C6（曾反过来被读成 Cadd13）',
  },
  { name: 'Cmadd9', intervals: [0, 2, 3, 7], preferred: 'Cmadd9', why: '小调 add9' },
  // ---------- 组合式写法（真实谱面） ----------
  {
    name: 'Esus4add9',
    intervals: [0, 2, 5, 7],
    canonical: 'Esus4add9',
    why: '挂四加九：可组合写法，白名单时代曾被判非法（能输入却存不下）。音集与 Esus2add11 相同，故不锁首选',
  },
  {
    name: 'Gm7add11',
    intervals: [0, 3, 5, 7, 10],
    canonical: 'Gm7add11',
    preferred: 'Gm7add11',
    why: '小七加十一：组合候选回归现场——此前只会退化成虚报九音的 Gm11',
  },
];

/** 非法语料：解析器不认识 / 无根音 / 度数越界 */
const INVALID_CORPUS: readonly { name: string; why: string }[] = [
  { name: '', why: '空串' },
  { name: 'xyz', why: '无根音' },
  { name: 'H', why: 'H 不是本项目音名（德式记谱不予支持）' },
  { name: 'Cxyz', why: '性质无法识别，落 unknownQuality' },
  { name: 'Cadd8', why: '附加音度数越界（8 不在 2/4/5/6/7/9/11/13 集合内）' },
];

/**
 * 取一个和弦名的性质 AST。
 *
 * 用 `parseQualityText` 而非 `chordQualityAstOfName`：后者对**空性质串返回 null**，
 * 而裸三和弦（`C`）恰恰是「性质为空串且识别成功」——走后者会把最基础的用例判成解析失败。
 */
const qualityAstOfName = (name: string): ChordQualityAst | null => {
  const segs = nameToSegments(name);
  if (!segs) return null;
  const parsed = parseQualityText(segs.quality ?? '');
  return parsed.recognized ? parsed.ast : null;
};

/** 取一个和弦名展开后的音集（相对根音的半音，升序） */
const pitchSetOfName = (name: string): number[] | null => {
  const ast = qualityAstOfName(name);
  return ast ? chordQualityAstToIntervals(ast).all : null;
};

/** 取一个和弦名性质 AST 的比较键（用于幂等与「回到候选里」两条断言） */
const astKeyOfName = (name: string): string | null => {
  const ast = qualityAstOfName(name);
  return ast ? astToKey(ast) : null;
};

/** 规范写法：没单列 canonical 的用例即与输入同形 */
const canonicalOf = (c: ChordCorpusCase): string => c.canonical ?? c.name;

/** 剥掉根音，取性质后缀（`Cm7b5` → `m7b5`；`C` → `''`） */
const suffixOfName = (name: string): string => {
  const m = name.match(/^[A-G][#b♯♭]?/i);
  return m ? name.slice(m[0].length) : name;
};

/** 识别命中的规范后缀：token 表取首选拼写，组合候选取生成时的 suffix */
const suffixOfHit = (hit: RecognitionHit): string | undefined =>
  QUALITY_TOKENS.find(t => t.id === hit.tokenId)?.spellings[0] ??
  compositeTokens().find(c => c.id === hit.tokenId)?.suffix;

/** 该写法是否是「纯记谱」写法（no3 / no5 / 9sus2）——它们不参与识别候选 */
const isNotationOnly = (name: string): boolean => {
  const key = astKeyOfName(name);
  if (key === null) return false;
  return QUALITY_TOKENS.some(t => astToKey(t.ast) === key && t.notationOnly === true);
};

/**
 * 把 `aliases` 展开成与主条目**同形**的条目，供四条断言循环共用。
 *
 * 为什么必须有这一步：`aliases` 只是「同一配方、同一音集、同一渲染结果的另一种输入拼写」的收纳字段，
 * 断言本身对主/别名毫无区别（换的只是输入，不是规则）。若循环直接迭代 `CHORD_CORPUS`，别名就只是
 * 一个**没人读的声明**——条目的断言覆盖会凭空消失，而表面上「用例数没变」看不出任何异常。
 * 这张表是语料库的**唯一真源**：断言循环一律从这里出发，绝不直接迭代 `CHORD_CORPUS`。
 *
 * `expectName` = 本行要跑的那条输入拼写；`entry` = 提供音集 / 规范写法 / 首选读法的所属主条目
 * （别名与主条目共用这些期望值，差别只在输入）。
 */
interface CorpusRow {
  /** 本行实际喂给被测函数的输入写法 */
  expectName: string;
  /** 所属主条目（别名与其主条目共享 intervals / canonical / preferred） */
  entry: ChordCorpusCase;
}

const CORPUS_ROWS: readonly CorpusRow[] = CHORD_CORPUS.flatMap(entry => [
  { expectName: entry.name, entry },
  ...(entry.aliases ?? []).map(alias => ({ expectName: alias, entry })),
]);

describe('和弦语料库 · 结构自检：别名必须真的进循环', () => {
  it('每个 aliases 都展开成了一行，且别名不与任何主条目的 name 撞名', () => {
    // 守卫哨兵（勿按「恒真」删除）：这条锁的是上面 CORPUS_ROWS 的**构造契约**——
    // 一旦有人把断言循环改回直接 `it.each(CHORD_CORPUS)`、或让别名悄悄不再被消费，
    // 这条即红。它断言的是「有别名就必须有对应行」，不是「循环跑了多少遍」。
    // 期望的行名序列**从 CHORD_CORPUS 独立算出来**（逐条主条目紧跟它的别名，与 CORPUS_ROWS 的
    // flatMap 次序一致），再与 CORPUS_ROWS 逐项比 —— 漏展开一个别名、或把某条主条目挤掉一行，
    // 都会红。原先那两条是拿 `CORPUS_ROWS.length - CHORD_CORPUS.length` 与别名总数比 ——
    // 而 CORPUS_ROWS 正是那样拼出来的，按构造恒等：把展开逻辑整个删掉也照样绿。
    const expectedRowNames = CHORD_CORPUS.flatMap(c => [c.name, ...(c.aliases ?? [])]);
    expect(CORPUS_ROWS.map(r => r.expectName)).toEqual(expectedRowNames);

    // 别名不得与任何主条目重名：否则同一条拼写会被断言两遍，
    // 且说明某人本该用 aliases 归并却新开了一行
    const mainNames = new Set(CHORD_CORPUS.map(c => c.name));
    const aliasNames = CHORD_CORPUS.flatMap(c => [...(c.aliases ?? [])]);
    expect(new Set(aliasNames).size).toBe(aliasNames.length);
    expect(aliasNames.filter(a => mainNames.has(a))).toEqual([]);
  });
});

// ==================== 断言一：解析结果 ====================

describe('和弦语料库 · 断言一：解析结果（合法 + 音集）', () => {
  it.each(CORPUS_ROWS)('$expectName 合法且展开为 $entry.intervals', ({ expectName, entry }) => {
    expect(isValidChordName(expectName), `${expectName} 应判合法`).toBe(true);
    expect(pitchSetOfName(expectName), `${expectName} 的音集`).toEqual(entry.intervals);
  });
});

// ==================== 断言二：渲染回显 ====================

describe('和弦语料库 · 断言二：渲染回显（规范写法 + 幂等）', () => {
  it.each(CORPUS_ROWS)('$expectName 渲染为规范写法且 AST 不变', ({ expectName, entry }) => {
    const rendered = getChordName({ chordName: expectName });
    // 规范写法：没单列 canonical 的用例即与输入同形（`canonicalOf` 以主条目名为准，
    // 别名一律收敛到主条目的 canonical —— 这正是「别名不得在下游各占一条缓存键」那条规则）
    expect(rendered, `${expectName} 的规范写法`).toBe(canonicalOf(entry));
    // 幂等：解析 → 渲染 → 再解析，AST 不得漂移（不需要手写期望值即可抓同义收敛回归）
    expect(astKeyOfName(rendered), `${expectName} → ${rendered} 后 AST 漂移`).toBe(astKeyOfName(expectName));
  });
});

// ==================== 断言三：识别候选 ====================

describe('和弦语料库 · 断言三 a：音集反推时本写法要回到候选里', () => {
  // notationOnly 的纯记谱写法（no3 / no5）本就不进候选池，跳过
  const recognizable = CORPUS_ROWS.filter(row => !isNotationOnly(canonicalOf(row.entry)));

  it.each(recognizable)('$expectName 的音集能反推回自己', ({ expectName, entry }) => {
    const target = canonicalOf(entry);
    const hits = recognizeByIntervals(entry.intervals);
    const key = astKeyOfName(target);
    const back = hits.some(h => astToKey(h.ast) === key);
    expect(back, `${target}（输入 ${expectName}，音集 ${entry.intervals.join(',')}）未出现在自己的识别候选里`).toBe(
      true
    );
  });
});

describe('和弦语料库 · 断言三 b：同音集时首选读法符合预期', () => {
  const withPreferred = CORPUS_ROWS.filter(
    (row): row is CorpusRow & { entry: ChordCorpusCase & { preferred: string | readonly string[] } } =>
      row.entry.preferred !== undefined
  );

  it.each(withPreferred)('$expectName 的音集首选读作 $entry.preferred', ({ expectName, entry }) => {
    const hit = preferredHit(recognizeByIntervals(entry.intervals));
    const actual = hit ? suffixOfHit(hit) : undefined;
    const accepted = (Array.isArray(entry.preferred) ? entry.preferred : [entry.preferred]).map(suffixOfName);
    expect(accepted, `${expectName} 的首选读法（实际命中 ${hit?.tokenId ?? '无'}）`).toContain(actual ?? '《无命中》');
  });
});

describe('和弦语料库：非法名字一律判非法', () => {
  it.each(INVALID_CORPUS)('$name 非法', ({ name }) => {
    expect(isValidChordName(name)).toBe(false);
  });
});

// ==================== 语义自洽性：解析成功 ≠ 讲得通 ====================
// 这一层用**手工构造的 AST** 而非和弦名：矛盾判据是 AST 层的规则，
// 走和弦名会额外依赖「该组合能不能被解析出来」，把两件事耦在一起，失败时难判是哪层坏了。
// `findAstContradictions` 返回说明数组而非布尔值，正是为了让语料库能断言「命中了哪几条」。

interface SemanticsCase {
  ast: ChordQualityAst;
  /** 期望的矛盾说明数量；0 = 自洽 */
  contradictions: number;
  why: string;
}

const SEMANTICS_CASES: readonly SemanticsCase[] = [
  { ast: {}, contradictions: 0, why: '空 AST（裸三和弦）恒自洽' },
  { ast: { third: 'min3', fifth: 'dim5', seventh: 'min7' }, contradictions: 0, why: '半减七' },
  {
    ast: { third: 'maj3', fifth: 'dim5', seventh: 'min7' },
    contradictions: 0,
    why: '属七降五：减五配小七合法（变化属和弦）',
  },
  { ast: { third: 'min3', fifth: 'dim5', seventh: 'dim7' }, contradictions: 0, why: '减七' },
  { ast: { third: 'min3', fifth: 'dim5', seventh: 'maj7' }, contradictions: 0, why: '减大七：减五配大七合法' },
  {
    ast: { third: 'maj3', fifth: 'perf5', seventh: 'dim7' },
    contradictions: 2,
    why: '减七缺减五：音集只能是 1 b3 b5 bb7（同时命中「缺减五」与「三音非小三」两条）',
  },
  { ast: { third: 'maj3', fifth: 'aug5', seventh: 'dim7' }, contradictions: 2, why: '减七配增五（同上，两条）' },
  {
    ast: { third: 'maj3', fifth: 'dim5', seventh: 'dim7' },
    contradictions: 1,
    why: '减七配大三度：不存在大三度版减七',
  },
  {
    ast: { third: 'min3', fifth: 'dim5', seventh: 'dim7', omitThird: true },
    contradictions: 0,
    why: '省略三音的减七：三音已不在场，不再追究它的性质',
  },
  {
    ast: { third: 'min3', fifth: 'dim5', seventh: 'dim7', omitFifth: true },
    contradictions: 0,
    why: '省略五音的减七：五音已不在场，不再追究减五',
  },
  { ast: { omitThird: true, omitFifth: true }, contradictions: 1, why: '三音与五音同时省略，只剩根音' },
  {
    ast: { third: 'maj3', fifth: 'perf5', omitThird: true },
    contradictions: 0,
    why: '关键反例：no3 的既有配方就是「声明大三度 + 省略」，不是矛盾',
  },
  { ast: { third: 'none', sus: 'sus4', fifth: 'perf5' }, contradictions: 0, why: '挂四：三音为空' },
  {
    ast: { third: 'min3', sus: 'sus4', fifth: 'perf5' },
    contradictions: 1,
    why: '挂留与三音并存：sus 的语义是替代三音',
  },
];

describe('性质 AST 的语义自洽性', () => {
  it.each(SEMANTICS_CASES)('$why', ({ ast, contradictions }) => {
    expect(findAstContradictions(ast)).toHaveLength(contradictions);
    expect(isSelfConsistentQualityAst(ast)).toBe(contradictions === 0);
  });
});
