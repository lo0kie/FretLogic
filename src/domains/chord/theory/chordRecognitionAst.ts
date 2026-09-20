/**
 * 和弦识别引擎（AST 版）——「音集 → 和弦名」的候选生成与排序。
 *
 * ===== 与旧 chordEngine 的分工 =====
 * `chordEngine.ts` 走的是「47 条手写语法模板 × 位掩码匹配」，模板表的 `suffix` 是裸字符串，
 * 与 `CHORD_QUALITIES` 枚举是两套东西。实测覆盖率只有语料的 42/74 ——
 * 缺的正是同义拼写整族（`M7`/`Δ7`/`ø7`/`no3`/`alt`…），因为一份手写表不可能把
 * 每个配方的每种写法都列全。
 *
 * 本模块改用「**由一个 AST 配方生成候选签名**」：
 * 1. `QUALITY_TOKENS` 是配方真相源，每个 token 一个 AST
 * 2. 由 AST 展开出**音集签名**（半音集合），作为匹配键
 * 3. 权重不由模板手写，而由 `RECOGNITION_RULES` 按**结构特征**计算
 *    （有无三音 / 七音 / 张力音、是否 alt、是否 sus…）
 *
 * 好处是新增一个配方时，识别、渲染、解析三处**同时**生效，不会再出现
 * 「能输入但识别不出」「能识别但显示成另一种写法」这类单向不对称。
 *
 * ===== 与旧引擎的关系 =====
 * `chordEngine.ts` 的候选来源已切换到本模块：它保留相对签名缓存、低音偏好、
 * 纯度门槛与分档阈值，把「哪些配方候选」交给 `recognizeByIntervals`。
 * 因此两套候选定义不再并存 —— 本轮之前这里标注的「并行实现、暂未接线」已作废。
 */

import {
  chordQualityAstToIntervals,
  degreeToSemitone,
  isDimFlavored,
  QUALITY_TOKENS,
  qualityKindOfAst,
} from './chordQualityAst';

import type { ChordSlot, RoleAssignment, RoleConfidence } from './chordEngine';
import type { ChordQualityAst } from './chordQualityAst';

// ============================================================
// 一、候选签名
// ============================================================

/**
 * 一个配方的**槽位指纹**。
 *
 * 音集掩码不足以区分省略类写法：`C` 与 `Cno3` 展开后都是 `{0,4,7}`，
 * `C` 与 `Cno5` 同理。纯音集签名下这些配方完全同分，识别端不可能选对。
 *
 * 关键在于：音集是「哪些音在响」，而和弦名说的是「哪些**槽位**被填了」。
 * `Cno3` 的意思是「本该有三音的三和弦，撤掉了三音」，它与 `C5`（**定义上**无三音）
 * 不是一回事，虽然两者音集一样。因此把「配方期望哪些槽位」也做成指纹的一部分。
 */
export interface SlotProfile {
  /** 配方期望存在三音槽（大三/小三/减三） */
  expectsThird: boolean;
  /** 配方期望存在五音槽（纯五/减五/增五） */
  expectsFifth: boolean;
  /** 配方期望存在七音槽 */
  expectsSeventh: boolean;
}

/** 一个可识别的候选：由 token 的 AST 展开出的音集指纹 + 槽位指纹。 */
export interface RecognitionSignature {
  /** 来源 token id */
  tokenId: string;
  /** 该配方的 AST */
  ast: ChordQualityAst;
  /** 核心音半音集合（不含张力音） */
  coreMask: number;
  /** 全部音半音集合（含张力音） */
  allMask: number;
  /** 张力音集合（真正的变化音，不含与核心音同音的还原扩展音） */
  extensionMask: number;
  /** 核心音个数 */
  coreCount: number;
  /** 声明的扩展音总数（含与核心音同音的冗余项） */
  declaredExtensionCount: number;
  /** 冗余扩展音数（`add11` 的十一度、`add13` 的十三度等与核心音同音者） */
  redundantExtensionCount: number;
  /** 槽位指纹 */
  slots: SlotProfile;
}

