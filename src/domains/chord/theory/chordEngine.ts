/**
 * 和弦识别引擎：指板音集 → 候选和弦名（含角色分配、纯度、分档、最佳根音）。
 *
 * ===== 候选来源（本次改造的核心）=====
 * 候选配方由 `QUALITY_TOKENS`（63 条 token，每条形如「一个 AST 配方 + 它的全部可接受写法」）
 * **编译**而来，识别交给 `recognizeByIntervals`。
 *
 * 此前候选来自 `GRAMMAR_TEMPLATES` —— 47 条手写模板，每条要把
 * `suffix` / `category` / `baseWeight` / `required` / `optional` / `conflicts` 逐项抄全。
 * 手抄必然漏项：实测模板表只覆盖语料的 42/74，且是**整族缺失**
 * （`maj7`/`M7`/`Δ7`、`min7`/`-7`、`aug7`/`+7`、`ø7`/`ø`、`no3`/`no5`、`add2`、`alt`/`7alt`、`7b13`），
 * 于是这些和弦「能输入、却识别不出」。改为从 token 表派生后，写法变体、音程掩码、
 * 角色分配、分类全部自动就绪，新增性质只需在 token 表加一条。
 *
 * ===== 保留不动的部分 =====
 * 相对签名缓存（跨调/跨把位复用）、评分公式与权重、纯度门槛、分档阈值、
 * 根音拼写偏好、截断限流 —— 全部原样保留，故外部行为（`AnalyzeResult` 形状、
 * 分数口径、分档口径）与旧实现可比。分数仍是 0~1000 量级。
 */

import { createLruCache } from '@/platform/utils/cache';
import { estimateValueBytes } from '@/platform/utils/common';

import { chordQualityAstToIntervals, QUALITY_TOKENS } from './chordQualityAst';
import { categoryOfAst, compositeTokens, recognizeByIntervals, rolesOfAst, weightOf } from './chordRecognitionAst';
import { nameToSegments, parsePitchSegment } from './theory';

import type { ChordQualityAst } from './chordQualityAst';
import type { CategoryOfAst } from './chordRecognitionAst';
import type { ChordNameSegments, NoteInput } from '@/domains/chord/types';

export type ChordSlot =
  | 'root'
  | 'third_major'
  | 'third_minor'
  | 'sus2'
  | 'sus4'
  | 'fifth_perfect'
  | 'fifth_dim'
  | 'fifth_aug'
  | 'seventh_minor'
  | 'seventh_major'
  | 'seventh_dim'
  | 'ninth'
  | 'ninth_flat'
  | 'ninth_sharp'
  | 'eleventh'
  | 'eleventh_sharp'
  | 'thirteenth'
  | 'thirteenth_flat'
  | 'sixth'
  | 'slash_bass'
  | 'extra';

export type RoleConfidence = 'core' | 'anchor' | 'optional' | 'extra';

export interface RoleAssignment {
  noteLabel: string;
  pitchIndex: number;
  interval: number;
  role: ChordSlot;
  confidence: RoleConfidence;
}

export interface ChordCandidate {
  chordName: string;
  rootLabel: string;
  rootPitch: number;
  suffix: string;
  category: 'triad' | 'seventh' | 'extended' | 'altered' | 'sus' | 'power';
  roles: RoleAssignment[];
  purity: number;
  extraCount: number;
  score: number;
  tier: 'best' | 'alternative' | 'theoretical' | 'low_confidence';
  segments?: ChordNameSegments;
}

export interface AnalyzeResult {
  candidates: ChordCandidate[];
  bestRootPitch: number;
  best: ChordCandidate | undefined;
  alternatives: ChordCandidate[];
  theoretical: ChordCandidate[];
  lowConfidence: ChordCandidate[];
}

/**
 * 一个识别配方：token 表的 AST + 为匹配预计算的掩码与评分素材。
 *
 * 取代旧 `COMPILED_TEMPLATES`。关键差别是**来源**：旧表是 47 条手写模板，
 * 每条要把 `required` / `optional` / `conflicts` / `baseWeight` / `suffix` 逐项抄一遍，
 * 于是必然漏项（实测只覆盖语料的 42/74，`M7`/`Δ7`/`ø7`/`no3`/`alt`/`maj7` 整族缺失）；
 * 新表由 `QUALITY_TOKENS`（63 条 token）**编译**而来，写法变体、音程、角色、分类全部自动派生。
 */
interface Recipe {
  tokenId: string;
  ast: ChordQualityAst;
  /** 首选写法，用于拼和弦名（如 `m7b5` / `7b9` / `sus4`） */
  suffix: string;
  category: CategoryOfAst;
  /** 配方声明的全部音程掩码（核心 ∪ 扩展），用于算「解释了多少音」 */
  mask: number;
  /** 核心音掩码，用于判「缺了哪些骨架音」 */
  coreMask: number;
  /** 扩展音个数，用于判「配方是否基本没被实例化」 */
  extensionCount: number;
  /** 核心音程（根音/三音/五音/七音/挂留），用于低音评分判断低音是否在骨架内 */
  coreIntervals: number[];
  /** 扩展音程，用于低音评分的次一级判断 */
  extensionIntervals: number[];
  /**
   * 常用度 0~1，替代旧模板的手写 `baseWeight / 200`。
   * 取 `weightOf(ast) / 200`：该权重函数与旧 `baseWeight` 同量级
   * （`major`=100 与旧表一致、`dom7`=160 亦一致），故评分公式可原样沿用。
   */
  commonness: number;
  /** token 表声明序，作为同分时的稳定裁决（`six` 先于 `add13` 等同音同义写法） */
  order: number;
}

