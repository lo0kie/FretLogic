import { createLruCache } from '@/platform/utils/cache';
import { clamp, estimateValueBytes } from '@/platform/utils/common';

import type {
  BarreEntity,
  BarreFret,
  Capo,
  FretOffset,
  GuitarStringsModel,
  StringIndex,
} from '@/domains/fretboard/types';

// 横按候选缓存：键是「各弦品位 + 品数」，值是一组候选（每条几十字节，储备便宜）。
// 上限 4096 相当于放开——实际键空间按指法组合自然增长，容量不再成为淘汰动因
const barreCandidatesCache = createLruCache<BarreEntity[]>(4096, {
  name: '指板横按候选',
  weigh: (_, value) => estimateValueBytes(value),
});

/**
 * 计算当前指板「可被手动标记的横按」候选列表（供横按编辑弹窗展示，用户选择后写入 barres，不自动应用）。
 *
 * 对每个品位 F（1..fretCount），取**恰好按在 F 品**的弦，生成候选（候选之间不共用琴弦）：
 * 连续子段：端点之间允许更高品位的音符（食指垫底，如 F/Bb 大横按），但空弦 / 静音 / 更低品位会
 * 切断候选，每个长度 >= 2 的连续子段单独生成候选（例：2x222x 产出 4/3/2 弦横按；22x222 产出 6/5 弦与 4/3/2 弦两组横按）。
 */
export const computeBarreCandidates = (strings: GuitarStringsModel, fretCount: number): BarreEntity[] => {
  const cacheKey = `${strings.map(s => s.fret).join(',')}_${fretCount}`;
  const cached = barreCandidatesCache.get(cacheKey);
  if (cached) return cached;

  const out: BarreEntity[] = [];
  for (let fret = 1; fret <= fretCount; fret++) {
    const atFret: number[] = [];
    for (let s = 0; s < strings.length; s++) if (strings[s]!.fret === fret) atFret.push(s);

    if (atFret.length < 2) continue;

    let segmentStart = 0;
    for (let i = 0; i < atFret.length; i++) {
      const isLast = i === atFret.length - 1;
      const isBroken = !isLast && !canBarreCover(strings, atFret[i]!, atFret[i + 1]!, fret);

      if (isBroken || isLast) {
        const from = atFret[segmentStart]!;
        const to = atFret[i]!;
        if (to > from)
          out.push({
            fret: fret as BarreFret,
            fromString: from as StringIndex,
            toString: to as StringIndex,
            finger: 1,
          });

        segmentStart = i + 1;
      }
    }
  }

  barreCandidatesCache.set(cacheKey, out);
  return out;
};

/** 品位系值域收窄（0~12，截断取整）：变调夹品位 / 把位偏移共用，两者只是值域相同的两个概念 */
const toFretPositionValue = (value: number): number => clamp(Math.trunc(value), 0, 12);

/** 数值收窄：变调夹品位（0~12，截断取整） */
export const toCapo = (value: number): Capo => toFretPositionValue(value) as Capo;

/** 数值收窄：品位/把位偏移量（0~12，截断取整） */
export const toFretOffset = (value: number): FretOffset => toFretPositionValue(value) as FretOffset;

/** 数值收窄：琴弦索引（截断取整，非负） */
export const toStringIndex = (value: number, maxIndex: number = 9): StringIndex =>
  clamp(Math.trunc(value), 0, maxIndex) as StringIndex;

/** 值域守卫（整数 0~12，变调夹品位 / 把位偏移共用）：手写而非 zod——
 *  本文件在首屏可达链上（chordStore → chordRepository → coordinates），
 *  引 zod 会把整个校验库拖进首屏 chunk（vite.config 「zod 动态引入不进首屏」的注释即为此） */
const isFretPositionValue = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 12;

/** 值域校验：变调夹品位（清洗层用，用于区分"非法值"与"合法 0 品"） */
export const isCapoValue = (value: unknown): value is Capo => isFretPositionValue(value);

/** 值域校验：品位/把位偏移量（清洗层用，用于区分"非法值"与"合法 0 品"） */
export const isFretOffsetValue = (value: unknown): value is FretOffset => isFretPositionValue(value);

/** 判断两根同品弦之间的所有弦是否都能被横按食指覆盖（品位 >= fret 即可，更高品视为垫底，空弦/静音弦会切断） */
const canBarreCover = (strings: GuitarStringsModel, from: number, to: number, fret: number): boolean => {
  for (let s = from + 1; s < to; s++) {
    const f = strings[s]?.fret;
    if (f !== undefined && f < fret) return false;
  }
  return true;
};

