import type {
  BarreEntity,
  BarreFret,
  Capo,
  Chord,
  ChordId,
  GuitarStringEntity,
  GuitarStringsModel,
  SlotKey,
  StringIndex,
} from '@/types';
import { CANVAS_CONFIG, FRETBOARD_COLORS, FRETBOARD_SCALE_MAP } from '@/utils/core/constants';
import { Tuning, isMuted, isOpen, nameToSegments } from '@/utils/music/musicTheory';
import { charKey, chordSlotKey, collectEdgeChordIds, edgeSlotPrefix } from '@/utils/score/scoreModel';
import { createLruCache } from '../core/lruCache';

const barreCandidatesCache = createLruCache<BarreEntity[]>(64);

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
    for (let s = 0; s < 6; s++) {
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
          // from/to 来自弦索引循环（0~5），值域由构造保证；fret 来自 1..fretCount 循环，恒 >= 1
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
export const toCapo = (value: number): Capo => Math.min(12, Math.max(0, Math.trunc(value))) as Capo;

/** 数值收窄：琴弦索引（0~5，截断取整） */
export const toStringIndex = (value: number): StringIndex => Math.min(5, Math.max(0, Math.trunc(value))) as StringIndex;

/** 值域校验：变调夹品位（清洗层用，用于区分"非法值"与"合法 0 品"） */
export const isCapoValue = (value: unknown): value is Capo =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 12;

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

/** 规范化显式横按列表：过滤非法条目（品格/弦序越界、from > to），返回 undefined 表示无有效横按 */
const normalizeBarres = (barres: unknown): BarreEntity[] | undefined => {
  if (!Array.isArray(barres)) return undefined;
  const out: BarreEntity[] = [];
  for (const raw of barres) {
    if (!raw || typeof raw !== 'object') continue;
    const b = raw as Partial<BarreEntity>;
    const fret = typeof b.fret === 'number' && Number.isFinite(b.fret) ? Math.floor(b.fret) : NaN;
    const fromString =
      typeof b.fromString === 'number' && Number.isFinite(b.fromString) ? Math.floor(b.fromString) : NaN;
    const toString = typeof b.toString === 'number' && Number.isFinite(b.toString) ? Math.floor(b.toString) : NaN;
    if (fret < 1 || fromString < 0 || toString > 5 || fromString > toString) continue;
    // 上一行已完成 0~5 值域校验，此处收窄为 StringIndex；fret 已通过 >= 1 校验收窄为 BarreFret
    const item: BarreEntity = {
      fret: fret as BarreFret,
      fromString: fromString as StringIndex,
      toString: toString as StringIndex,
    };
    if (b.finger === 1 || b.finger === 2 || b.finger === 3 || b.finger === 4) item.finger = b.finger;
    out.push(item);
  }
  return out.length > 0 ? out : undefined;
};

// ===== chordMap: 和弦槽位映射与和弦数据归一化 =====

export interface ParsedSlotKey {
  lineId: string;
  type: 'char' | 'start' | 'end';
  index: number;
}
export function parseSlotKey(slotKey: string): ParsedSlotKey | null {
  const str = String(slotKey);
  const match = str.match(/^line_(.+?)_(char|start|end)_(\d+)$/);
  if (!match) return null;
  return {
    lineId: match[1] ?? '',
    type: (match[2] ?? 'char') as 'char' | 'start' | 'end',
    index: parseInt(match[3] ?? '0', 10),
  };
}
export function getEdgeChords(
  chordMap: ReadonlyMap<SlotKey, ChordId>,
  lineId: string,
  type: 'start' | 'end'
): ChordId[] {
  // key/value 在 Song.chordMap 中已品牌化，此处仅按前缀过滤排序
  return collectEdgeChordIds(chordMap, lineId, type) as ChordId[];
}
export function setEdgeChords(
  chordMap: Map<SlotKey, ChordId>,
  lineId: string,
  type: 'start' | 'end',
  chordIds: ChordId[]
): void {
  const prefix = edgeSlotPrefix(lineId, type);
  for (const key of [...chordMap.keys()]) {
    if (key.startsWith(prefix)) {
      chordMap.delete(key);
    }
  }
  chordIds.forEach((chordId, idx) => {
    chordMap.set(chordSlotKey(lineId, type, idx), chordId);
  });
}
export function removeChordFromSlot(chordMap: Map<SlotKey, ChordId>, slotKey: SlotKey): ChordId | null {
  const parsed = parseSlotKey(slotKey);
  if (!parsed) {
    const removed = chordMap.get(slotKey) ?? null;
    chordMap.delete(slotKey);
    return removed;
  }
  const { lineId, type, index } = parsed;
  if (type === 'char') {
    const removed = chordMap.get(slotKey) ?? null;
    chordMap.delete(slotKey);
    return removed;
  } else {
    const list = getEdgeChords(chordMap, lineId, type);
    if (index < 0 || index >= list.length) return null;
    const [removed] = list.splice(index, 1);
    setEdgeChords(chordMap, lineId, type, list);
    return removed ?? null;
  }
}
export function bindNewChordToSlot(chordMap: Map<SlotKey, ChordId>, slotKey: SlotKey, chordId: ChordId): void {
  const parsed = parseSlotKey(slotKey);
  if (!parsed || parsed.type === 'char') {
    chordMap.set(slotKey, chordId);
    return;
  }
  const { lineId, type, index } = parsed;
  const list = getEdgeChords(chordMap, lineId, type);
  if (index >= list.length) {
    if (type === 'start') list.unshift(chordId);
    else list.push(chordId);
  } else list[index] = chordId;
  setEdgeChords(chordMap, lineId, type, list);
}
export function swapOrMoveSlotChords(chordMap: Map<SlotKey, ChordId>, sourceKey: SlotKey, targetKey: SlotKey): void {
  if (sourceKey === targetKey) return;
  const sourceParsed = parseSlotKey(sourceKey);
  const targetParsed = parseSlotKey(targetKey);
  if (!sourceParsed || !targetParsed) {
    return;
  }
  if (
    sourceParsed.lineId === targetParsed.lineId &&
    sourceParsed.type === targetParsed.type &&
    sourceParsed.type !== 'char'
  ) {
    const list = getEdgeChords(chordMap, sourceParsed.lineId, sourceParsed.type);
    const srcIdx = sourceParsed.index;
    const tgtIdx = targetParsed.index;
    if (srcIdx >= 0 && srcIdx < list.length) {
      const originalLength = list.length;
      const isTargetAddButton = tgtIdx >= originalLength;
      const [movedChordId] = list.splice(srcIdx, 1);
      if (movedChordId === undefined) return;
      let insertIdx: number;
      if (isTargetAddButton) {
        // 当拖拽到行首的“添加”按钮（最左侧占位符）时插入到最左侧（0），行尾插入到末尾
        insertIdx = sourceParsed.type === 'start' ? 0 : list.length;
      } else {
        insertIdx = Math.min(Math.max(0, tgtIdx), list.length);
      }
      list.splice(insertIdx, 0, movedChordId);
      setEdgeChords(chordMap, sourceParsed.lineId, sourceParsed.type, list);
    }
    return;
  }
  const peekChordId = (parsed: ParsedSlotKey): ChordId | null => {
    if (parsed.type === 'char') return chordMap.get(charKey(parsed.lineId, parsed.index)) ?? null;
    const list = getEdgeChords(chordMap, parsed.lineId, parsed.type);
    return list[parsed.index] || null;
  };
  const sourceChordId = peekChordId(sourceParsed);
  if (!sourceChordId) return;
  const targetChordId = peekChordId(targetParsed);

  // 2. 两处都有和弦：纯 SWAP（原地互换位置内容，绝不缩减或打乱边和弦列表顺序）
  if (targetChordId) {
    const setSlotChordDirect = (parsed: ParsedSlotKey, chordId: ChordId) => {
      if (parsed.type === 'char') {
        chordMap.set(charKey(parsed.lineId, parsed.index), chordId);
      } else {
        const list = getEdgeChords(chordMap, parsed.lineId, parsed.type);
        if (parsed.index < list.length) {
          list[parsed.index] = chordId;
        } else {
          list.push(chordId);
        }
        setEdgeChords(chordMap, parsed.lineId, parsed.type, list);
      }
    };

    setSlotChordDirect(sourceParsed, targetChordId);
    setSlotChordDirect(targetParsed, sourceChordId);
    return;
  }

  // 3. 目标槽位为空：MOVE（从源槽位移出，并插入到目标槽位）
  removeChordFromSlot(chordMap, sourceKey);
  insertChordAtParsedLocation(chordMap, targetParsed, sourceChordId);
}
function insertChordAtParsedLocation(chordMap: Map<SlotKey, ChordId>, parsed: ParsedSlotKey, chordId: ChordId): void {
  if (parsed.type === 'char') {
    chordMap.set(charKey(parsed.lineId, parsed.index), chordId);
  } else {
    const list = getEdgeChords(chordMap, parsed.lineId, parsed.type);
    let insertIdx: number;
    if (parsed.index >= list.length) {
      // 当目标是行首“添加”按钮（最左侧占位符）时插入到最左侧（0），行尾插入到末尾
      insertIdx = parsed.type === 'start' ? 0 : list.length;
    } else {
      insertIdx = Math.min(Math.max(0, parsed.index), list.length);
    }
    list.splice(insertIdx, 0, chordId);
    setEdgeChords(chordMap, parsed.lineId, parsed.type, list);
  }
}
export const garbageCollectChordMap = (
  chordMap: Map<SlotKey, ChordId>,
  finalLineIds: string[]
): { map: Map<SlotKey, ChordId>; changed: boolean } => {
  const finalIdsSet = new Set(finalLineIds);
  const updatedMap = new Map(chordMap);
  let changed = false;
  for (const key of updatedMap.keys()) {
    const parsed = parseSlotKey(key);
    if (parsed && !finalIdsSet.has(parsed.lineId)) {
      updatedMap.delete(key);
      changed = true;
    }
  }
  return { map: updatedMap, changed };
};

/** 清理 chordMap 中指向不存在和弦 id 的孤儿引用（导入校验 / 删除和弦后使用） */
export const pruneOrphanChordRefs = (
  chordMap: Map<SlotKey, ChordId>,
  validChordIds: Set<string>,
  options?: { preserveUnknown?: boolean }
): { map: Map<SlotKey, ChordId>; changed: boolean } => {
  const updatedMap = new Map(chordMap);
  let changed = false;
  for (const [key, id] of updatedMap) {
    if (id !== undefined && !validChordIds.has(id) && !(options?.preserveUnknown && validChordIds.size === 0)) {
      updatedMap.delete(key);
      changed = true;
    }
  }
  return { map: updatedMap, changed };
};

// ===== 序列化边界：内存统一用 Map，JSON/持久化用普通对象 =====

/** Map -> 普通对象（localStorage / 备份 / 同步序列化用） */
export const chordMapToPlain = (chordMap: ReadonlyMap<SlotKey, ChordId>): Record<string, string> =>
  Object.fromEntries(chordMap);

/** 普通对象 -> Map（读取 localStorage / 导入备份 / 同步拉取用），容忍非法条目；
 *  key/value 已通过 string 类型过滤，品牌收窄信任该过滤 */
export const plainToChordMap = (raw: unknown): Map<SlotKey, ChordId> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return new Map();
  return new Map(
    Object.entries(raw as Record<string, unknown>)
      .filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === 'string' && entry[0].length > 0 && typeof entry[1] === 'string' && entry[1].length > 0
      )
      .map(([k, v]) => [k as SlotKey, v as ChordId])
  );
};