const buildRecipe = (tokenId: string, ast: ChordQualityAst, suffix: string, order: number): Recipe => {
  const iv = chordQualityAstToIntervals(ast);
  let mask = 0;
  for (const s of iv.all) mask |= 1 << (s % 12);
  let coreMask = 0;
  for (const s of iv.core) coreMask |= 1 << (s % 12);
  return {
    tokenId,
    ast,
    suffix,
    category: categoryOfAst(ast),
    mask,
    coreMask,
    extensionCount: iv.extensions.length,
    coreIntervals: iv.core,
    extensionIntervals: iv.extensions,
    commonness: weightOf(ast) / 200,
    order,
  };
};

/**
 * 候选配方池 = token 表原生配方 + 组合候选（见 chordRecognitionAst 的 `compositeTokens`）。
 *
 * 组合候选（`m7add11` / `maj7add9` …）不在 token 表里，但识别器会产出它们——若不在此注册对应
 * Recipe，`collectRecipeHitsForRoot` 的 `RECIPE_BY_TOKEN.get(rec.tokenId)` 会拿不到而把 hit
 * 整条丢弃（这是组合候选此前无法从指法反推的第二处阻塞点，第一处在识别器候选池）。
 * suffix 用识别器给出的规范写法 `<基础>add<度>`，与解析侧 `Gm7add11` 的 quality（整词
 * `'m7add11'`）同形，「输入 ⇄ 识别」才对称；order 排在全部基础配方之后，同分裁决让基础写法优先
 * （与 preferredHit 的 token 序裁决一致）。
 */
const RECIPES: Recipe[] = [
  ...QUALITY_TOKENS.map((t, order) => buildRecipe(t.id, t.ast, t.spellings[0]!, order)),
  ...compositeTokens().map((c, i) => buildRecipe(c.id, c.ast, c.suffix, QUALITY_TOKENS.length + i)),
];

const RECIPE_BY_TOKEN = new Map<string, Recipe>(RECIPES.map(r => [r.tokenId, r]));

/** 候选和弦纯度门槛（60%）：低于此纯度的和弦组合归入 low_confidence 评级，不参与第一梯队竞争 */
const MIN_PURITY = 0.6;
/** 粗筛阶段绝对纯度底线（45%）：低于此阈值的配方组合直接丢弃不纳入候选池，大幅裁剪无效搜索空间 */
const LOW_PURITY_THRESHOLD = 0.45;
/**
 * 梯队分差窗口：纯度达标前提下，与第一名分差在此以内判为可信替代和弦（alternative），超出归理论和弦。
 *
 * 旧实现是 6 分 —— 但那是**旧分数量级**（best ≈ 87）下的 6 分，约 6.9%。
 * 本次结构分改用识别器量级（best ≈ 100~235），故按同一**相对比例**折算：160 × 6.9% ≈ 11。
 */
const BEST_GAP = 11;
/** 识别结果候选上限（10个）：按最终得分去重后保留的最大候选条数，保证转位多样性的同时防止冗余扩散 */
const TOP_EVALUATE_LIMIT = 10;

const STANDARD_ROOT_NAMES: readonly string[] = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** 五音类音程（减五 / 纯五 / 增五）：骨架音里唯一允许缺席的一类，见 `collectRecipeHitsForRoot` */
const FIFTH_INTERVALS_MASK = (1 << 6) | (1 << 7) | (1 << 8);

/**
 * 音程「槽位」分组：同一组内的音程互斥（一个槽位只能填一个音）。
 *
 * 用于判「配方与输入矛盾」——见 `hasSlotContradiction`。
 * - 三音槽：小三 / 大三
 * - 五音槽：减五 / 纯五 / 增五
 * - 七音槽：减七 / 小七 / 大七
 *
 * **刻意不设挂留槽**（`sus2` 的 2 与 `sus4` 的 5）：虽然 sus2 与 sus4 互斥，
 * 但 2 半音同时也是**九音**的模 12 值（`add9` / `9`），把它俩放进同一组会让
 * `Csus4add9`（{0,2,5,7}，含 F 与 D）被判成「槽位矛盾」而整个丢候选 —— 实测踩到。
 * sus2 / sus4 的互斥由 `missingCore`（只允许五音缺席）自然覆盖：
 * sus4 配方遇到 sus2 输入时缺的是「四音」，不属五音类，直接判缺音淘汰。
 */
const SLOT_GROUPS: readonly number[] = [
  (1 << 3) | (1 << 4),
  (1 << 6) | (1 << 7) | (1 << 8),
  (1 << 9) | (1 << 10) | (1 << 11),
];