/**
 * 判断横按在当前指板下是否仍然有效：
 * - 覆盖范围内存在品位 === barre.fret 的弦（横按有实际按压点，否则悬空无意义）；
 * - 覆盖范围内不存在品位 < fret 的弦（空弦/静音/更低品位会被食指误压或阻断连贯性）。
 */
export const isBarreStillValid = (strings: GuitarStringsModel, barre: BarreEntity): boolean => {
  // 1. 基础校验：横按至少需要跨越两根弦
  if (barre.fret <= 0 || barre.fromString >= barre.toString) return false;

  // 2. 严格边界校验：横按的两端（起始弦和终止弦）必须严格保留在该品位。
  // 只要两端任意一个音符被移走（移动到其他品位或静音），横按范围即被破坏，判定失效。
  const startFret = strings[barre.fromString]?.fret;
  const endFret = strings[barre.toString]?.fret;
  if (startFret !== barre.fret || endFret !== barre.fret) return false;

  let anchorCount = 0;
  for (let s = barre.fromString; s <= barre.toString; s++) {
    const f = strings[s]?.fret;
    if (f === undefined) return false;

    if (f === barre.fret) anchorCount++;
    else if (f < barre.fret) return false;
  }

  const isValid = anchorCount >= 2;

  return isValid;
};

/**
 * 单条横按手写校验（替代原 zod schema，语义逐条对齐）：
 * - fret/fromString/toString 必须是有限数值，先 Math.floor 截断（修复语义）再判定；
 * - 值域：fret >= 1、fromString >= 0、toString <= maxIndex、fromString <= toString，违反返回 null（整条拒绝）；
 * - finger 仅在 1~4 时保留，其余值（含非数字）只丢字段、不拒绝条目；
 * - 未知字段一律剥除（只取四字段）；
 * - 数组不是合法条目（与 z.object 行为一致）。
 * 出手写的理由同 isFretPositionValue：本文件首屏可达，schema 工厂 + safeParse 的构造与
 * 运行成本（另有按 maxIndex 的 Map 记忆化）都可省去。
 */
const parseBarreEntry = (raw: object, maxIndex: number): BarreEntity | null => {
  if (Array.isArray(raw)) return null;
  const { fret, fromString, toString, finger } = raw as Record<string, unknown>;
  if (typeof fret !== 'number' || !Number.isFinite(fret)) return null;
  if (typeof fromString !== 'number' || !Number.isFinite(fromString)) return null;
  if (typeof toString !== 'number' || !Number.isFinite(toString)) return null;
  const normalizedFret = Math.floor(fret);
  const normalizedFrom = Math.floor(fromString);
  const normalizedTo = Math.floor(toString);
  if (normalizedFret < 1 || normalizedFrom < 0 || normalizedTo > maxIndex || normalizedFrom > normalizedTo) return null;

  const item: BarreEntity = {
    fret: normalizedFret as BarreFret,
    fromString: normalizedFrom as StringIndex,
    toString: normalizedTo as StringIndex,
  };
  if (finger === 1 || finger === 2 || finger === 3 || finger === 4) item.finger = finger;
  return item;
};

/** 规范化显式横按列表：过滤非法条目（品格/弦序越界、from > to），返回 undefined 表示无有效横按 */
export const normalizeBarres = (barres: unknown, maxStrings: number = 10): BarreEntity[] | undefined => {
  if (!Array.isArray(barres)) return undefined;
  const maxIndex = Math.max(0, maxStrings - 1);
  const out: BarreEntity[] = [];
  for (const raw of barres) {
    if (!raw || typeof raw !== 'object') continue;
    const item = parseBarreEntry(raw, maxIndex);
    if (item) out.push(item);
  }
  return out.length > 0 ? out : undefined;
};

/**
 * 规范化并合并同一个和弦内的横按列表：
 * 1. 过滤物理无效横按（isBarreStillValid 校验）
 * 2. 吸收包含关系：同一个品位上，若大横按完全覆盖了小横按，小横按被合并吸收
 * 3. 连通合并：同一个品位上，若两个横按重叠或首尾相接且中间连通，合并为一个大横按
 */
