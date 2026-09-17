/**
 * 和弦槽位映射（chordMap）：谱面槽位键的解析、读写、垃圾回收与序列化边界。
 * 由 utils/music/chord-fretboard.ts 拆分迁入——槽位域属乐谱（score），与 scoreModel 同居一处。
 */
import { clamp } from '@/platform/utils/common';

import {
  buildCharIndexRemap,
  charKey,
  chordSlotKey,
  collectEdgeChordIds,
  edgeSlotPrefix,
  parseSlotKey,
} from './scoreModel.ts';

import type { ParsedSlotKey } from './scoreModel.ts';
import type { Chord, ChordId } from '@/domains/chord/types';
import type { LineId, SlotKey, Song } from '@/domains/score/types';

// 槽位键的解析实现与构造器同处 scoreModel（唯一真相源），此处仅转出以保持既有引用路径可用。
export { parseSlotKey };
export type { ParsedSlotKey };

export function getEdgeChords(
  chordMap: ReadonlyMap<SlotKey, ChordId>,
  lineId: string,
  type: 'start' | 'end'
): ChordId[] {
  // key/value 在 Song.chordMap 中已品牌化，此处仅按前缀过滤排序
  return collectEdgeChordIds(chordMap, lineId, type) as ChordId[];
}
/** 重写某行行首/行尾的和弦列表：先删除旧前缀全部槽位，再按新列表依次写入。 */
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
/** 从槽位移除和弦：字符槽位直接删除；边和弦槽位从列表中摘除并回写，返回被移除的 id。 */
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
/** 向槽位绑定新和弦：字符槽位直接覆盖；边和弦槽位按索引覆盖/追加（行尾扩展、行首前插）。 */
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

/**
 * 将边和弦目标索引解析为实际插入位置：
 * - 索引有效（< 当前列表长度）→ clamp 后直接使用
 * - 索引越界（占位符/添加按钮）→ 行首（start）插在第 0 位，行尾（end）追加到末位
 */
function resolveEdgeInsertIndex(index: number, listLength: number, type: 'start' | 'end'): number {
  if (index >= listLength) return type === 'start' ? 0 : listLength;
  return clamp(index, 0, listLength);
}

/** 交换或移动两个槽位的和弦：同行同类边槽位内做插入式重排；跨槽位时两处有值则互换，目标为空则移动。 */
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
      const [movedChordId] = list.splice(srcIdx, 1);
      if (movedChordId === undefined) return;
      // 拖到"添加"占位符（tgtIdx >= originalLength）或正常位置均走统一解析
      const insertIdx = resolveEdgeInsertIndex(tgtIdx, list.length, sourceParsed.type);
      list.splice(insertIdx, 0, movedChordId);
      setEdgeChords(chordMap, sourceParsed.lineId, sourceParsed.type, list);
    }
    return;
  }
  /** 只读探测某结构化槽位当前绑定的和弦 id；空槽位返回 null。 */
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
    /** 直接写入某结构化槽位的和弦 id，不触碰其他槽位（互换两槽位内容用）。 */
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
/** 向结构化槽位插入和弦：字符槽位直接写入；边和弦槽位按索引插入（占位符目标视为首/末位）。 */
function insertChordAtParsedLocation(chordMap: Map<SlotKey, ChordId>, parsed: ParsedSlotKey, chordId: ChordId): void {
  if (parsed.type === 'char') {
    chordMap.set(charKey(parsed.lineId, parsed.index), chordId);
  } else {
    const list = getEdgeChords(chordMap, parsed.lineId, parsed.type);
    const insertIdx = resolveEdgeInsertIndex(parsed.index, list.length, parsed.type);
    list.splice(insertIdx, 0, chordId);
    setEdgeChords(chordMap, parsed.lineId, parsed.type, list);
  }
}
/**
 * 歌词编辑后的 chordMap 垃圾回收：
 * 1. 删除属于已不存在行的槽位键；
 * 2. 传入 finalLineLengths 时，一并删除下标越界的字符槽位（行尾删字后遗留的 line_x_char_9 之类）。
 *    这类槽位 UI 渲染不到（逐行按当前字符数渲染），却会经 extractSongChordSequence 进入文本导出，
 *    是真实的数据外泄；而载入期清洗只按 chordId 清孤儿引用、不校验下标，不会自愈，故在此收口。
 *
 * @param finalLineLengths 与 finalLineIds 一一对应的行字符数；缺省则不做越界检查（保持原行为）
 */
export const garbageCollectChordMap = (
  chordMap: Map<SlotKey, ChordId>,
  finalLineIds: string[],
  finalLineLengths?: readonly number[]
): { map: Map<SlotKey, ChordId>; changed: boolean } => {
  const finalIdsSet = new Set(finalLineIds);
  const lineLengthById = new Map<string, number>();
  finalLineIds.forEach((id, idx) => {
    const len = finalLineLengths?.[idx];
    if (len !== undefined) lineLengthById.set(id, len);
  });

  const updatedMap = new Map(chordMap);
  let changed = false;
  for (const key of updatedMap.keys()) {
    const parsed = parseSlotKey(key);
    if (!parsed) continue;
    if (!finalIdsSet.has(parsed.lineId)) {
      updatedMap.delete(key);
      changed = true;
      continue;
    }
    // 只有字符槽位受行长约束；边和弦是行级密列表，行长变化不改变其合法性
    if (parsed.type !== 'char') continue;
    const lineLength = lineLengthById.get(parsed.lineId);
    if (lineLength !== undefined && parsed.index >= lineLength) {
      updatedMap.delete(key);
      changed = true;
    }
  }
  return { map: updatedMap, changed };
};