/**
 * 配方与输入是否存在槽位矛盾：某个槽位配方填了 A、输入却填了 B（A≠B）。
 *
 * 输入该槽位**为空**不算矛盾（那是「省略」，由 `missingCore` 单独把关）；
 * 只有「填成了另一个音」才算 —— 这正是旧手写 `conflicts` 想表达的规则。
 */
function hasSlotContradiction(recipeMask: number, inputMask: number): boolean {
  for (const group of SLOT_GROUPS) {
    const recipeSlot = recipeMask & group;
    const inputSlot = inputMask & group;
    // 仅当「配方在该槽位填了音（recipeSlot≠0）且输入填成了另一个音（inputSlot≠0 且 ≠ recipeSlot）」
    // 才算槽位矛盾。输入在配方**留空**的槽位额外多按了一个音（例如 sus4 输入里多出来的九音 A），
    // 那是外音/噪声，由 purity 与 extraCount 把关——不应在此误判为矛盾而把候选整条丢掉
    // （此前 Csus4 + 噪声音会被判空候选，违反 low-confidence 兜底契约）。
    if (recipeSlot !== 0 && inputSlot !== 0 && inputSlot !== recipeSlot) return true;
  }
  return false;
}

const normalizePitch = (p: number) => ((p % 12) + 12) % 12;

const toIntervalMask = (pitchMask: number, root: number): number => {
  const r = root % 12;
  if (r === 0) return pitchMask & 0xfff;
  return ((pitchMask >>> r) | (pitchMask << (12 - r))) & 0xfff;
};

const POPCOUNT = (() => {
  const t = new Uint8Array(4096);
  for (let i = 0; i < 4096; i++) {
    let n = 0,
      m = i;
    while (m) {
      n += m & 1;
      m >>= 1;
    }
    t[i] = n;
  }
  return t;
})();

const bitCount = (m: number) => POPCOUNT[m & 0xfff] ?? 0;

/**
 * 相对命中：只保留「音集相对结构」决定的信息（根音相对音程 + 配方 + 纯度/外音/得分），
 * 不含任何绝对音高与音名。绝对音高、音名、和弦名、分段全部由落地相 materialize 按本次调用
 * 的实际输入重新推导 —— 这是缓存可以跨调/跨把位复用的前提。
 */
interface RelativeHit {
  tokenId: string;
  /** 配方声明序，兼作旧 `templateIndex` 的排序位（同分时的稳定裁决） */
  order: number;
  rootInterval: number;
  intervalMask: number;
  lowestInterval: number;
  isSlash: boolean;
  purity: number;
  extraCount: number;
  score: number;
}

/** 相对缓存存的就是命中表：无音名、无分段、无分层，比整份 AnalyzeResult 小一个量级 */

/** 一次分析的「位置相关」上下文：绝对音高、音名、低音、相对签名都在这里一次性算好 */
interface AnalyzeContext {
  /** 以最低弦音的 pitchClass 为 bit0 的相对音集掩码（12 位） */
  relMask: number;
  /** 相对签名：`relMask:显示根音相对音程`，与调 / 把位 / 变调夹 / 调弦无关 */
  relKey: string;
  /** 显式根音的相对音程：未显式指定为 -1 */
  relExplicit: number;
  /** 基准音 = 最低弦音的 pitchClass（斜杠低音与根音枚举的锚点） */
  bassPitch: number;
  /** 最低弦音的音名（斜杠低音后缀直接用这个） */
  bassLabel: string;
  labelByPitch: (string | undefined)[];
  explicitRootPitch: number | null;
}

/**
 * 候选打分。
 *
 * 结构分**直接采用识别器的分数**（`recognizeByIntervals` 给出的 `rec.score`），
 * 只在其上加一项低音偏好。这样做的理由：
 *
 * 旧实现的结构分是「纯度 0.5 + 低音 0.28 + 常用度 0.1 + 杂项」的**手调加权和**，
 * 其中常用度来自逐条手抄的 `baseWeight`。本次改造把候选来源换成 token 表后，
 * `baseWeight` 这类手抄常量已不存在，若继续在引擎侧自造一套结构分，就会出现
 * **两套结构判据并存**（识别器一套、引擎一套），且实测立刻跑偏 ——
 * 引擎侧自造的弱惩罚挡不住 `C6/9` 压过 `C`（前者常用度更高、纯度同样是 1.0）。
 *
 * 识别器的分数已经过语料验证（63/63 自检、`C E G`→`C`、`C6`→`six`、`Cm7b5`→`halfDim7`
 * 等歧义裁决全部正确），它内含旧引擎没有的**专指度**判据
 * （`unusedDeclared` 声明却未出现的音、`slotMismatch` 槽位失配、`inflation` 虚报音数），
 * 正是压制这类误判所必需。故这里复用它、不再另造。
 *
 * 低音偏好无法由识别器提供（它是纯音集运算，不知道哪个音在最低弦），
 * 因此保留旧引擎的 `bassScore` 语义，按新旧分数量级比（旧 ≈870 / 新 ≈200 ≈ 4.35 倍）
 * 缩放成加项：`BASS_SCALE × (bassScore − 1)`，取值域 0 ~ −27。
 */