export const normalizeAndMergeBarres = (
  barres: BarreEntity[] | undefined,
  strings: GuitarStringsModel
): BarreEntity[] | undefined => {
  if (!barres || barres.length === 0) return undefined;

  // 1. 基础有效性过滤
  const valid = barres.filter(b => isBarreStillValid(strings, b));
  if (valid.length === 0) return undefined;

  // 2. 按品位分组
  const byFret = new Map<number, BarreEntity[]>();
  for (const b of valid) {
    const list = byFret.get(b.fret) ?? [];
    list.push({ ...b });
    byFret.set(b.fret, list);
  }

  const result: BarreEntity[] = [];

  for (const [fret, list] of byFret.entries()) {
    // 起始弦升序，终止弦降序（跨度大的优先合并）
    list.sort((a, b) => a.fromString - b.fromString || b.toString - a.toString);

    const mergedForFret: BarreEntity[] = [];
    for (const item of list) {
      if (mergedForFret.length === 0) {
        mergedForFret.push(item);
        continue;
      }

      const prev = mergedForFret[mergedForFret.length - 1]!;

      // 若 prev 已完全覆盖 item（例如 prev 是 0..5，item 是 0..2 或 4..5）
      if (prev.fromString <= item.fromString && prev.toString >= item.toString) continue;

      // 若 item 与 prev 重叠或首尾相接，且两段之间可连通覆盖
      if (item.fromString <= prev.toString + 1 && canBarreCover(strings, prev.fromString, item.toString, fret))
        prev.toString = Math.max(prev.toString, item.toString) as StringIndex;
      else mergedForFret.push(item);
    }

    result.push(...mergedForFret);
  }

  return result.length > 0 ? result : undefined;
};

/** 两种口径各持一份 memo（横按数组按 store 既有约定不可变替换，引用即缓存键）：
 *  预览/导出链每行每侧都要拼横按签名，无 memo 时每次分配数组+排序+join。 */
const barresSignatureMemo = new WeakMap<readonly BarreEntity[], string>();
const barresSignatureWithFingerMemo = new WeakMap<readonly BarreEntity[], string>();

/**
 * 计算横按配置的轻量确定性签名（避免 JSON.stringify 性能开销）。
 * 唯一的横按签名实现——「重复/判等」与「渲染缓存键」共用此处，只是口径不同：
 * - 缺省（withFinger=false）：不含 finger，供渲染缓存键（scoreExportCanvas / ScorePreviewPane）——
 *   横按标指变化不改变图形，纳入只会让预览/导出缓存无谓失效；
 * - withFinger=true：含指序，供「重复和弦判定」（chordRepository 读库去重、areBarresEqual、
 *   useWorkbenchRouteSync 脏草稿守卫）——「同指法但横按标指不同」是两条不同的和弦，必须判不等。
 * 结果经 WeakMap memo（同引用直接命中），调用方无须自行缓存。
 * ⚠️ chordBarreLogic 的 isSame 是另一回事：编辑器「位置没变就保留原引用」的短路比较，
 * 刻意不含 finger，不属于本签名管辖。
 */
export const computeBarresSignature = (
  barres?: readonly BarreEntity[] | null,
  options?: { withFinger?: boolean }
): string => {
  if (!barres || barres.length === 0) return '';
  const withFinger = options?.withFinger ?? false;
  const memo = withFinger ? barresSignatureWithFingerMemo : barresSignatureMemo;
  const cached = memo.get(barres);
  if (cached !== undefined) return cached;
  const signature = barres
    .map(bar =>
      withFinger
        ? `${bar.fret}:${bar.fromString}-${bar.toString}:${bar.finger ?? ''}`
        : `${bar.fret}:${bar.fromString}-${bar.toString}`
    )
    .sort()
    .join(';');
  memo.set(barres, signature);
  return signature;
};

/**
 * 比较两组横按配置是否**语义**相等（含 finger 指序）。
 * 「同指法但横按标指不同」是两条不同的和弦——与 chordRepository 读库去重同口径，
 * 必须判为不等，否则跨组移入/导入去重会静默丢一条（D26）。
 */
export const areBarresEqual = (
  a: readonly BarreEntity[] | null | undefined,
  b: readonly BarreEntity[] | null | undefined
): boolean => {
  const lenA = a?.length ?? 0;
  const lenB = b?.length ?? 0;
  if (lenA !== lenB) return false;
  if (lenA === 0) return true;
  return computeBarresSignature(a, { withFinger: true }) === computeBarresSignature(b, { withFinger: true });
};

// ===== fretboardVisuals: 指板视觉样式 =====
// 圆点/空弦配色已迁移至 tokens.scss 的 --fb-* CSS 变量（FretboardNote 直接消费 var()），
// 本模型不再持有颜色字面量，保持纯几何职责。
