import { estimateValueBytes } from '@/platform/utils/common';
import { createLruCache } from '@/platform/utils/lruCache';

import { GRAMMAR_TEMPLATES } from './grammar.ts';
import { nameToSegments, parsePitchSegment } from './theory.ts';

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

interface SlotDef {
  interval: number;
  role: ChordSlot;
  confidence: RoleConfidence;
}

export interface GrammarTemplate {
  suffix: string;
  category: ChordCandidate['category'];
  baseWeight: number;
  required: SlotDef[];
  optional?: SlotDef[];
  conflicts: number[];
}

interface CompiledTemplate {
  template: GrammarTemplate;
  reqMask: number;
  optMask: number;
  conflictMask: number;
}

const COMPILED_TEMPLATES: CompiledTemplate[] = GRAMMAR_TEMPLATES.map(t => {
  let reqMask = 0;
  for (const r of t.required) reqMask |= 1 << r.interval;
  let optMask = 0;
  if (t.optional) {
    for (const o of t.optional) optMask |= 1 << o.interval;
  }
  let conflictMask = 0;
  for (const c of t.conflicts) conflictMask |= 1 << c;
  return { template: t, reqMask, optMask, conflictMask };
});

const WEIGHTS = {
  PURITY: 0.5,
  BASS: 0.28,
  COMMONNESS: 0.1,
  EXTRA_PENALTY: 0.25,
};

/** 候选和弦纯度门槛（60%）：低于此纯度的和弦组合归入 low_confidence 评级，不参与第一梯队竞争 */
const MIN_PURITY = 0.6;
/** 粗筛阶段绝对纯度底线（45%）：低于此阈值的模板组合直接丢弃不纳入候选池，大幅裁剪无效搜索空间 */
const LOW_PURITY_THRESHOLD = 0.45;
/** 梯队分差窗口（6分）：纯度达标前提下，与第一名最佳和弦分差在 6 分内的判定为可信替代和弦（alternative），超出则归为理论和弦 */
const BEST_GAP = 6;
/** 识别结果候选上限（10个）：按最终得分去重后保留的最大候选条数，保证转位多样性的同时防止冗余扩散 */
const TOP_EVALUATE_LIMIT = 10;

const STANDARD_ROOT_NAMES: readonly string[] = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

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
 * 相对命中：只保留「音集相对结构」决定的信息（根音相对音程 + 模板 + 纯度/外音/得分），
 * 不含任何绝对音高与音名。绝对音高、音名、和弦名、分段全部由落地相 materialize 按本次调用
 * 的实际输入重新推导 —— 这是缓存可以跨调/跨把位复用的前提。
 */