function softScore(
  recognitionScore: number,
  isSlash: boolean,
  lowestInterval: number,
  explicitRoot: boolean,
  recipe: Recipe
): number {
  if (!isSlash || explicitRoot)
    // 非斜杠，或用户**显式指定**了根音：低音就是根音，不构成「转位可疑」，不加不减
    return recognitionScore;

  const bassInCore = recipe.coreIntervals.includes(lowestInterval);
  const bassInExt = recipe.extensionIntervals.includes(lowestInterval);

  let bassScore: number;
  if (bassInCore) bassScore = 0.78;
  else if (bassInExt) bassScore = 0.68;
  else if (recipe.category === 'triad' || recipe.category === 'power') bassScore = 0.55;
  else bassScore = 0.35;

  return Math.round((recognitionScore + BASS_SCALE * (bassScore - 1)) * 10) / 10;
}

/**
 * 低音偏好的缩放系数：`(bassScore − 1) × BASS_SCALE` 即低音项对总分的加减。
 *
 * 取值依据见 `softScore` 注释：斜杠候选整体打折，折扣幅度对齐旧实现
 * （旧实现低音项占满分约 31%，`bassScore` 从 1.0 降到 0.78 即扣约 10% 总分）。
 */
const BASS_SCALE = 200;

/**
 * 落地相单条：把「相对命中」+ 本次调用的实际上下文合成完整候选。
 * 绝对根音音高、根音/各音音名、斜杠低音、和弦名、分段全部在这里按实际输入重新推导，
 * 因此相对缓存里不需要、也不应该存任何音名 —— 这是跨调复用不会串名的原因。
 */
function materializeCandidate(hit: RelativeHit, rootPitch: number, ctx: AnalyzeContext): ChordCandidate {
  const { labelByPitch, bassLabel, explicitRootPitch } = ctx;
  const recipe = RECIPE_BY_TOKEN.get(hit.tokenId)!;
  const { intervalMask, lowestInterval, isSlash } = hit;
  const rootLabel = getPreferredRootLabel(
    rootPitch,
    labelByPitch,
    recipe.suffix,
    explicitRootPitch !== null ? rootPitch : null
  );
  const slashBassLabel = isSlash ? `/${bassLabel}` : '';
  // 角色由 AST 结构直接推导（旧实现只能读手写模板的 required/optional 槽位）。
  // `skipAbsentExtensions` 必不可少：配方声明的扩展音未必真被按响，
  // 照配方全量派角色会造出「角色表里有九音、音集里没有」的幽灵音。
  const roles: RoleAssignment[] = rolesOfAst(recipe.ast, rootPitch, labelByPitch, {
    inputMask: intervalMask,
    ...(isSlash ? { bassInterval: lowestInterval } : {}),
    skipAbsentExtensions: true,
  });

  const chordName = `${rootLabel}${recipe.suffix}${slashBassLabel}`;
  let segments = nameToSegments(chordName) ?? undefined;
  if (!segments) {
    const parsedRoot = parsePitchSegment(rootLabel);
    if (parsedRoot) {
      const cleanBassLabel = slashBassLabel.startsWith('/') ? slashBassLabel.slice(1) : slashBassLabel;
      const parsedBass = isSlash ? (parsePitchSegment(cleanBassLabel) ?? undefined) : undefined;
      segments = {
        root: parsedRoot,
        unknownQuality: recipe.suffix || undefined,
        bass: parsedBass,
      };
    }
  }

  return {
    chordName,
    rootLabel,
    rootPitch,
    suffix: recipe.suffix,
    category: recipe.category,
    roles,
    purity: hit.purity,
    extraCount: hit.extraCount,
    score: hit.score,
    tier: 'theoretical',
    segments,
  };
}

function assignTiers(candidates: ChordCandidate[]): void {
  if (candidates.length === 0) return;
  // 排序为「纯度优先、同纯度内分数降序」，分层随之按纯度带进行：
  //  - low_confidence：纯度 < MIN_PURITY（不变）；
  //  - best：纯度等于最高纯度、且分数距该带内最高分 ≤0.5（并列首选组，语义同 preferredHit）。
  //    旧实现按全局分数划 best——低音在骨架内的根音位读法会凭加分压过「多解释一个音」的
  //    高纯度转位读法（实测 {A,G#,B,E} 选了丢大七度的 Asus2 而非 E/A）；纯度优先排序后
  //    分数不再单调降序，必须以「同纯度带」为 best 的前提；
  //  - alternative：其余达纯度门槛者，距最高纯度带内最高分 ≤ BEST_GAP；
  //  - theoretical：达纯度门槛的其余候选。
  const topPurity = candidates[0]!.purity; // 排序保证首位纯度最高
  const topBandBestScore = Math.max(...candidates.filter(c => c.purity === topPurity).map(c => c.score));

  for (const c of candidates)
    if (c.purity < MIN_PURITY) c.tier = 'low_confidence';
    else {
      const gap = topBandBestScore - c.score;
      if (c.purity === topPurity && gap <= 0.5) c.tier = 'best';
      else if (gap <= BEST_GAP) c.tier = 'alternative';
      else c.tier = 'theoretical';
    }
}