export const normalizeChord = (chord: Chord): { chord: Chord; changed: boolean } => {
  const capo = chord.capo ?? 0;
  const tuning = chord.tuning || Tuning.STANDARD;
  const fretCount = chord.fretCount ?? 3;

  // 迁移：strings 由旧对象数组 [{fret, preferFlat}] 升级为二维数组 [[fret, preferFlat]]
  // 注意：fret 合法值是 -1/0/正整数，不能用 `|| -1` 兜底（0 是空弦，会被误判为 -1 静音）
  let stringsMigrated = false;
  const strings = (chord.strings as unknown[]).map(s => {
    if (Array.isArray(s)) {
      return [typeof s[0] === 'number' && Number.isFinite(s[0]) ? s[0] : -1, Boolean(s[1])] as GuitarStringEntity;
    }
    stringsMigrated = true;
    const legacy = s as { fret?: number; preferFlat?: boolean; isRoot?: boolean };
    return [typeof legacy?.fret === 'number' ? legacy.fret : -1, !!legacy?.preferFlat] as GuitarStringEntity;
  }) as GuitarStringsModel;

  // 迁移：旧数据每根弦各自维护 isRoot，统一为单点 rootStringIndex
  let rootStringIndex = (chord.rootStringIndex ?? null) as StringIndex | null;
  const legacyRoots = (chord.strings as unknown[])
    .map((s, idx) => ((s as { isRoot?: boolean }).isRoot ? idx : -1))
    .filter(idx => idx >= 0);
  if (rootStringIndex === null && legacyRoots.length > 0) {
    // legacyRoots 是弦索引数组（0~5），取首个后收窄
    rootStringIndex = (legacyRoots[0] ?? null) as StringIndex | null;
  }
  // 校验：rootStringIndex 必须落在有效且已按音的弦上，否则清空
  if (
    rootStringIndex !== null &&
    (rootStringIndex < 0 ||
      rootStringIndex >= strings.length ||
      strings[rootStringIndex]?.[0] === undefined ||
      strings[rootStringIndex]![0] < 0)
  ) {
    rootStringIndex = null;
  }

  // 清理旧字段：和弦级 isInverted / fingerprint / chordName（现已由 nameSegments 替代）
  const legacyChord = chord as unknown as { isInverted?: boolean; fingerprint?: string; chordName?: string };
  let fieldsCleaned = false;
  if ('isInverted' in legacyChord || 'fingerprint' in legacyChord || 'chordName' in legacyChord) {
    fieldsCleaned = true;
    delete legacyChord.isInverted;
    delete legacyChord.fingerprint;
  }

  // 横按规范化：过滤非法条目与物理非法项；未变化时不触发迁移
  const rawBarres = normalizeBarres(chord.barres);
  const validBarres = rawBarres?.filter(b => isBarreStillValid(strings, b));
  const finalBarres = validBarres && validBarres.length > 0 ? validBarres : undefined;

  const barresChanged = JSON.stringify(chord.barres ?? undefined) !== JSON.stringify(finalBarres);

  let nameSegments = chord.nameSegments;
  let nameMigrated = false;
  if (nameSegments === undefined) {
    nameMigrated = true;
    const rawName = legacyChord.chordName?.trim() || '';
    nameSegments = rawName ? (nameToSegments(rawName) ?? null) : null;
  }
  delete legacyChord.chordName;

  const changed =
    stringsMigrated ||
    nameMigrated ||
    chord.capo !== capo ||
    chord.tuning !== tuning ||
    chord.fretCount !== fretCount ||
    chord.rootStringIndex !== rootStringIndex ||
    fieldsCleaned ||
    barresChanged;
  if (!changed) return { chord, changed: false };
  return {
    chord: {
      ...chord,
      nameSegments,
      capo,
      tuning,
      fretCount,
      rootStringIndex,
      strings,
      ...(finalBarres !== undefined ? { barres: finalBarres } : {}),
    },
    changed: true,
  };
};