const toMask = (semitones: readonly number[]): number => semitones.reduce((acc, s) => acc | (1 << (s % 12)), 0);

/** 由 AST 推导槽位指纹。省略标记（`omitThird`/`omitFifth`）**不影响**期望槽位。 */
export const slotProfileOf = (ast: ChordQualityAst): SlotProfile => ({
  expectsThird: ast.third === 'maj3' || ast.third === 'min3',
  expectsFifth: ast.fifth === 'perf5' || ast.fifth === 'dim5' || ast.fifth === 'aug5',
  expectsSeventh: ast.seventh !== undefined && ast.seventh !== 'none',
});

/** 由 AST 生成识别签名。 */
export const buildSignature = (token: { id: string; ast: ChordQualityAst }): RecognitionSignature => {
  const iv = chordQualityAstToIntervals(token.ast);
  const declared = token.ast.extensions ?? [];
  // 冗余 = 声明的扩展音里，其半音值已出现在核心音集合中的那些
  const coreMask = toMask(iv.core);
  let redundant = 0;
  for (const ext of declared) {
    const semitone = degreeToSemitone(ext.degree, ext.accidental);
    if (coreMask & (1 << semitone)) redundant++;
  }
  return {
    tokenId: token.id,
    ast: token.ast,
    coreMask,
    allMask: toMask(iv.all),
    extensionMask: toMask(iv.extensions),
    coreCount: iv.core.length,
    declaredExtensionCount: declared.length,
    redundantExtensionCount: redundant,
    slots: slotProfileOf(token.ast),
  };
};

/**
 * 全部候选签名。
 *
 * 注意这里**不再需要**「同一音集只留一条签名」的去重：`add2` / `add9` 之类的同义配方
 * 共享同一音集，但它们本就是同一个和弦的两种写法，识别时并列出现、由写法偏好选择即可。
 * 反过来，旧枚举方案下这类同义条目是分列的两个字符串，识别端根本无法知道它们等价。
 *
 * 排除 `notationOnly` 的 token（`no3` / `no5`）：那些是**记谱写法**而非独立配方，
 * 音集里少一个音既可能是「撤掉」也可能是「本就没弹」，从音集无法区分 ——
 * 放进候选只会制造无法证伪的歧义。它们仍可正常解析与渲染（往返不受影响）。
 */
export const RECOGNITION_SIGNATURES: RecognitionSignature[] = QUALITY_TOKENS.filter(t => t.notationOnly !== true).map(
  buildSignature
);

// ============================================================
// 二、权重规则层
// ============================================================

/**
 * 识别权重规则。
 *
 * 旧实现在 `GRAMMAR_TEMPLATES` 里给 47 条模板逐条手写 `baseWeight`（100~195），
 * 且文件头要用大段注释维护两条不变量（三音可省的成对性、成对模板权重必须相等）——
 * 这两条不变量的存在本身就说明权重与结构脱节了：它们是**结构属性**，不该逐条手抄。
 *
 * 这里的关键修正是把「**专指度**」放在首位：一个 E G 音集永远该读成 `C`，
 * 而不是 `C6/9` 或 `Cadd13` —— 后者虽然没有「额外的音」，但它们的配方里
 * 那些 6/9/13 度音**在本音集里并没有真正出现**，只是同音巧合。
 * 因此除「有多少音被解释」之外，还必须比较「配方声明了几个音」：
 * 声明得多而音集小 ⇒ 大量音是凭空补出来的 ⇒ 应当降权。
 *
 * 这条判据在旧实现里不存在（旧实现靠手写冲突掩码与逐条 baseWeight 硬压），
 * 也正是「C 被识别成 C6/9」这类错误的根源。
 */