// 分析结果缓存：键是和弦签名（根音+后缀+音集），单条含候选数组（KB 级）。
// 上限 4096 与其余和弦数据缓存对齐：整库浏览 / 搜索 / 变体面板并排展示时活跃签名可达数百，
// 128 会持续击穿并反复重跑候选匹配；单条 KB 级，满配也只是几 MB
const cache = createLruCache<AnalyzeResult>(4096, {
  name: '和弦引擎解析',
  weigh: (_, value) => estimateValueBytes(value),
});

// 相对（位置无关）命中缓存：键只由「音集相对结构 + 显式根音相对音程」组成，
// 值与调/把位/变调夹/调弦无关 —— 同一形状的全部移调共用同一条，命中即省掉整轮模板匹配。
// 单条只存相对命中（几个数字），比绝对层的 AnalyzeResult 小一个量级，故同样给 4096 上限
const relativeCache = createLruCache<RelativeHit[]>(4096, {
  name: '和弦引擎解析·相对',
  weigh: (_, value) => estimateValueBytes(value),
});

/** 构造一次空分析结果：每次返回新对象，避免缓存与调用方共享同一引用后被意外改写 */
function createEmptyResult(): AnalyzeResult {
  return {
    candidates: [],
    bestRootPitch: 0,
    best: undefined,
    alternatives: [],
    theoretical: [],
    lowConfidence: [],
  };
}

/**
 * 结合五度圈习惯、显式根音标记与性质后缀决定根音音名拼写（如小调倾向 C#m/Ebm/G#m/Bbm，非显式时不出现冷门音名）
 */
function getPreferredRootLabel(
  rootPitch: number,
  labelByPitch: (string | undefined)[],
  suffix: string,
  explicitRootPitch: number | null
): string {
  const normRoot = normalizePitch(rootPitch);
  if (explicitRootPitch !== null && normalizePitch(explicitRootPitch) === normRoot) {
    const explicitLabel = labelByPitch[normRoot];
    if (explicitLabel) return explicitLabel;
  }

  const isMinor = suffix.startsWith('m') && !suffix.startsWith('maj') && !suffix.startsWith('Maj');
  const existingLabel = labelByPitch[normRoot];

  switch (normRoot) {
    case 1: // C# / Db
      if (isMinor) return 'C#';
      return existingLabel || 'Db';
    case 3: // D# / Eb
      return existingLabel || 'Eb';
    case 6: // F# / Gb
      return existingLabel || 'F#';
    case 8: // G# / Ab
      if (isMinor) return 'G#';
      return existingLabel === 'G#' ? 'G#' : 'Ab';
    case 10: // A# / Bb
      return existingLabel || 'Bb';
    default:
      return existingLabel || STANDARD_ROOT_NAMES[normRoot] || 'C';
  }
}

/** 收集输入音符的音高掩码、最低音与各音高对应的音名（显式根音音高优先保留其音名，空缺由标准音名兜底）。
 *  最低音默认按弦序取（弦 0 为基准）——标准吉他调弦下空弦音高随弦序递增，两者等价。
 *  重入调弦（尤克里里 GCEA：弦 0 的 G4 高于弦 1 的 C4）必须传 bassByPitch，
 *  否则会拿物理上并不是最低的弦当低音，把 C 识别成 C/G、并连带污染转位判定。 */
function collectNoteContext(notes: NoteInput[], explicitRootPitch: number | null, bassByPitch = false) {
  let pitchMask = 0;
  const labelByPitch: (string | undefined)[] = new Array(12);
  const lowestNote = bassByPitch
    ? notes.reduce((min, n) => (n.pitchIndex < min.pitchIndex ? n : min), notes[0]!)
    : notes.reduce((min, n) => (n.stringIndex < min.stringIndex ? n : min), notes[0]!);

  const normExplicit = explicitRootPitch !== null ? normalizePitch(explicitRootPitch) : null;

  if (normExplicit !== null) {
    const explicitNote = notes.find(n => normalizePitch(n.pitchIndex) === normExplicit);
    if (explicitNote && explicitNote.label) labelByPitch[normExplicit] = explicitNote.label;
  }

  for (const n of notes) {
    const p = normalizePitch(n.pitchIndex);
    pitchMask |= 1 << p;
    if (labelByPitch[p] === undefined && n.label) labelByPitch[p] = n.label;
  }

  for (let p = 0; p < 12; p++) if (!labelByPitch[p]) labelByPitch[p] = STANDARD_ROOT_NAMES[p];

  return { pitchMask, labelByPitch, lowestNote };
}

/** 枚举候选根音的「相对音程」：显式指定时只用该音，否则取输入中出現的全部音级（基准音为 0） */
function resolveRootIntervals(relMask: number, relExplicitRoot: number): number[] {
  if (relExplicitRoot >= 0) return [relExplicitRoot];

  const rootIntervals: number[] = [];
  for (let p = 0; p < 12; p++) if (relMask & (1 << p)) rootIntervals.push(p);

  return rootIntervals;
}