interface RelativeHit {
  templateIndex: number;
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

function fastSoftScore(
  purity: number,
  extraCount: number,
  isSlash: boolean,
  lowestInterval: number,
  explicitRoot: boolean,
  template: GrammarTemplate
): number {
  let bassScore = 1.0;

  if (isSlash) {
    if (explicitRoot) {
      bassScore = 1.0;
    } else {
      const bassInCore = template.required.some(r => r.interval === lowestInterval);
      const bassInOpt = template.optional?.some(r => r.interval === lowestInterval) ?? false;

      if (bassInCore) {
        bassScore = 0.78;
      } else if (bassInOpt) {
        bassScore = 0.68;
      } else if (template.category === 'triad' || template.category === 'power') {
        bassScore = 0.55;
      } else {
        bassScore = 0.35;
      }
    }
  }

  const commonness = template.baseWeight / 200;
  const extraPenalty = Math.min(extraCount * WEIGHTS.EXTRA_PENALTY, 0.75);

  let naturalBonus = 0;
  if (!isSlash && purity >= 0.95) {
    naturalBonus = 0.04;
  }

  const total =
    purity * WEIGHTS.PURITY + bassScore * WEIGHTS.BASS + commonness * WEIGHTS.COMMONNESS - extraPenalty + naturalBonus;

  return Math.round(total * 1000) / 10;
}

/**
 * 构造一个角色归属：把根音与音程换算为实际音高，并取该音高上记录的首个音名。
 * 必选音、可选音、转位低音、外音四处共用同一套构造规则。
 */
function createRole(
  rootPitch: number,
  interval: number,
  role: ChordSlot,
  confidence: RoleConfidence,
  labelByPitch: (string | undefined)[]
): RoleAssignment {
  const pitchIndex = (rootPitch + interval) % 12;
  return {
    noteLabel: labelByPitch[pitchIndex] || '',
    pitchIndex,
    interval,
    role,
    confidence,
  };
}

/**
 * 落地相单条：把「相对命中」+ 本次调用的实际上下文合成完整候选。
 * 绝对根音音高、根音/各音音名、斜杠低音、和弦名、分段全部在这里按实际输入重新推导，
 * 因此相对缓存里不需要、也不应该存任何音名 —— 这是跨调复用不会串名的原因。
 */
function materializeCandidate(hit: RelativeHit, rootPitch: number, ctx: AnalyzeContext): ChordCandidate {
  const { labelByPitch, bassLabel, explicitRootPitch } = ctx;
  const template = COMPILED_TEMPLATES[hit.templateIndex]!.template;
  const { intervalMask, lowestInterval, isSlash } = hit;
  const rootLabel = getPreferredRootLabel(
    rootPitch,
    labelByPitch,
    template.suffix,
    explicitRootPitch !== null ? rootPitch : null
  );
  const slashBassLabel = isSlash ? `/${bassLabel}` : '';
  const roles: RoleAssignment[] = [];
  const usedIntervals = new Set<number>();

  for (const req of template.required) {
    roles.push(createRole(rootPitch, req.interval, req.role, req.confidence, labelByPitch));
    usedIntervals.add(req.interval);
  }

  if (template.optional) {
    for (const opt of template.optional) {
      if (intervalMask & (1 << opt.interval) && !usedIntervals.has(opt.interval)) {
        roles.push(createRole(rootPitch, opt.interval, opt.role, opt.confidence, labelByPitch));
        usedIntervals.add(opt.interval);
      }
    }
  }

  if (isSlash && !usedIntervals.has(lowestInterval)) {
    roles.push(createRole(rootPitch, lowestInterval, 'slash_bass', 'optional', labelByPitch));
    usedIntervals.add(lowestInterval);
  }

  for (let i = 0; i < 12; i++) {
    if (intervalMask & (1 << i) && !usedIntervals.has(i)) {
      roles.push(createRole(rootPitch, i, 'extra', 'extra', labelByPitch));
    }
  }

  const chordName = `${rootLabel}${template.suffix}${slashBassLabel}`;
  let segments = nameToSegments(chordName) ?? undefined;
  if (!segments) {
    const parsedRoot = parsePitchSegment(rootLabel);
    if (parsedRoot) {
      const cleanBassLabel = slashBassLabel.startsWith('/') ? slashBassLabel.slice(1) : slashBassLabel;
      const parsedBass = isSlash ? (parsePitchSegment(cleanBassLabel) ?? undefined) : undefined;
      segments = {
        root: parsedRoot,
        unknownQuality: template.suffix || undefined,
        bass: parsedBass,
      };
    }
  }

  return {
    chordName,
    rootLabel,
    rootPitch,
    suffix: template.suffix,
    category: template.category,
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
  const highQualityCandidates = candidates.filter(c => c.purity >= MIN_PURITY);
  const bestScore = highQualityCandidates.length > 0 ? highQualityCandidates[0]!.score : candidates[0]!.score;

  for (const c of candidates) {
    if (c.purity < MIN_PURITY) {
      c.tier = 'low_confidence';
    } else {
      const gap = bestScore - c.score;
      if (gap <= 0.5) c.tier = 'best';
      else if (gap <= BEST_GAP) c.tier = 'alternative';
      else c.tier = 'theoretical';
    }
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

/** 收集输入音符的音高掩码、最低音（按弦序）与各音高对应的音名（显式根音音高优先保留其音名，空缺由标准音名兜底） */
function collectNoteContext(notes: NoteInput[], explicitRootPitch: number | null) {
  let pitchMask = 0;
  const labelByPitch: (string | undefined)[] = new Array(12);
  const lowestNote = notes.reduce((min, n) => (n.stringIndex < min.stringIndex ? n : min), notes[0]!);

  const normExplicit = explicitRootPitch !== null ? normalizePitch(explicitRootPitch) : null;

  if (normExplicit !== null) {
    const explicitNote = notes.find(n => normalizePitch(n.pitchIndex) === normExplicit);
    if (explicitNote && explicitNote.label) {
      labelByPitch[normExplicit] = explicitNote.label;
    }
  }

  for (const n of notes) {
    const p = normalizePitch(n.pitchIndex);
    pitchMask |= 1 << p;
    if (labelByPitch[p] === undefined && n.label) labelByPitch[p] = n.label;
  }

  for (let p = 0; p < 12; p++) {
    if (!labelByPitch[p]) labelByPitch[p] = STANDARD_ROOT_NAMES[p];
  }

  return { pitchMask, labelByPitch, lowestNote };
}

/** 枚举候选根音的「相对音程」：显式指定时只用该音，否则取输入中出現的全部音级（基准音为 0） */
function resolveRootIntervals(relMask: number, relExplicitRoot: number): number[] {
  if (relExplicitRoot >= 0) return [relExplicitRoot];

  const rootIntervals: number[] = [];
  for (let p = 0; p < 12; p++) {
    if (relMask & (1 << p)) rootIntervals.push(p);
  }
  return rootIntervals;
}

/**
 * 用单个模板匹配当前音集：不冲突且必选音齐全时给出纯度与分数，否则判定为不匹配。
 * 全程只用到相对音程（根音为 bit0 的音程掩码 + 相对最低音），因此与绝对调性/把位无关。
 */
function evaluateTemplate(
  templateIndex: number,
  comp: CompiledTemplate,
  rootInterval: number,
  intervalMask: number,
  lowestInterval: number,
  isSlash: boolean,
  totalInputNotes: number,
  explicitRoot: boolean
): RelativeHit | null {
  // 低音豁免：slash 低音只是「按在低音区的那个音」，不参与和弦性质的冲突判定。
  // 例如音集 E G# B D（低音 D）：D 对 E 大三模板是 m7 冲突音，但作为低音应放行出 E/D 候选
  // （否则只剩 E7/D 一种解读）。仅豁免最低音这一个音程；必选音与其余冲突检查不变，
  // 非低音音符仍须满足模板约束，候选空间不会发散。
  const effectiveConflictMask = isSlash ? comp.conflictMask & ~(1 << lowestInterval) : comp.conflictMask;
  if ((intervalMask & effectiveConflictMask) !== 0) return null;
  if ((intervalMask & comp.reqMask) !== comp.reqMask) return null;

  let explainedMask = intervalMask & (comp.reqMask | comp.optMask);
  if (isSlash) explainedMask |= intervalMask & (1 << lowestInterval);

  const explainedCount = bitCount(explainedMask);
  const purity = totalInputNotes === 0 ? 0 : explainedCount / totalInputNotes;
  if (purity < LOW_PURITY_THRESHOLD) return null;

  const extraCount = totalInputNotes - explainedCount;
  const score = fastSoftScore(purity, extraCount, isSlash, lowestInterval, explicitRoot, comp.template);

  return {
    templateIndex,
    rootInterval,
    intervalMask,
    lowestInterval,
    isSlash,
    purity,
    extraCount,
    score,
  };
}

/** 遍历「根音相对音程 × 模板」的全部组合，收集通过纯度门槛的候选命中（纯相对运算，不碰音名） */
function collectRelativeHits(relMask: number, relExplicitRoot: number): RelativeHit[] {
  const totalInputNotes = bitCount(relMask);
  const rootIntervals = resolveRootIntervals(relMask, relExplicitRoot);
  const explicitRoot = relExplicitRoot >= 0;
  const hits: RelativeHit[] = [];

  for (const rootInterval of rootIntervals) {
    const intervalMask = toIntervalMask(relMask, rootInterval);
    // 基准音（最低弦音）相对根音的音程：rootInterval 为 0 时即根音原位，不构成斜杠
    const lowestInterval = normalizePitch(-rootInterval);
    const isSlash = rootInterval !== 0;

    for (let ti = 0; ti < COMPILED_TEMPLATES.length; ti++) {
      const hit = evaluateTemplate(
        ti,
        COMPILED_TEMPLATES[ti]!,
        rootInterval,
        intervalMask,
        lowestInterval,
        isSlash,
        totalInputNotes,
        explicitRoot
      );
      if (hit) hits.push(hit);
    }
  }

  return hits;
}

/**
 * 去重：同一「根音相对音程 + 模板后缀」只保留最高分者（模板后缀当前全表唯一，这里是重复后缀的兜底）。
 * 不在这里做 top-N 截断 —— 截断要按「绝对根音升序」处理平局，属位置相关信息，
 * 放到落地相 materialize 在绝对序上做，这样同一形状跨调复用与全量重算结果一致。
 */
function dedupeRelativeHits(hits: RelativeHit[]): RelativeHit[] {
  const best = new Map<string, RelativeHit>();
  for (const h of hits) {
    const key = `${h.rootInterval}|${COMPILED_TEMPLATES[h.templateIndex]!.template.suffix}`;
    const prev = best.get(key);
    // 同分保留模板序靠前者，与原实现「稳定排序后取首个」一致
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
 * 候选排序规则：分数降序 → 绝对根音升序 → 模板序升序。
 * 与旧实现「按分做稳定排序（插入序 = 绝对根音升序 × 模板序）」得到的总序完全一致，
 * 因此落地相排序 + 截断 top-N 的结果与旧实现逐位相同。落地相排序与「只问最佳根音」的快路径共用本规则。
 */
const compareCandidateOrder = (
  aS: number,
  aRoot: number,
  aTpl: number,
  bS: number,
  bRoot: number,
  bTpl: number
): number => bS - aS || aRoot - bRoot || aTpl - bTpl;

/** 取相对声明的显式根音音程：未显式指定返回 -1（与 relMask 的 0~11 音程区分开） */
const relativeExplicitRoot = (explicitRootPitch: number | null, bassPitch: number): number =>
  explicitRootPitch === null ? -1 : normalizePitch(explicitRootPitch - bassPitch);

/** 汇总一次分析的位置相关上下文：相对签名（音集旋转到基准音）+ 绝对音高 + 音名表 */
function buildContext(notes: NoteInput[], explicitRootPitch: number | null): AnalyzeContext {
  const { pitchMask, labelByPitch, lowestNote } = collectNoteContext(notes, explicitRootPitch);
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
    compareCandidateOrder(a.hit.score, a.rootPitch, a.hit.templateIndex, b.hit.score, b.rootPitch, b.hit.templateIndex)
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
 */
export function analyzeChordGraph(notes: NoteInput[], explicitRootPitch: number | null = null): AnalyzeResult {
  if (notes.length === 0) return createEmptyResult();

  let key = `${explicitRootPitch ?? 'auto'}:`;
  for (const n of notes) {
    key += `${n.stringIndex}_${n.pitchIndex}_${n.label}|`;
  }

  const hit = cache.get(key);
  if (hit) return hit;

  const ctx = buildContext(notes, explicitRootPitch);
  const result = materialize(getRelativeHits(ctx), ctx);

  cache.set(key, result);
  return result;
}

/**
 * 只求最佳根音音高（不合成候选 / 角色 / 音名 / 分段）。
 * 供只要根音的调用方使用（排序元数据、重复判定、拾取面板、分组）：命中相对缓存时不产生任何对象分配，
 * 与 analyzeChordGraph 共用同一套签名与排序规则，故取值口径完全一致。
 */
export function analyzeBestRootPitch(notes: NoteInput[], explicitRootPitch: number | null = null): number {
  if (notes.length === 0) return 0;

  const ctx = buildContext(notes, explicitRootPitch);
  const relHits = getRelativeHits(ctx);
  if (relHits.length === 0) return ctx.bassPitch;

  let best = relHits[0]!;
  let bestRoot = normalizePitch(ctx.bassPitch + best.rootInterval);
  for (let i = 1; i < relHits.length; i++) {
    const h = relHits[i]!;
    const absRoot = normalizePitch(ctx.bassPitch + h.rootInterval);
    if (compareCandidateOrder(h.score, absRoot, h.templateIndex, best.score, bestRoot, best.templateIndex) < 0) {
      best = h;
      bestRoot = absRoot;
    }
  }
  return bestRoot;
}