export interface RecognitionWeight {
  /** 基准分：三和弦档 */
  base: number;
  /** 有七音 */
  seventh: number;
  /** 每个**实际新增**的张力音 */
  perExtension: number;
  /** 每个「配方声明但音集里没有」的音（凭空补音，是专指度不足的信号） */
  perUnusedDeclared: number;
  /**
   * 每个**声明了却与核心音同音**的音（`add11` 的十一度 = 四音、`add13` 的十三度 = 六音）。
   *
   * 这类音有两种读法：`C E G` 既可以是 `C`，也可以是「大三和弦 + 恰好同音的四音」。
   * 乐理上后者没有意义——四音就是三音的上方邻音，写成 `Cadd11` 会让人以为要按 F。
   * 因此凡是与核心音撞车的还原扩展音，都应被视为「配方在虚报音数」并降权，
   * 使 `C` 稳定压过 `Cadd11`。
   */
  perRedundantExtension: number;
  /** 是挂留和弦（三音被四音替代） */
  sus: number;
  /** 是减/半减（同音集容易被读成别的和弦，降权） */
  dim: number;
  /** 是变化和弦（alt / #5 / b5 等） */
  altered: number;
  /** 无三音（5 和弦、no3） */
  noThird: number;
}

export const RECOGNITION_WEIGHT: RecognitionWeight = {
  base: 100,
  seventh: 60,
  perExtension: 25,
  /**
   * 专指度惩罚必须**大于** `perExtension` 的给分。
   *
   * 否则会出现「配方声明了 N 个扩展音、只出现 N-1 个」却依旧拿高分的情形：
   * `C E G Bb` 上 `dom11`（声明 9 与 11 两个扩展音，其中 9 度缺席）会以 165 分
   * 压过 `dom7`（160 分）——这正是实测踩到的倒挂。
   * 取 60 > 25*2 的量级，保证「声明了却没出现」的音一律成为净负担。
   */
  perUnusedDeclared: -60,
  perRedundantExtension: -35,
  sus: -5,
  dim: -30,
  altered: -10,
  noThird: -25,
};

/** 由 AST 计算识别权重——不再逐条手抄。 */
export const weightOf = (ast: ChordQualityAst, w: RecognitionWeight = RECOGNITION_WEIGHT): number => {
  let score = w.base;
  if (ast.seventh === 'min7' || ast.seventh === 'maj7' || ast.seventh === 'dim7') score += w.seventh;
  score += (ast.extensions?.length ?? 0) * w.perExtension;
  if (ast.sus === 'sus4' || ast.sus === 'sus2') score += w.sus;
  if (isDimFlavored(ast)) score += w.dim;
  /**
   * 变化音降权只对**有实际变化内容**的配方生效。
   *
   * 裸 `alt`（`ast.alt` 为真但扩展音为空）是个「什么都不说的配方」：
   * 它展开后往往就是 `{0,4,7,10}`，与 `C7` 音集完全相同，却因为带 `alt` 标记
   * 被降了 10 分，于是同分时反而输给 `C7`——这是正确的排序结果，但成因是巧合。
   * 更稳的判据是：`alt` 只有在**伴随实际变化音**（b9/#9/b5/#11/b13 之类）时
   * 才被当作真变化和弦；否则它与 `7` 是同一件事，不该有独立权重。
   */
  const hasAlteredContent = (ast.extensions?.length ?? 0) > 0 || ast.fifth === 'aug5' || ast.fifth === 'dim5';
  if ((ast.alt && hasAlteredContent) || ast.fifth === 'aug5' || ast.fifth === 'dim5') score += w.altered;
  /**
   * 省略三音（`no3`）不该与「定义上无三音」（`5` 和弦）同罚。
   *
   * `C5` 是强力和弦，三音本就不存在，`noThird` 惩罚反映的是「音集小、易误配」；
   * 而 `Cno3` 是**有完整三音槽却主动撤掉**，它与 `C` 的差别恰恰是这点信息，
   * 若把它罚得比 `C` 低，识别端就永远选不回 `no3`（实测：`{0,4,7}` 上
   * `major` 100 > `no5` 100 > `add11` 65 > `no3` 65，`no3` 被挤出前 3）。
   */
  if (!ast.omitThird && (ast.third === 'none' || ast.third === undefined)) score += w.noThird;
  return score;
};