/**
 * 收集某个根音下的全部候选配方。
 *
 * 候选来源是 AST 识别（`recognizeByIntervals`）而非手写模板遍历 —— 这是本次切换的核心：
 * 配方、写法、角色、分类全部由 token 表派生，新增一个和弦性质时识别端自动获得能力，
 * 不再需要「往 47 条模板里再抄一行」（旧表因漏抄而只覆盖语料 42/74）。
 *
 * 识别器负责「哪些配方在结构上说得通」（骨架音齐全、外音不超限、槽位贴合），
 * 本函数负责把它的结果换算回旧引擎的评分口径：
 * - `purity` / `extraCount` 沿用旧公式（含**低音豁免**：斜杠低音不计入未解释音）
 * - 纯度低于 `LOW_PURITY_THRESHOLD` 直接丢弃（与旧实现同一门槛、同一量纲）
 *
 * 低音豁免的必要性见旧实现注释：音集 E G# B D（低音 D）里 D 对 E 大三配方是「小七度冲突音」，
 * 但作为低音应放行出 E/D 候选，否则只剩 E7/D 一种解读。
 */
function collectRecipeHitsForRoot(
  rootInterval: number,
  relMask: number,
  totalInputNotes: number,
  explicitRoot: boolean
): RelativeHit[] {
  const intervalMask = toIntervalMask(relMask, rootInterval);
  // 基准音（最低弦音）相对根音的音程：rootInterval 为 0 时即根音原位，不构成斜杠
  const lowestInterval = normalizePitch(-rootInterval);
  const isSlash = rootInterval !== 0;
  const lowestBit = 1 << lowestInterval;

  // 输入音集旋转到「以该根音为 0」的相对半音列表，供识别器匹配
  const semitones: number[] = [];
  for (let i = 0; i < 12; i++) if (relMask & (1 << i)) semitones.push(normalizePitch(i - rootInterval));

  const hits: RelativeHit[] = [];
  for (const rec of recognizeByIntervals(semitones, {
    allowMissing: 1,
    maxExtra: 3,
    // 低音隔离：低音音级（相对根音）传给归因模型——延伸槽位不得用低音音级归因
    bassSemitone: lowestInterval,
  })) {
    const recipe = RECIPE_BY_TOKEN.get(rec.tokenId);
    if (!recipe) continue;

    // 骨架音缺失的口径：**只允许五音缺席**。
    //
    // 三音定义大/小调、七音定义和弦类型，缺了它们就是另一个和弦，必须严格在场；
    // 纯五音是最不定义和弦身份的音，乐器上常被省略（三和弦省五、`6` 和弦省五都常见），
    // 旧手写模板正是把五音标成 `optional` 来放行这类输入。
    // 识别器不区分「缺哪个音」，只给一个 `missing` 计数，故这一层判据由本引擎补上。
    const missingCore = recipe.coreMask & ~intervalMask;
    if ((missingCore & ~FIFTH_INTERVALS_MASK) !== 0) continue;
    // 强力和弦（5）的「内容」就是根音 + 五音两条，五音缺席等于只剩一个音——
    // 「五音可省」的豁免是为三和弦 / 6 和弦设的（省五仍能表意），不能套到 power 上：
    // 否则任意音集只要含某音、再配一个低音（低音豁免再送一票纯度），就能读出 X5/低音
    // （实测 {C,E,G} 会冒出 E5/C、G5/C 这类垃圾候选）。
    if (recipe.category === 'power' && missingCore !== 0) continue;

    // 槽位一致性：配方在某槽位填了音，输入**不能填成另一个**。
    //
    // 这是旧手写 `conflicts` 的正则化替代。举例：`C E G` 上 `aug`（五音增五）与
    // `no3`（三音槽撤销）都「骨架音齐全或只缺五音」，但它们与输入**矛盾** ——
    // 大三和弦的纯五音恰好否定了增五，齐全的三音恰好否定了 no3。
    // 只判「缺不缺」看不出矛盾，必须按槽位分组比对。
    // 槽位矛盾判定对斜杠低音位豁免：低音只是按在低音区，不参与性质判定
    // （如 Bbadd9/F# 的 F# 是 ♭5，落在五音槽，与 add9 的纯五音冲突——若计入会整条丢弃候选）。
    // 纯度层已通过 `explainedMask |= intervalMask & lowestBit` 对低音豁免，此处对称处理。
    if (hasSlotContradiction(recipe.mask, isSlash ? intervalMask & ~lowestBit : intervalMask)) continue;

    // 延伸音归因门槛（统一模型，取代旧「斜杠低音色彩门」+「半数实例化门」两处补丁）：
    // **不可省**的延伸音必须有独立证据——缺席、或仅由低音音位支撑（低音隔离）都算无证据。
    // 可省槽位（13 系的 9/11 还原音）免于门槛与惩罚——省是 13 系和弦的预期形态。
    // 低音占据 core 槽位（转位）不受此限；power 的五音门槛属 core 归因，另行保留。
    if (rec.extensionAttribution.unclaimedNonOmittable > 0) continue;

    let explainedMask = intervalMask & recipe.mask;
    // 低音豁免：斜杠低音本身不计入「未解释」——它只表示按在低音区，不参与性质判定
    if (isSlash) explainedMask |= intervalMask & lowestBit;

    const explainedCount = bitCount(explainedMask);
    const purity = totalInputNotes === 0 ? 0 : explainedCount / totalInputNotes;
    if (purity < LOW_PURITY_THRESHOLD) continue;

    const extraCount = totalInputNotes - explainedCount;
    const score = softScore(rec.score, isSlash, lowestInterval, explicitRoot, recipe);

    hits.push({
      tokenId: recipe.tokenId,
      order: recipe.order,
      rootInterval,
      intervalMask,
      lowestInterval,
      isSlash,
      purity,
      extraCount,
      score,
    });
  }
  return hits;
}

