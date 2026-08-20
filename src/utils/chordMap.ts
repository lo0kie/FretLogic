import type { Chord, GuitarStringsModel } from '@/types';
import { Tuning } from './musicTheory';
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
    lineId: match[1],
    type: match[2] as 'char' | 'start' | 'end',
    index: parseInt(match[3], 10),
  };
}
export function getEdgeChords(chordMap: Record<string, string>, lineId: string, type: 'start' | 'end'): string[] {
  const result: string[] = [];
  let i = 0;
  while (chordMap[`line_${lineId}_${type}_${i}`]) {
    result.push(chordMap[`line_${lineId}_${type}_${i}`]);
    i++;
  }
  return result;
}
export function setEdgeChords(
  chordMap: Record<string, string>,
  lineId: string,
  type: 'start' | 'end',
  chordIds: string[]
): void {
  const prefix = `line_${lineId}_${type}_`;
  Object.keys(chordMap).forEach(key => {
    if (key.startsWith(prefix)) {
      delete chordMap[key];
    }
  });
  chordIds.forEach((chordId, idx) => {
    chordMap[`${prefix}${idx}`] = chordId;
  });
}
export function removeChordFromSlot(chordMap: Record<string, string>, slotKey: string): string | null {
  const parsed = parseSlotKey(slotKey);
  if (!parsed) {
    const removed = chordMap[slotKey] || null;
    delete chordMap[slotKey];
    return removed;
  }
  const { lineId, type, index } = parsed;
  if (type === 'char') {
    const removed = chordMap[slotKey] || null;
    delete chordMap[slotKey];
    return removed;
  } else {
    const list = getEdgeChords(chordMap, lineId, type);
    if (index < 0 || index >= list.length) return null;
    const [removed] = list.splice(index, 1);
    setEdgeChords(chordMap, lineId, type, list);
    return removed;
  }
}
export function bindNewChordToSlot(chordMap: Record<string, string>, slotKey: string, chordId: string): void {
  const parsed = parseSlotKey(slotKey);
  if (!parsed || parsed.type === 'char') {
    chordMap[slotKey] = chordId;
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
export function swapOrMoveSlotChords(chordMap: Record<string, string>, sourceKey: string, targetKey: string): void {
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
      const insertIdx = Math.min(Math.max(0, tgtIdx), list.length);
      list.splice(insertIdx, 0, movedChordId);
      setEdgeChords(chordMap, sourceParsed.lineId, sourceParsed.type, list);
    }
    return;
  }
  const peekChordId = (parsed: ParsedSlotKey): string | null => {
    if (parsed.type === 'char') return chordMap[`line_${parsed.lineId}_char_${parsed.index}`] || null;
    const list = getEdgeChords(chordMap, parsed.lineId, parsed.type);
    return list[parsed.index] || null;
  };
  const sourceChordId = peekChordId(sourceParsed);
  if (!sourceChordId) return;
  const targetChordId = peekChordId(targetParsed);
  removeChordFromSlot(chordMap, sourceKey);
  if (targetChordId) removeChordFromSlot(chordMap, targetKey);
  insertChordAtParsedLocation(chordMap, targetParsed, sourceChordId);
  if (targetChordId) insertChordAtParsedLocation(chordMap, sourceParsed, targetChordId);
}
function insertChordAtParsedLocation(chordMap: Record<string, string>, parsed: ParsedSlotKey, chordId: string): void {
  if (parsed.type === 'char') {
    chordMap[`line_${parsed.lineId}_char_${parsed.index}`] = chordId;
  } else {
    const list = getEdgeChords(chordMap, parsed.lineId, parsed.type);
    const insertIdx = Math.min(Math.max(0, parsed.index), list.length);
    list.splice(insertIdx, 0, chordId);
    setEdgeChords(chordMap, parsed.lineId, parsed.type, list);
  }
}
export const garbageCollectChordMap = (
  chordMap: Record<string, string>,
  finalLineIds: string[]
): { map: Record<string, string>; changed: boolean } => {
  const finalIdsSet = new Set(finalLineIds);
  const updatedMap = { ...chordMap };
  let changed = false;
  Object.keys(updatedMap).forEach(key => {
    const parsed = parseSlotKey(key);
    if (parsed && !finalIdsSet.has(parsed.lineId)) {
      delete updatedMap[key];
      changed = true;
    }
  });
  return { map: updatedMap, changed };
};

/** 清理 chordMap 中指向不存在和弦 id 的孤儿引用（导入校验 / 删除和弦后使用） */
export const pruneOrphanChordRefs = (
  chordMap: Record<string, string>,
  validChordIds: Set<string>
): { map: Record<string, string>; changed: boolean } => {
  const updatedMap = { ...chordMap };
  let changed = false;
  Object.keys(updatedMap).forEach(key => {
    if (!validChordIds.has(updatedMap[key])) {
      delete updatedMap[key];
      changed = true;
    }
  });
  return { map: updatedMap, changed };
};

export const normalizeChord = (chord: Chord): { chord: Chord; changed: boolean } => {
  const capo = chord.capo ?? 0;
  const tuning = chord.tuning || Tuning.STANDARD;
  const fretCount = chord.fretCount ?? 3;

  // 迁移：旧数据每根弦各自维护 isRoot，统一为单点 rootStringIndex
  let rootStringIndex: number | null = chord.rootStringIndex ?? null;
  const legacyRoots = chord.strings
    .map((s, idx) => ((s as unknown as { isRoot?: boolean }).isRoot ? idx : -1))
    .filter(idx => idx >= 0);
  if (rootStringIndex === null && legacyRoots.length > 0) {
    rootStringIndex = legacyRoots[0];
  }
  // 校验：rootStringIndex 必须落在有效且已按音的弦上，否则清空
  if (
    rootStringIndex !== null &&
    (rootStringIndex < 0 || rootStringIndex >= chord.strings.length || chord.strings[rootStringIndex].fret < 0)
  ) {
    rootStringIndex = null;
  }

  // 清理旧字段：每弦的 isRoot / label / isAccidental（现已移除，全部实时派生）
  let fieldsCleaned = false;
  chord.strings.forEach(s => {
    const legacy = s as unknown as { isRoot?: boolean; label?: string; isAccidental?: boolean };
    if ('isRoot' in legacy || 'label' in legacy || 'isAccidental' in legacy) {
      fieldsCleaned = true;
      delete legacy.isRoot;
      delete legacy.label;
      delete legacy.isAccidental;
    }
  });
  const legacyChord = chord as unknown as { isInverted?: boolean; fingerprint?: string };
  if ('isInverted' in legacyChord || 'fingerprint' in legacyChord) {
    fieldsCleaned = true;
    delete legacyChord.isInverted;
    delete legacyChord.fingerprint;
  }

  const changed =
    chord.capo !== capo ||
    chord.tuning !== tuning ||
    chord.fretCount !== fretCount ||
    chord.rootStringIndex !== rootStringIndex ||
    fieldsCleaned;
  if (!changed) return { chord, changed: false };
  return {
    chord: {
      ...chord,
      capo,
      tuning,
      fretCount,
      rootStringIndex,
      strings: chord.strings as GuitarStringsModel,
    },
    changed: true,
  };
};