// ============================================================
// 三、匹配
// ============================================================

/** 一个识别结果。 */
export interface RecognitionHit {
  tokenId: string;
  ast: ChordQualityAst;
  /** 权重分 */
  score: number;
  /** 未解释音（在音集里但配方不含） */
  extraCount: number;
  /** 缺少的必需音（配方含核心音但音集里没有） */
  missingCount: number;
  /** 配方声明但音集里没出现的音数——专指度不足的直接度量 */
  unusedDeclared: number;
  /**
   * 配方声明、但**与自身核心音同音**的扩展音数（静态量，来自签名）。
   *
   * 这类音没有独立的一块音可听（`add11` 的十一度就是三和弦的四音），
   * 属「无害巧合」而非「真缺音」，故调用方对它的扣分应轻于 `unusedDeclared`。
   */
  redundantExtensions: number;
  /**
   * 槽位失配数。
   *
   * `Cno3` 声明「本该有三音」，而三和弦 `C` 三音齐全、`C5` 定义上无三音——
   * 三者音集相同，只有槽位能把它们分开。失配数越少越贴合输入的实际构成，
   * 因此既不等于 0 的候选排在后面（见 `recognizeByIntervals` 的排序）。
   */
  slotMismatch: number;
  /**
   * **虚报音数**：`unusedDeclared + redundantExtensionCount`。
   *
   * 配方声明了却在输入里找不到独立一块音的音数（不论是「整个缺席」还是
   * 「与核心音同音」）。它是排序的第三判据——越小越贴合输入的实际构成，
   * 且不依赖任何手调权重。详见 `recognizeByIntervals` 内的注释。
   */
  inflation: number;
  /** 纯度：解释音 / 音集音数 */
  purity: number;
  /** 调内归类 */
  qualityKind: 'maj' | 'min' | 'dim';
}

/**
 * 输入音集的槽位快照——回答「输入里三音/五音/七音**在不在**」。
 *
 * 与配方侧的 `SlotProfile` 配合使用：两边同为 `true` 或同为 `false` 才算贴合。
 * 之所以不用半音值直接判断，是因为三音槽本身有 maj3/min3 两种填法，
 * 用「该槽位有无音在其中」表示即可覆盖。
 */
export interface InputSlots {
  hasThird: boolean;
  hasFifth: boolean;
  hasSeventh: boolean;
}

/**
 * 从音集（相对根音半音）推导输入的槽位快照。
 *
 * `dim7` 参数必须由**配方**提供：9 半音在模 12 下同时是「六度」与「减七度」，
 * 单看音集无法判断它属于哪个槽位。
 *
 * 早先没有这个参数的版本把 9 一律当作七音，于是 `C6`（六度）在 `six` 配方下
 * 被判成「输入有七音、配方却没有」→ 凭空一次槽位失配扣分。
 * 实测后果：`{Eb, G, C}` 上 `six` 的分数被压到负数，正解被一个虚构的失配挤掉。
 */
export const inputSlotsOf = (semitones: readonly number[], options: { dim7?: boolean } = {}): InputSlots => {
  const mask = toMask(semitones);
  const has = (s: number) => (mask & (1 << (s % 12))) !== 0;
  return {
    hasThird: has(3) || has(4),
    hasFifth: has(6) || has(7) || has(8),
    hasSeventh: has(10) || has(11) || (options.dim7 === true && has(9)),
  };
};