/**
 * 歌词被编辑后平移存活行的字符槽位下标（与 matchLineIds 配套使用）。
 *
 * 只在「同一 lineId 同时出现在旧行序与新行序」时平移：lineId 保住即说明该行是被局部编辑的同一条，
 * 按 buildCharIndexRemap 对齐下标；无对应位置的下标（-1）丢弃。行级新增/删除不在两侧交集内，
 * 交给 garbageCollectChordMap 处理。
 *
 * 边和弦槽位原样保留：它们是行级密列表，不随字符位置移动。
 */
export const shiftCharSlotsForEditedLines = (
  chordMap: Map<SlotKey, ChordId>,
  oldLines: readonly string[],
  newLines: readonly string[],
  oldLineIds: readonly LineId[],
  newLineIds: readonly LineId[]
): { map: Map<SlotKey, ChordId>; changed: boolean } => {
  const oldIndexByLineId = new Map<string, number>();
  oldLineIds.forEach((id, idx) => {
    if (!oldIndexByLineId.has(id)) oldIndexByLineId.set(id, idx);
  });
  const newIndexByLineId = new Map<string, number>();
  newLineIds.forEach((id, idx) => {
    if (!newIndexByLineId.has(id)) newIndexByLineId.set(id, idx);
  });

  const remapByLineId = new Map<string, number[]>();
  for (const [lineId, oldIdx] of oldIndexByLineId) {
    const newIdx = newIndexByLineId.get(lineId);
    if (newIdx === undefined) continue;
    const oldLine = oldLines[oldIdx];
    const newLine = newLines[newIdx];
    if (oldLine === undefined || newLine === undefined) continue;
    remapByLineId.set(lineId, buildCharIndexRemap(oldLine, newLine));
  }
  if (remapByLineId.size === 0) return { map: chordMap, changed: false };

  const updatedMap = new Map(chordMap);
  let changed = false;
  for (const [key, chordId] of chordMap) {
    const parsed = parseSlotKey(key);
    if (!parsed || parsed.type !== 'char') continue;
    const remap = remapByLineId.get(parsed.lineId);
    if (!remap || parsed.index >= remap.length) continue;
    const nextIndex = remap[parsed.index];
    if (nextIndex === undefined || nextIndex < 0 || nextIndex === parsed.index) continue;
    updatedMap.delete(key);
    updatedMap.set(charKey(parsed.lineId, nextIndex), chordId);
    changed = true;
  }
  return changed ? { map: updatedMap, changed: true } : { map: chordMap, changed: false };
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

/** 普通对象 -> Map（读取持久化数据 / 导入备份 / 同步拉取用），容忍非法条目；
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

export interface ScoreChordStep {
  slotKey: SlotKey;
  chordId: ChordId;
  chord: Chord;
  lineId: string;
  type: 'start' | 'char' | 'end';
  index: number;
}

/**
 * 提取乐谱内按自然乐理阅读次序（行序 -> 行首和弦 -> 字符槽位和弦 -> 行尾和弦）排列的和弦时间序列
 */
export const extractSongChordSequence = (
  song: Song,
  chordResolver: (id: ChordId) => Chord | undefined
): ScoreChordStep[] => {
  if (!song || !song.chordMap || song.chordMap.size === 0) return [];

  const lineIndexMap = new Map<string, number>();
  (song.lineIds ?? []).forEach((id, idx) => lineIndexMap.set(id, idx));

  const typePriority: Record<'start' | 'char' | 'end', number> = {
    start: 0,
    char: 1,
    end: 2,
  };

  const steps: ScoreChordStep[] = [];

  for (const [slotKey, chordId] of song.chordMap) {
    if (!chordId) continue;
    const parsed = parseSlotKey(slotKey);
    if (!parsed) continue;

    const chord = chordResolver(chordId);
    if (!chord) continue;

    steps.push({
      slotKey,
      chordId,
      chord,
      lineId: parsed.lineId,
      type: parsed.type,
      index: parsed.index,
    });
  }

  // 按阅读时间排序
  steps.sort((a, b) => {
    const lineA = lineIndexMap.get(a.lineId) ?? 9999;
    const lineB = lineIndexMap.get(b.lineId) ?? 9999;
    if (lineA !== lineB) return lineA - lineB;

    const typeA = typePriority[a.type] ?? 1;
    const typeB = typePriority[b.type] ?? 1;
    if (typeA !== typeB) return typeA - typeB;

    return a.index - b.index;
  });

  return steps;
};
