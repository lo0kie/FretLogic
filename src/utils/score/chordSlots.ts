/**
 * 和弦槽位映射（chordMap）：谱面槽位键的解析、读写、垃圾回收与序列化边界。
 * 由 utils/music/chord-fretboard.ts 拆分迁入——槽位域属乐谱（score），与 scoreModel 同居一处。
 */
import type { ChordId, SlotKey } from '@/types';

import { charKey, chordSlotKey, collectEdgeChordIds, edgeSlotPrefix } from './scoreModel';

// ===== chordMap: 和弦槽位映射与和弦数据归一化 =====

export interface ParsedSlotKey {
  lineId: string;
  type: 'char' | 'start' | 'end';
  index: number;
}
/** 解析槽位键（line_{lineId}_{char|start|end}_{index}）为结构化对象；格式非法返回 null。 */
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
/** 读取某行行首/行尾的和弦 id 列表。 */
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
/** 歌词编辑后的 chordMap 垃圾回收：删除属于已不存在行的槽位键，返回新映射及是否有变更。 */
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