/**
 * 用给定音集（相对根音的半音集合）匹配候选配方。
 *
 * 匹配判据（与旧引擎的 `reqMask` / `conflictMask` 等价，但由 AST 自动推导）：
 * - 核心音必须**全部在场**（缺失记 `missingCount`，默认不容忍）
 * - 音集里允许出现的额外音不超过 `maxExtra`
 * - **配方声明但音集里没有的音**计入 `unusedDeclared` 并参与降权
 * - **槽位必须贴合**（见下）
 *
 * `unusedDeclared` 是本实现相对旧引擎的关键补充之一。举一个实测踩到的例子：
 * 音集 `C E G`（0,4,7）在三和弦之外，也「恰好」满足 `C6/9` 的配方展开
 * （其 6 度=9 半音、9 度=2 半音都不在音集里，但核心音全在），
 * 若只判「核心音是否全在场」，`C6/9` 会与 `C` 同分甚至更高。
 *
 * **槽位判据**处理的是同音集的**同义写法**。`omitThird` / `omitFifth` 已在
 * `chordQualityAstToIntervals` 里生效，于是：
 * - `Cno3` 展开为 `{0,7}`，与 `C5` **完全相同**——但 `no3` 是「声明了三音槽却撤掉」，
 *   `5` 是「定义上没有三音槽」。输入 `{0,7}` 分辨不了这两者，只能靠槽位：
 *   `power` 的 `expectsThird` 为 false、与输入吻合；`no3` 为 true、产生 1 次失配。
 *   因此**根音 + 五音的音集一律读作 `C5`**——这是有意的：只有根音与五音的音集
 *   在乐器上就是强力和弦，`no3` 只是它的另一种说法。
 * - `Cno5` 展开为 `{0,4}`，该音集没有别的配方占用，可被唯一识别。
 *
 * 所以槽位判据的作用不是「让 no3 胜出」，而是让同音集的候选有**稳定的取舍依据**，
 * 不再依赖字母序这种与音乐无关的 tie-break。
 *
 * 返回按分数降序排列的全部命中，而非单一最优——调用方可以据此给出
 * 「最佳 / 备选 / 理论」三档，与旧 `AnalyzeResult` 的结构对齐。
 */
export const recognizeByIntervals = (
  semitones: readonly number[],
  options: { allowMissing?: number; maxExtra?: number } = {}
): RecognitionHit[] => {
  const allowMissing = options.allowMissing ?? 0;
  const maxExtra = options.maxExtra ?? 2;

  const inputMask = toMask(semitones);
  const inputCount = new Set(semitones.map(s => s % 12)).size;
  const hits: RecognitionHit[] = [];

  for (const sig of RECOGNITION_SIGNATURES) {
    // 槽位快照依赖配方：9 半音是「六度」还是「减七度」只有配方知道
    const inputSlots = inputSlotsOf(semitones, { dim7: sig.ast.seventh === 'dim7' });
    const missing = popcount(sig.coreMask & ~inputMask);
    if (missing > allowMissing) continue;

    const extras = popcount(inputMask & ~sig.allMask);
    if (extras > maxExtra) continue;

    // 专指度惩罚只算**扩展音**未出现的那部分：核心音缺席已由 missing 罚过，
    // 重复计入会把 `Cm7`（五音常省略）这类正常省略也一并打压。
    // 判据的意图很明确：`add9` 声明了一个九音，若音集里没有九音，它就不该被选中。
    const declaredExtMask = sig.extensionMask;
    const unusedExtensions = popcount(declaredExtMask & ~inputMask);
    const unusedDeclared = unusedExtensions;
    const explained = popcount(inputMask & sig.allMask);

    const slotMismatch =
      (sig.slots.expectsThird !== inputSlots.hasThird ? 1 : 0) +
      (sig.slots.expectsFifth !== inputSlots.hasFifth ? 1 : 0) +
      (sig.slots.expectsSeventh !== inputSlots.hasSeventh ? 1 : 0);

    /**
     * **鉴别力**：`unusedDeclared` 加上「冗余扩展音」构成「虚报音数」的总量。
     *
     * 这类音的共同特征是：配方写了它，但输入里**没有对应的一块音**——
     * 要么它整个不在音集里（`unusedDeclared`），要么它与某个核心音恰好同音
     * （`redundantExtensionCount`，`add11` 的十一度 = 四音即属此类）。
     * 两者都意味着该配方对输入的解释力**没有超出**那个更朴素的读法。
     *
     * 排序时用它做主判据，是因为分数里已经含了它的降权项，但降权幅度是拍出来的；
     * 而「谁虚报得少」是个**不依赖任何权重取值**的结构判据。实测效果：
     * `add13`（虚报 1）不再压过 `six`（虚报 0），`no3`（虚报 0）不再被
     * `add11`（虚报 1）挤到后面。凡是两者都 0 的候选，才继续比分数。
     */
    const inflation = unusedDeclared + sig.redundantExtensionCount;

    hits.push({
      tokenId: sig.tokenId,
      ast: sig.ast,
      score:
        weightOf(sig.ast) +
        unusedDeclared * RECOGNITION_WEIGHT.perUnusedDeclared +
        sig.redundantExtensionCount * RECOGNITION_WEIGHT.perRedundantExtension -
        extras * 15 -
        missing * 40 -
        slotMismatch * 45,
      extraCount: extras,
      missingCount: missing,
      unusedDeclared,
      redundantExtensions: sig.redundantExtensionCount,
      slotMismatch,
      inflation,
      purity: inputCount === 0 ? 0 : explained / inputCount,
      qualityKind: qualityKindOfAst(sig.ast),
    });
  }

  return hits.sort(
    (a, b) =>
      b.purity - a.purity ||
      a.slotMismatch - b.slotMismatch ||
      a.inflation - b.inflation ||
      b.score - a.score ||
      a.tokenId.localeCompare(b.tokenId)
  );
};