/** 遍历全部候选根音，收集通过纯度门槛的候选命中（纯相对运算，不碰音名） */
function collectRelativeHits(relMask: number, relExplicitRoot: number): RelativeHit[] {
  const totalInputNotes = bitCount(relMask);
  const rootIntervals = resolveRootIntervals(relMask, relExplicitRoot);
  const explicitRoot = relExplicitRoot >= 0;
  const hits: RelativeHit[] = [];

  for (const rootInterval of rootIntervals)
    hits.push(...collectRecipeHitsForRoot(rootInterval, relMask, totalInputNotes, explicitRoot));

  return hits;
}

/**
 * 去重：同一「根音相对音程 + 配方 token」只保留最高分者（同分保留配方序靠前者，见下方比较）。
 *
 * 当前 tokenId 在每个根音下唯一，故这条去重在无同义 token 时是恒等变换——保留它是为了兜住
 * 「同一 token 由多条 token 表条目派生」的将来情形（同义写法若拆成多条 token），以及同 token 多命中下的取最高分。
 * 不在这里做 top-N 截断 —— 截断要按「绝对根音升序」处理平局，属位置相关信息，
 * 放到落地相 materialize 在绝对序上做，这样同一形状跨调复用与全量重算结果一致。
 */
function dedupeRelativeHits(hits: RelativeHit[]): RelativeHit[] {
  const best = new Map<string, RelativeHit>();
  for (const h of hits) {
    const key = `${h.rootInterval}|${h.tokenId}`;
    const prev = best.get(key);
    // 同分保留配方序靠前者，与原实现「稳定排序后取首个」一致
    if (!prev || h.score > prev.score) best.set(key, h);
  }
  return [...best.values()];
}

/** 完成分层并把候选拆成 best / alternatives / theoretical，同时给出最佳根音 */
function groupCandidates(candidates: ChordCandidate[], bassPitch: number): AnalyzeResult {
  assignTiers(candidates);

  return {
    candidates,
    bestRootPitch: candidates.length > 0 ? candidates[0]!.rootPitch : bassPitch,
    best: candidates.find(c => c.tier === 'best'),
    alternatives: candidates.filter(c => c.tier === 'alternative'),
    theoretical: candidates.filter(c => c.tier === 'theoretical'),
    lowConfidence: candidates.filter(c => c.tier === 'low_confidence'),
  };
}

/**
 * 候选排序规则：纯度降序 → 分数降序 → 绝对根音升序 → 配方序升序。
 *
 * 纯度（含低音豁免后「解释了多少音」）必须排在低音加分之前：低音在骨架内的候选有加分，
 * 但那不能补偿「少解释一个音」——否则 {A,G#,B,E} 会选丢掉大七度的 Asus2（p0.75），
 * 而不是四音全保的 E/A（p1.00）；{C,G,B,F} 同理会选 Csus4 而非惯例的 G7/C。
 * 低音偏好只在**同纯度**内裁决。
 *
 * 第三键从旧的「模板序」换成「token 表声明序」，语义一致 —— 都是**人工排定的优先级**，
 * 用来裁决同分候选。它承担着一件实事：`six` 与 `add13` 的 AST 完全相同（`C6` 的两种说法），
 * 分数必然相同，只有声明序能把常用的 `6` 排在前面，否则会按名字字母序偶然选中 `add13`
 * （实测踩过：`C E G A` 被显示成 `Cadd13`）。
 */
const compareCandidateOrder = (
  aPurity: number,
  aS: number,
  aRoot: number,
  aRecipe: number,
  bPurity: number,
  bS: number,
  bRoot: number,
  bRecipe: number
): number => bPurity - aPurity || bS - aS || aRoot - bRoot || aRecipe - bRecipe;

/** 取相对声明的显式根音音程：未显式指定返回 -1（与 relMask 的 0~11 音程区分开） */
const relativeExplicitRoot = (explicitRootPitch: number | null, bassPitch: number): number =>
  explicitRootPitch === null ? -1 : normalizePitch(explicitRootPitch - bassPitch);

