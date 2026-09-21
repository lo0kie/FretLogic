/**
 * 和弦槽位映射（chordMap）：谱面槽位键的解析、读写、垃圾回收与序列化边界。
 * v7 起 chordMap 为按行分组的嵌套结构（Map<LineId, ChordLineSlots>），
 * 本模块所有读写一律经由 scoreModel 的嵌套访问器（lineSlots / lineEdgeChords / lineCharChord 等）；
 * 槽位 key（line_{lineId}_{char|start|end}_{index}）仅作为外部交互坐标（UI 拖拽落点、撤销快照、
 * 文本编解码 SLOTS 段），key → 嵌套定位统一由 parseSlotKey 完成。
 */
import { clamp } from '@/platform/utils/common';

import {
  buildCharIndexRemap,
  charKey,
  chordSlotKey,
  lineCharChord,
  lineEdgeChords,
  parseSlotKey,
  setLineCharChord,
  setLineEdgeChords,
} from './scoreModel.ts';

import type { ParsedSlotKey } from './scoreModel.ts';
import type { Chord, ChordId } from '@/domains/chord/types';
import type { ChordLineSlots, LineId, SlotKey, Song } from '@/domains/score/types';

// 槽位键的解析实现与构造器同处 scoreModel（唯一真相源），此处仅转出以保持既有引用路径可用。
export { parseSlotKey };
export type { ParsedSlotKey };

export function getEdgeChords(
  chordMap: ReadonlyMap<string, ChordLineSlots>,
  lineId: string,
  type: 'start' | 'end'
): ChordId[] {
  // 嵌套结构下边和弦即行级有序列表，直接取用
  return lineEdgeChords(chordMap, lineId, type);
}
/** 重写某行行首/行尾的和弦列表：先删除旧列表，再按新列表依次写入。 */
export function setEdgeChords(
  chordMap: Map<string, ChordLineSlots>,
  lineId: string,
  type: 'start' | 'end',
  chordIds: ChordId[]
): void {
  setLineEdgeChords(chordMap, lineId, type, chordIds);
}
/** 从槽位移除和弦：字符槽位直接删除；边和弦槽位从列表中摘除并回写，返回被移除的 id。 */
export function removeChordFromSlot(chordMap: Map<string, ChordLineSlots>, slotKey: SlotKey): ChordId | null {
  const parsed = parseSlotKey(slotKey);
  if (!parsed) return null;
  const { lineId, type, index } = parsed;
  if (type === 'char') {
    const removed = lineCharChord(chordMap, lineId, index);
    if (removed === null) return null;
    chordMap.get(lineId)?.char.delete(index);
    return removed;
  }

  const slots = chordMap.get(lineId);
  if (!slots) return null;
  const list = slots[type];
  if (index < 0 || index >= list.length) return null;
  const [removed] = list.splice(index, 1);
  setLineEdgeChords(chordMap, lineId, type, list);
  return removed ?? null;
}
/** 向槽位绑定新和弦：字符槽位直接覆盖；边和弦槽位按索引覆盖/追加（行尾扩展、行首前插）。 */
export function bindNewChordToSlot(chordMap: Map<string, ChordLineSlots>, slotKey: SlotKey, chordId: ChordId): void {
  const parsed = parseSlotKey(slotKey);
  if (!parsed) return;
  if (parsed.type === 'char') {
    setLineCharChord(chordMap, parsed.lineId, parsed.index, chordId);
    return;
  }
  const { lineId, type, index } = parsed;
  const list = getEdgeChords(chordMap, lineId, type);
  if (index >= list.length)
    if (type === 'start') list.unshift(chordId);
    else list.push(chordId);
  else list[index] = chordId;
  setEdgeChords(chordMap, lineId, type, list);
}