/**
 * 从识别结果里挑「首选写法」——只在**并列最优**的一组内用 token 表声明顺序决定。
 *
 * `recognizeByIntervals` 的最终 tie-break 是 `tokenId.localeCompare`，那是为了让
 * 排序**稳定可复现**，但字母序没有任何音乐含义：`C E G A`（即 `C6`）上
 * `add13` 会因 `add13` < `six` 而排在 `six` 前面，于是 `C6` 被显示成 `Cadd13`——
 * 两者 AST 完全相同（见 `six` / `add13` 两条 token），只是名称层同义而已。
 *
 * `QUALITY_TOKENS` 的顺序本身就是**人工排定的优先级**（文件头注释写明
 * 「顺序即优先级」），常用写法在前（`six` 在 `add13` 之前）。本函数把那份优先级
 * 带回识别结果的排序里：数组顺序保稳定，本函数保语义。
 *
 * **只在并列组内生效**：判据取「与首项的分值全等」，即 `purity`、`slotMismatch`、
 * `inflation`、`score` 四项都相同。若不分组而直接扫全表，索引最小的 token
 * （`major`）会凭位置胜出，把 `C6` 显示成 `C` —— 那是比字母序更严重的错误。
 */
export const preferredHit = (hits: readonly RecognitionHit[]): RecognitionHit | undefined => {
  if (hits.length === 0) return undefined;
  const head = hits[0]!;
  const tied = (h: RecognitionHit): boolean =>
    h.purity === head.purity &&
    h.slotMismatch === head.slotMismatch &&
    h.inflation === head.inflation &&
    h.score === head.score;

  const rank = new Map<string, number>();
  QUALITY_TOKENS.forEach((t, i) => rank.set(t.id, i));

  let best = head;
  let bestRank = rank.get(best.tokenId) ?? Number.MAX_SAFE_INTEGER;
  for (const hit of hits) {
    if (!tied(hit)) break; // 结果按优先级降序，遇到不同分组即停止
    const r = rank.get(hit.tokenId) ?? Number.MAX_SAFE_INTEGER;
    if (r < bestRank) {
      best = hit;
      bestRank = r;
    }
  }
  return best;
};

/** 位计数（掩码最多 12 位，逐位循环足够快且无需查表）。 */
const popcount = (mask: number): number => {
  let n = 0;
  let m = mask;
  while (m) {
    m &= m - 1;
    n++;
  }
  return n;
};