/** 汇总一次分析的位置相关上下文：相对签名（音集旋转到基准音）+ 绝对音高 + 音名表 */
function buildContext(notes: NoteInput[], explicitRootPitch: number | null, bassByPitch = false): AnalyzeContext {
  const { pitchMask, labelByPitch, lowestNote } = collectNoteContext(notes, explicitRootPitch, bassByPitch);
  const bassPitch = normalizePitch(lowestNote.pitchIndex);
  const relMask = toIntervalMask(pitchMask, bassPitch);
  const relExplicit = relativeExplicitRoot(explicitRootPitch, bassPitch);

  return {
    relMask,
    relKey: `${relMask.toString(16)}:${relExplicit}`,
    relExplicit,
    bassPitch,
    bassLabel: lowestNote.label,
    labelByPitch,
    explicitRootPitch,
  };
}

/** 相对（位置无关）命中表：先查相对缓存，未命中才跑一遍模板匹配 */
function getRelativeHits(ctx: AnalyzeContext): RelativeHit[] {
  const cached = relativeCache.get(ctx.relKey);
  if (cached) return cached;

  const hits = dedupeRelativeHits(collectRelativeHits(ctx.relMask, ctx.relExplicit));
  relativeCache.set(ctx.relKey, hits);
  return hits;
}

/** 落地相：相对命中 + 实际上下文 → 绝对序排序 → 截断 top-N → 合成候选 → 分层 */
function materialize(relHits: RelativeHit[], ctx: AnalyzeContext): AnalyzeResult {
  const ordered = relHits.map(hit => ({ hit, rootPitch: normalizePitch(ctx.bassPitch + hit.rootInterval) }));
  ordered.sort((a, b) =>
    compareCandidateOrder(
      a.hit.purity,
      a.hit.score,
      a.rootPitch,
      a.hit.order,
      b.hit.purity,
      b.hit.score,
      b.rootPitch,
      b.hit.order
    )
  );

  const candidates = ordered
    .slice(0, TOP_EVALUATE_LIMIT)
    .map(({ hit, rootPitch }) => materializeCandidate(hit, rootPitch, ctx));

  return groupCandidates(candidates, ctx.bassPitch);
}

/**
 * 和弦识别主流程（两层缓存）：
 * 1. 相对层：以「最低弦音的 pitchClass」为基准，把音集旋转成相对音集掩码当签名 —— 同一个「形状」
 *    在不同调 / 不同把位 / 不同变调夹下签名相同（空弦不随 fretOffset 偏移、异调弦差异都天然体现在掩码里），
 *    因此一条命中可服务同一形状的全部移调。值里只有相对命中（根音相对音程 + 模板 + 纯度/外分），无音名。
 * 2. 绝对层：按本次实际输入（含逐音音名）落地。命中即返回同一个对象引用（保持既有引用稳定语义），
 *    未命中则不再重跑模板匹配，只花一次落地相的开销。
 *
 * bassByPitch：低音取法。缺省按弦序（弦 0），重入调弦须置 true 按真实音高取最低音 —— 见 collectNoteContext。
 */
export function analyzeChordGraph(
  notes: NoteInput[],
  explicitRootPitch: number | null = null,
  bassByPitch = false
): AnalyzeResult {
  if (notes.length === 0) return createEmptyResult();

  // bassByPitch 必须入缓存键：同一组音集在两种低音口径下结果不同，不入键会互相命中
  let key = `${explicitRootPitch ?? 'auto'}:${bassByPitch ? 'p' : 's'}:`;
  for (const n of notes) key += `${n.stringIndex}_${n.pitchIndex}_${n.label}|`;

  const hit = cache.get(key);
  if (hit) return hit;

  const ctx = buildContext(notes, explicitRootPitch, bassByPitch);
  const result = materialize(getRelativeHits(ctx), ctx);

  cache.set(key, result);
  return result;
}

/**
 * 只求最佳根音音高（不合成候选 / 角色 / 音名 / 分段）。
 * 供只要根音的调用方使用（排序元数据、重复判定、拾取面板、分组）：命中相对缓存时不产生任何对象分配，
 * 与 analyzeChordGraph 共用同一套签名与排序规则，故取值口径完全一致。
 */
export function analyzeBestRootPitch(
  notes: NoteInput[],
  explicitRootPitch: number | null = null,
  bassByPitch = false
): number {
  if (notes.length === 0) return 0;

  const ctx = buildContext(notes, explicitRootPitch, bassByPitch);
  const relHits = getRelativeHits(ctx);
  if (relHits.length === 0) return ctx.bassPitch;

  let best = relHits[0]!;
  let bestRoot = normalizePitch(ctx.bassPitch + best.rootInterval);
  for (let i = 1; i < relHits.length; i++) {
    const h = relHits[i]!;
    const absRoot = normalizePitch(ctx.bassPitch + h.rootInterval);
    if (compareCandidateOrder(h.purity, h.score, absRoot, h.order, best.purity, best.score, bestRoot, best.order) < 0) {
      best = h;
      bestRoot = absRoot;
    }
  }
  return bestRoot;
}
