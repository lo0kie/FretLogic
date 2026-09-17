import { z } from 'zod';

import { clamp, estimateValueBytes } from '@/platform/utils/common';
import { createLruCache } from '@/platform/utils/lruCache';

import type { BarreEntity, BarreFret, Capo, FretOffset, GuitarStringsModel, StringIndex } from '../types';

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
  const cacheKey = `${strings.map(s => s[0]).join(',')}_${fretCount}`;
  const cached = barreCandidatesCache.get(cacheKey);
  if (cached) return cached;

  const out: BarreEntity[] = [];
  for (let fret = 1; fret <= fretCount; fret++) {
    const atFret: number[] = [];
    for (let s = 0; s < strings.length; s++) {
      if (strings[s]![0] === fret) atFret.push(s);
    }
    if (atFret.length < 2) continue;

    let segmentStart = 0;
    for (let i = 0; i < atFret.length; i++) {
      const isLast = i === atFret.length - 1;
      const isBroken = !isLast && !canBarreCover(strings, atFret[i]!, atFret[i + 1]!, fret);

      if (isBroken || isLast) {
        const from = atFret[segmentStart]!;
        const to = atFret[i]!;
        if (to > from) {
          out.push({
            fret: fret as BarreFret,
            fromString: from as StringIndex,
            toString: to as StringIndex,
            finger: 1,
          });
        }
        segmentStart = i + 1;
      }
    }
  }

  barreCandidatesCache.set(cacheKey, out);
  return out;
};

/** 数值收窄：变调夹品位（0~12，截断取整） */
export const toCapo = (value: number): Capo => clamp(Math.trunc(value), 0, 12) as Capo;

/** 数值收窄：品位/把位偏移量（0~12，截断取整） */
export const toFretOffset = (value: number): FretOffset => clamp(Math.trunc(value), 0, 12) as FretOffset;

/** 数值收窄：琴弦索引（截断取整，非负） */
export const toStringIndex = (value: number, maxIndex: number = 9): StringIndex =>
  clamp(Math.trunc(value), 0, maxIndex) as StringIndex;

/** 品位位置公共值域 schema（变调夹品位 / 把位偏移共用）：整数 0~12 */
const fretPositionSchema = z.number().int().min(0).max(12);

/** 值域校验：变调夹品位（清洗层用，用于区分"非法值"与"合法 0 品"） */
export const isCapoValue = (value: unknown): value is Capo => fretPositionSchema.safeParse(value).success;

/** 值域校验：品位/把位偏移量（清洗层用，用于区分"非法值"与"合法 0 品"） */
export const isFretOffsetValue = (value: unknown): value is FretOffset => fretPositionSchema.safeParse(value).success;