// ============================================================
// 四、覆盖度自检
// ============================================================

/**
 * 识别覆盖度报告：对每个 token 的配方展开音集，看它能否被自己识别回来。
 *
 * 这是把「识别覆盖率」从口头承诺变成可跑的数字——旧实现没有这个能力，
 * 于是「语法表只覆盖 42/74」这件事直到手写语料库跑基线时才被发现。
 */
export const selfCheckCoverage = (): { total: number; recovered: number; failures: string[] } => {
  const failures: string[] = [];
  let recovered = 0;
  for (const sig of RECOGNITION_SIGNATURES) {
    const semitones: number[] = [];
    for (let i = 0; i < 12; i++) if (sig.allMask & (1 << i)) semitones.push(i);
    const hits = recognizeByIntervals(semitones);
    if (hits.some(h => h.tokenId === sig.tokenId)) recovered++;
    else failures.push(sig.tokenId);
  }
  return { total: RECOGNITION_SIGNATURES.length, recovered, failures };
};

// ============================================================
// 五、对齐旧引擎的数据形状（供替换时直接换用）
// ============================================================

/**
 * 由 AST 判定候选分类，替代旧模板里逐条手写的 `category` 字段。
 *
 * 判定规则是从旧 `GRAMMAR_TEMPLATES` 的既有分类**反推**出来的，逐条对齐：
 * - `dim` / `aug` 是 **triad**（有 b5/#5 但没有七音，属三和弦的变化形态）
 * - `m7b5` / `dim7` 是 **seventh**，不是 altered —— 它们的减五音是**和弦自身音阶的一部分**
 *   （小调三度堆叠），不是对骨架的色彩化改造
 * - 而 `7(b5)` / `7(#5)` / `Maj7(b5)` 是 **altered** —— 大调三音上挂减五/增五，
 *   那才是「把骨架音改掉」的语义
 *
 * 所以「五音变化是否算 altered」要连**三音**一起看：大三音 + 七音 + 变化五音 = altered；
 * 小三音则该五音是音阶内的自然音，不算变化。只看五音会把 `m7b5` 错判成 altered。
 *
 * 另有一处易错：`6` / `add9` / `6/9` 在旧表里是 **triad** 而非 extended，
 * 区别在与**有无七音**——有七音且带扩展音才是 extended（`9` / `11` / `13`）。
 */
export const categoryOfAst = (ast: ChordQualityAst): CategoryOfAst => {
  if (ast.sus === 'sus4' || ast.sus === 'sus2') return 'sus';

  const exts = ast.extensions ?? [];
  const hasThird = ast.third === 'maj3' || ast.third === 'min3';
  const hasSeventh = ast.seventh !== undefined && ast.seventh !== 'none';
  if (!hasThird && !hasSeventh && exts.length === 0) return 'power';

  const altered =
    ast.alt === true ||
    exts.some(e => e.accidental !== 0) ||
    (ast.third === 'maj3' && hasSeventh && (ast.fifth === 'dim5' || ast.fifth === 'aug5'));
  if (altered) return 'altered';

  if (hasSeventh) return exts.length > 0 ? 'extended' : 'seventh';
  return 'triad';
};

export type CategoryOfAst = 'triad' | 'seventh' | 'extended' | 'altered' | 'sus' | 'power';

/** 扩展音（度数 + 升降）→ 声部角色。未列出的组合归 `extra`。 */
const EXTENSION_ROLE: Record<string, ChordSlot> = {
  '0:6': 'sixth',
  '0:9': 'ninth',
  '1:9': 'ninth_sharp',
  '-1:9': 'ninth_flat',
  '0:11': 'eleventh',
  '1:11': 'eleventh_sharp',
  '0:13': 'thirteenth',
  '-1:13': 'thirteenth_flat',
};