/** 交换或移动两个槽位的和弦：同行同类边槽位内做插入式重排；跨槽位时两处有值则互换，目标为空则移动。 */
export function swapOrMoveSlotChords(
  chordMap: Map<string, ChordLineSlots>,
  sourceKey: SlotKey,
  targetKey: SlotKey
): void {
  if (sourceKey === targetKey) return;
  const sourceParsed = parseSlotKey(sourceKey);
  const targetParsed = parseSlotKey(targetKey);
  if (!sourceParsed || !targetParsed) return;

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
      // 在剩余列表中按目标视觉索引落位（拖到"添加"占位符即追加到末尾），朴素数组移动保证最终位置正确
      const insertIdx = clamp(tgtIdx, 0, list.length);
      list.splice(insertIdx, 0, movedChordId);
      setEdgeChords(chordMap, sourceParsed.lineId, sourceParsed.type, list);
    }
    return;
  }
  /** 只读探测某结构化槽位当前绑定的和弦 id；空槽位返回 null。 */
  const peekChordId = (parsed: ParsedSlotKey): ChordId | null => {
    if (parsed.type === 'char') return lineCharChord(chordMap, parsed.lineId, parsed.index);
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
      if (parsed.type === 'char') setLineCharChord(chordMap, parsed.lineId, parsed.index, chordId);
      else {
        const list = getEdgeChords(chordMap, parsed.lineId, parsed.type);
        if (parsed.index < list.length) list[parsed.index] = chordId;
        else list.push(chordId);

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
/**
 * 将边和弦目标索引解析为实际插入位置：
 * - 索引有效（< 当前列表长度）→ clamp 后直接使用
 * - 索引越界（占位符/添加按钮）→ 行首（start）插在第 0 位，行尾（end）追加到末位
 */
function resolveEdgeInsertIndex(index: number, listLength: number, type: 'start' | 'end'): number {
  if (index >= listLength) return type === 'start' ? 0 : listLength;
  return Math.min(Math.max(index, 0), listLength);
}

/** 向结构化槽位插入和弦：字符槽位直接写入；边和弦槽位按索引插入（占位符目标视为首/末位）。 */
function insertChordAtParsedLocation(
  chordMap: Map<string, ChordLineSlots>,
  parsed: ParsedSlotKey,
  chordId: ChordId
): void {
  if (parsed.type === 'char') setLineCharChord(chordMap, parsed.lineId, parsed.index, chordId);
  else {
    const list = getEdgeChords(chordMap, parsed.lineId, parsed.type);
    const insertIdx = resolveEdgeInsertIndex(parsed.index, list.length, parsed.type);
    list.splice(insertIdx, 0, chordId);
    setEdgeChords(chordMap, parsed.lineId, parsed.type, list);
  }
}
/**
 * 歌词编辑后的 chordMap 垃圾回收：
 * 1. 删除已不存在行的整条槽位；
 * 2. 传入 finalLineLengths 时，一并删除该行 char 槽位中下标越界的条目（行尾删字后遗留的 line_x_char_9 之类）。
 *    这类槽位 UI 渲染不到（逐行按当前字符数渲染），却会经 extractSongChordSequence 进入文本导出，
 *    是真实的数据外泄；而载入期清洗只按 chordId 清孤儿引用、不校验下标，不会自愈，故在此收口。
 *
 * @param finalLineLengths 与 finalLineIds 一一对应的行字符数；缺省则不做越界检查（保持原行为）
 */
export const garbageCollectChordMap = (
  chordMap: Map<string, ChordLineSlots>,
  finalLineIds: string[],
  finalLineLengths?: readonly number[]
): { map: Map<string, ChordLineSlots>; changed: boolean } => {
  const finalIdsSet = new Set(finalLineIds);
  const lineLengthById = new Map<string, number>();
  finalLineIds.forEach((id, idx) => {
    const len = finalLineLengths?.[idx];
    if (len !== undefined) lineLengthById.set(id, len);
  });

  const updatedMap = new Map(chordMap);
  let changed = false;
  for (const lineId of [...updatedMap.keys()]) {
    if (!finalIdsSet.has(lineId)) {
      updatedMap.delete(lineId);
      changed = true;
      continue;
    }
    // 只有字符槽位受行长约束；边和弦是行级密列表，行长变化不改变其合法性
    const lineLength = lineLengthById.get(lineId);
    if (lineLength === undefined) continue;
    const slots = updatedMap.get(lineId);
    if (!slots || slots.char.size === 0) continue;
    let pruned = false;
    const char = new Map<number, ChordId>();
    for (const [index, chordId] of slots.char)
      if (index < lineLength) char.set(index, chordId);
      else pruned = true;

    if (pruned) {
      updatedMap.set(lineId, { char, start: slots.start, end: slots.end });
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
  chordMap: Map<string, ChordLineSlots>,
  oldLines: readonly string[],
  newLines: readonly string[],
  oldLineIds: readonly LineId[],
  newLineIds: readonly LineId[]
): { map: Map<string, ChordLineSlots>; changed: boolean } => {
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
  for (const [lineId, remap] of remapByLineId) {
    const slots = updatedMap.get(lineId);
    if (!slots || slots.char.size === 0) continue;
    const char = new Map<number, ChordId>();
    let lineChanged = false;
    for (const [index, chordId] of slots.char) {
      if (index >= remap.length) continue;
      const nextIndex = remap[index];
      if (nextIndex === undefined || nextIndex < 0) continue;
      if (nextIndex === index) {
        char.set(index, chordId);
        continue;
      }
      char.set(nextIndex, chordId);
      lineChanged = true;
    }
    if (lineChanged) {
      updatedMap.set(lineId, { char, start: slots.start, end: slots.end });
      changed = true;
    }
  }
  return changed ? { map: updatedMap, changed: true } : { map: chordMap, changed: false };
};

/** 清理 chordMap 中指向不存在和弦 id 的孤儿引用（导入校验 / 删除和弦后使用） */
export const pruneOrphanChordRefs = (
  chordMap: Map<string, ChordLineSlots>,
  validChordIds: Set<string>,
  options?: { preserveUnknown?: boolean }
): { map: Map<string, ChordLineSlots>; changed: boolean } => {
  if (chordMap.size === 0) return { map: chordMap, changed: false };
  const preserveUnknown = options?.preserveUnknown && validChordIds.size === 0;
  const updatedMap = new Map<string, ChordLineSlots>();
  let changed = false;
  for (const [lineId, slots] of chordMap) {
    const char = new Map<number, ChordId>();
    let lineChanged = false;
    for (const [index, id] of slots.char)
      if (id !== undefined && (validChordIds.has(id) || preserveUnknown)) char.set(index, id);
      else lineChanged = true;

    const start: ChordId[] = [];
    for (const id of slots.start)
      if (id !== undefined && (validChordIds.has(id) || preserveUnknown)) start.push(id);
      else lineChanged = true;

    const end: ChordId[] = [];
    for (const id of slots.end)
      if (id !== undefined && (validChordIds.has(id) || preserveUnknown)) end.push(id);
      else lineChanged = true;

    if (!lineChanged) {
      updatedMap.set(lineId, slots);
      continue;
    }
    changed = true;
    if (char.size === 0 && start.length === 0 && end.length === 0) continue;
    updatedMap.set(lineId, { char, start, end });
  }
  return { map: updatedMap, changed };
};

/**
 * 槽位引用重映射（纯函数）：把指向「被丢弃重复项」的绑定改指「保留项」。
 * 与 pruneOrphanChordRefs 语义互补——重定向是语义等价合并（绑定不丢），
 * 剪枝才是真孤儿清除；「先 remap 再 prune」是导入校验与读库去重共同的顺序约定。
 * @returns 新 Map（不改入参）与发生重定向的槽位数量
 */
export const remapChordRefs = (
  chordMap: Map<string, ChordLineSlots>,
  mapping: Map<string, string>
): { map: Map<string, ChordLineSlots>; remappedCount: number } => {
  if (mapping.size === 0) return { map: chordMap, remappedCount: 0 };
  const updatedMap = new Map<string, ChordLineSlots>();
  let remappedCount = 0;
  const remapId = (id: ChordId): ChordId => {
    const target = mapping.get(id);
    if (target !== undefined && target !== id) {
      remappedCount += 1;
      return target as ChordId;
    }
    return id;
  };
  for (const [lineId, slots] of chordMap) {
    const char = new Map<number, ChordId>();
    for (const [index, id] of slots.char)
      if (id === undefined) char.set(index, id);
      else char.set(index, remapId(id));

    updatedMap.set(lineId, { char, start: slots.start.map(remapId), end: slots.end.map(remapId) });
  }
  return { map: updatedMap, remappedCount };
};

// ===== 序列化边界：内存统一用 Map，JSON/持久化用普通对象 =====

const parseIdList = (raw: unknown): ChordId[] => {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is ChordId => typeof id === 'string' && id.length > 0);
};

/** 普通对象/Map -> 嵌套 Map（读取持久化数据 / 导入备份 / 同步拉取用），容忍非法条目；
 *  兼容三种形态：v7 嵌套对象（{ [lineId]: { char, start, end } }，char 可为对象或 Map）、
 *  旧扁平对象（line_{lineId}_{char|start|end}_{index}）、空。 */
export const plainToChordMap = (raw: unknown): Map<string, ChordLineSlots> => {
  const entries: [string, unknown][] = [];
  if (raw instanceof Map)
    for (const [k, v] of raw) {
      if (typeof k === 'string') entries.push([k, v]);
    }
  else if (raw && typeof raw === 'object' && !Array.isArray(raw))
    entries.push(...Object.entries(raw as Record<string, unknown>));
  else return new Map();

  const result = new Map<string, ChordLineSlots>();
  // 扁平对象的边和弦条目先按 index 收集，最后统一排序落位（缺失 index 不留空洞）
  const edgePending = new Map<string, { type: 'start' | 'end'; index: number; id: ChordId }[]>();
  const ensureLine = (lineId: string): ChordLineSlots => {
    let slots = result.get(lineId);
    if (!slots) {
      slots = { char: new Map(), start: [], end: [] };
      result.set(lineId, slots);
    }
    return slots;
  };
  for (const [k, v] of entries) {
    if (typeof k !== 'string' || k.length === 0) continue;
    if (typeof v === 'string' && v.length > 0) {
      // 旧扁平对象：key 形如 line_{lineId}_{char|start|end}_{index}
      const parsed = parseSlotKey(k);
      if (!parsed) continue;
      const slots = ensureLine(parsed.lineId);
      if (parsed.type === 'char') slots.char.set(parsed.index, v as ChordId);
      else {
        const list = edgePending.get(parsed.lineId) ?? [];
        list.push({ type: parsed.type, index: parsed.index, id: v as ChordId });
        edgePending.set(parsed.lineId, list);
      }
      continue;
    }
    // 新嵌套对象：{ [lineId]: { char: { [idx]: id }, start: [], end: [] } }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const rawSlots = v as Record<string, unknown>;
      const slots = ensureLine(k);
      const charRaw = rawSlots['char'];
      if (charRaw instanceof Map)
        for (const [idxRaw, idRaw] of charRaw) {
          const idx = typeof idxRaw === 'number' ? idxRaw : NaN;
          if (!Number.isNaN(idx) && typeof idRaw === 'string' && idRaw.length > 0)
            slots.char.set(idx, idRaw as ChordId);
        }
      else if (charRaw && typeof charRaw === 'object' && !Array.isArray(charRaw))
        for (const [idxStr, idRaw] of Object.entries(charRaw as Record<string, unknown>)) {
          const idx = parseInt(idxStr, 10);
          if (!Number.isNaN(idx) && typeof idRaw === 'string' && idRaw.length > 0)
            slots.char.set(idx, idRaw as ChordId);
        }

      const startIds = parseIdList(rawSlots['start']);
      if (startIds.length > 0) slots.start = startIds;
      const endIds = parseIdList(rawSlots['end']);
      if (endIds.length > 0) slots.end = endIds;
    }
  }
  for (const [lineId, entries] of edgePending) {
    const slots = result.get(lineId);
    if (!slots) continue;
    const startEntries = entries.filter(e => e.type === 'start').sort((a, b) => a.index - b.index);
    const endEntries = entries.filter(e => e.type === 'end').sort((a, b) => a.index - b.index);
    if (startEntries.length > 0) slots.start = startEntries.map(e => e.id);
    if (endEntries.length > 0) slots.end = endEntries.map(e => e.id);
  }
  return result;
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

  for (const [lineId, slots] of song.chordMap) {
    slots.start.forEach((chordId, index) => {
      if (!chordId) return;
      const chord = chordResolver(chordId);
      if (!chord) return;
      steps.push({ slotKey: chordSlotKey(lineId, 'start', index), chordId, chord, lineId, type: 'start', index });
    });
    for (const [index, chordId] of slots.char) {
      if (!chordId) continue;
      const chord = chordResolver(chordId);
      if (!chord) continue;
      steps.push({ slotKey: charKey(lineId, index), chordId, chord, lineId, type: 'char', index });
    }
    slots.end.forEach((chordId, index) => {
      if (!chordId) return;
      const chord = chordResolver(chordId);
      if (!chord) return;
      steps.push({ slotKey: chordSlotKey(lineId, 'end', index), chordId, chord, lineId, type: 'end', index });
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