// ===== fretboardVisuals: 指板视觉样式 =====

export const getOpenStringStatusClass = (str: GuitarStringEntity, isRoot: boolean): string => {
  if (isMuted(str)) return 'is-muted-status';
  if (isOpen(str) && !isRoot) return 'is-open-status';
  return '';
};

export const getOpenStringStyle = (str: GuitarStringEntity, isRoot: boolean, isDarkMode: boolean) => {
  if (isOpen(str) && isRoot) {
    const bg = isDarkMode ? FRETBOARD_COLORS.openRootBgDark : FRETBOARD_COLORS.openRootBgLight;
    return {
      backgroundColor: bg,
      borderColor: bg,
      color: isDarkMode ? FRETBOARD_COLORS.openRootTextDark : FRETBOARD_COLORS.openRootTextLight,
      boxShadow: 'var(--root-glow)',
    };
  }
  return {};
};

export const getFingerColor = (isRoot: boolean, isDarkMode: boolean): string => {
  if (isRoot) return isDarkMode ? FRETBOARD_COLORS.rootDark : FRETBOARD_COLORS.rootLight;
  return isDarkMode ? FRETBOARD_COLORS.normalDark : FRETBOARD_COLORS.normalLight;
};

export const getFingerTextColor = (isRoot: boolean, isDarkMode: boolean): string => {
  return isRoot && isDarkMode ? FRETBOARD_COLORS.textRootDark : FRETBOARD_COLORS.textRootLight;
};

const placeholderSizeCache = createLruCache<{ width: string; height: string }>(32);

export const getPlaceholderSize = (
  fretCount: number,
  customScale = 1.0,
  showChordName = true,
  showOpenStrings = true
) => {
  const scaleKey = Math.round(customScale * 1000);
  const cacheKey = `${fretCount}_${scaleKey}_${showChordName ? 1 : 0}_${showOpenStrings ? 1 : 0}`;

  const cached = placeholderSizeCache.get(cacheKey);
  if (cached) return cached;

  const topOffset =
    (showChordName ? CANVAS_CONFIG.CHORD_NAME_ZONE_HEIGHT : 0) + (showOpenStrings ? CANVAS_CONFIG.OFFSET_Y_TOP : 16);
  const rawHeight = topOffset + fretCount * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.OFFSET_Y_BOTTOM;
  const fretboardScale = (FRETBOARD_SCALE_MAP[fretCount] ?? 1.0) * customScale;

  const size = {
    width: `${CANVAS_CONFIG.BOARD_WIDTH * fretboardScale}px`,
    height: `${rawHeight * fretboardScale}px`,
  };

  placeholderSizeCache.set(cacheKey, size);
  return size;
};