/**
 * 由 AST 推导每个音的角色分配（`root` / `third_major` / `fifth_perfect` / `ninth` …）。
 *
 * 旧实现只能读模板里的 `required` / `optional` 槽位定义——那是**手写**的，
 * 于是「模板没写全的配方」根本没有角色信息。AST 天然带结构，角色可由字段直接推出来，
 * 新增配方时角色自动就位。
 *
 * @param options.inputMask 输入音集的位掩码；多出来的音（配方解释不了的）标记为 `extra`。
 * @param options.bassInterval 斜杠低音的相对音程；未在配方中占用时标记为 `slash_bass`。
 * @param options.skipAbsentExtensions 跳过**输入里没有**的扩展音角色。
 *   识别引擎需要置 true：配方声明的扩展音未必真被按响（`C6/9` 的配方在 `C E G` 上
 *   核心音齐全、只是 6/9 没出现），若照配方全量派角色，就会出现
 *   「角色表里有九音、音集里没有」，下游按角色取音算指法时会去找一个不存在的音。
 *   三音/五音/七音等**骨架音**不受此开关影响（识别已保证它们在场）。
 */
export const rolesOfAst = (
  ast: ChordQualityAst,
  rootPitch: number,
  labelByPitch: readonly (string | undefined)[],
  options: { inputMask?: number; bassInterval?: number; skipAbsentExtensions?: boolean } = {}
): RoleAssignment[] => {
  const { inputMask, bassInterval, skipAbsentExtensions = false } = options;
  const roles: RoleAssignment[] = [];
  const used = new Set<number>();

  const push = (interval: number, role: ChordSlot, confidence: RoleConfidence): void => {
    const i = ((interval % 12) + 12) % 12;
    if (used.has(i)) return;
    used.add(i);
    const pitchIndex = (((rootPitch + i) % 12) + 12) % 12;
    roles.push({ noteLabel: labelByPitch[pitchIndex] ?? '', pitchIndex, interval: i, role, confidence });
  };

  push(0, 'root', 'anchor');
  // 省略标记必须与 `chordQualityAstToIntervals` 的口径一致：AST 说撤掉哪个音，
  // 角色表里也不能给它派角色 —— 否则会「音集里没有、角色表里却有」，
  // 下游按角色取音去算指法时就会去找一个不存在的音。
  if (!ast.omitThird) {
    if (ast.third === 'maj3') push(4, 'third_major', 'core');
    else if (ast.third === 'min3') push(3, 'third_minor', 'core');
  }
  if (ast.sus === 'sus4') push(5, 'sus4', 'core');
  else if (ast.sus === 'sus2') push(2, 'sus2', 'core');
  if (!ast.omitFifth) {
    if (ast.fifth === 'perf5') push(7, 'fifth_perfect', 'core');
    else if (ast.fifth === 'dim5') push(6, 'fifth_dim', 'core');
    else if (ast.fifth === 'aug5') push(8, 'fifth_aug', 'core');
  }
  if (ast.seventh === 'min7') push(10, 'seventh_minor', 'core');
  else if (ast.seventh === 'maj7') push(11, 'seventh_major', 'core');
  else if (ast.seventh === 'dim7') push(9, 'seventh_dim', 'core');

  for (const ext of ast.extensions ?? []) {
    const semitone = degreeToSemitone(ext.degree, ext.accidental);
    const present = inputMask === undefined || (inputMask & (1 << semitone)) !== 0;
    if (skipAbsentExtensions && !present) continue;
    const role = EXTENSION_ROLE[`${ext.accidental}:${ext.degree}`] ?? 'extra';
    // 还原扩展音（`add9` 的九音）是配方的组成部分，属 `anchor`；
    // 变化扩展音（`#9` / `b13`）是色彩音，属 `core`。
    push(semitone, role, ext.accidental === 0 ? 'anchor' : 'core');
  }

  if (bassInterval !== undefined) push(bassInterval, 'slash_bass', 'optional');

  if (inputMask !== undefined) {
    for (let i = 0; i < 12; i++) {
      if (inputMask & (1 << i) && !used.has(i)) push(i, 'extra', 'extra');
    }
  }
  return roles;
};