/** 判断两根同品弦之间的所有弦是否都能被横按食指覆盖（品位 >= fret 即可，更高品视为垫底，空弦/静音弦会切断） */
const canBarreCover = (strings: GuitarStringsModel, from: number, to: number, fret: number): boolean => {
  for (let s = from + 1; s < to; s++) {
    const f = strings[s]?.[0];
    if (f !== undefined && f < fret) {
      return false;
    }
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
  if (barre.fret <= 0 || barre.fromString >= barre.toString) {
    return false;
  }

  // 2. 严格边界校验：横按的两端（起始弦和终止弦）必须严格保留在该品位。
  // 只要两端任意一个音符被移走（移动到其他品位或静音），横按范围即被破坏，判定失效。
  const startFret = strings[barre.fromString]?.[0];
  const endFret = strings[barre.toString]?.[0];
  if (startFret !== barre.fret || endFret !== barre.fret) {
    return false;
  }

  let anchorCount = 0;
  for (let s = barre.fromString; s <= barre.toString; s++) {
    const f = strings[s]?.[0];
    if (f === undefined) {
      return false;
    }

    if (f === barre.fret) {
      anchorCount++;
    } else if (f < barre.fret) {
      return false;
    }
  }

  const isValid = anchorCount >= 2;

  return isValid;
};

/**
 * 横按条目 schema（工厂式注入运行时上限 maxIndex）。
 * 语义与旧手写校验逐条对齐：
 * - fret/fromString/toString 必须是有限数值，先 Math.floor 截断（修复语义）再判定；
 * - 值域：fret >= 1、fromString >= 0、toString <= maxIndex、fromString <= toString，违反即整条拒绝；
 * - finger 仅在 1~4 时保留，其余值（含非数字）只丢字段、不拒绝条目；
 * - 未知字段一律剥除（z.object 默认行为）。
 */
const makeBarreEntrySchema = (maxIndex: number) =>
  z
    .object({
      fret: z.number().finite(),
      fromString: z.number().finite(),
      toString: z.number().finite(),
      finger: z.unknown(),
    })
    .transform(b => ({
      fret: Math.floor(b.fret),
      fromString: Math.floor(b.fromString),
      toString: Math.floor(b.toString),
      finger: (b.finger === 1 || b.finger === 2 || b.finger === 3 || b.finger === 4 ? b.finger : undefined) as
        1 | 2 | 3 | 4 | undefined,
    }))
    .refine(b => b.fret >= 1 && b.fromString >= 0 && b.toString <= maxIndex && b.fromString <= b.toString);

/**
 * schema 按 maxIndex 记忆化：schema 构造（object→transform→refine 链）远贵于 safeParse 本身，
 * normalizeBarres 在大规模数据清洗（如 1000 条和弦基准）中逐条调用，若每次重建 schema
 * 会使构造开销放大千倍。实际取值只有各弦数（4~7）对应的少数几种，Map 缓存命中即免构造。
 */
const barreEntrySchemaCache = new Map<number, ReturnType<typeof makeBarreEntrySchema>>();
const getBarreEntrySchema = (maxIndex: number): ReturnType<typeof makeBarreEntrySchema> => {
  let schema = barreEntrySchemaCache.get(maxIndex);
  if (!schema) {
    schema = makeBarreEntrySchema(maxIndex);
    barreEntrySchemaCache.set(maxIndex, schema);
  }
  return schema;
};

/** 规范化显式横按列表：过滤非法条目（品格/弦序越界、from > to），返回 undefined 表示无有效横按 */
export const normalizeBarres = (barres: unknown, maxStrings: number = 10): BarreEntity[] | undefined => {
  if (!Array.isArray(barres)) return undefined;
  const maxIndex = Math.max(0, maxStrings - 1);
  const entrySchema = getBarreEntrySchema(maxIndex);
  const out: BarreEntity[] = [];
  for (const raw of barres) {
    if (!raw || typeof raw !== 'object') continue;
    const result = entrySchema.safeParse(raw);
    if (!result.success) continue;
    const { fret, fromString, toString, finger } = result.data;
    // 值域已由 schema refine 收窄，此处断言为品牌化索引/品位类型
    const item: BarreEntity = {
      fret: fret as BarreFret,
      fromString: fromString as StringIndex,
      toString: toString as StringIndex,
    };
    if (finger !== undefined) item.finger = finger;
    out.push(item);
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
      if (prev.fromString <= item.fromString && prev.toString >= item.toString) {
        continue;
      }

      // 若 item 与 prev 重叠或首尾相接，且两段之间可连通覆盖
      if (item.fromString <= prev.toString + 1 && canBarreCover(strings, prev.fromString, item.toString, fret)) {
        prev.toString = Math.max(prev.toString, item.toString) as StringIndex;
      } else {
        mergedForFret.push(item);
      }
    }

    result.push(...mergedForFret);
  }

  return result.length > 0 ? result : undefined;
};

/** 计算横按配置的轻量确定性签名（用于快速比对与缓存键生成，避免 JSON.stringify 性能开销） */
export const computeBarresSignature = (barres?: readonly BarreEntity[] | null): string => {
  if (!barres || barres.length === 0) return '';
  return barres
    .map(b => `${b.fret}:${b.fromString}-${b.toString}`)
    .sort()
    .join(';');
};

/** 比较两组横按配置是否语义相等（轻量指纹对比，避免全量 JSON.stringify） */
export const areBarresEqual = (
  a: readonly BarreEntity[] | null | undefined,
  b: readonly BarreEntity[] | null | undefined
): boolean => {
  const lenA = a?.length ?? 0;
  const lenB = b?.length ?? 0;
  if (lenA !== lenB) return false;
  if (lenA === 0) return true;
  return computeBarresSignature(a) === computeBarresSignature(b);
};

// ===== fretboardVisuals: 指板视觉样式 =====
// 圆点/空弦配色已迁移至 tokens.scss 的 --fb-* CSS 变量（FretboardNote 直接消费 var()），
// 本模型不再持有颜色字面量，保持纯几何职责。
