export interface ParsedSlotKey {
  lineId: string;
  type: 'char' | 'start' | 'end';
  index: number;
}

export function parseSlotKey(slotKey: string | number): ParsedSlotKey | null {
  const str = String(slotKey);
  const match = str.match(/^line_(.+?)_(char|start|end)_(\d+)$/);
  if (!match) return null;
  return { lineId: match[1], type: match[2] as 'char' | 'start' | 'end', index: parseInt(match[3], 10) };
}

export function getEdgeChords(
  chordMap: Record<string | number, string>,
  lineId: string,
  type: 'start' | 'end'
): string[] {
  const result: string[] = [];
  let i = 0;
  while (chordMap[`line_${lineId}_${type}_${i}`]) {
    result.push(chordMap[`line_${lineId}_${type}_${i}`]);
    i++;
  }
  return result;
}

export function setEdgeChords(
  chordMap: Record<string | number, string>,
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

export function removeChordFromSlot(
  chordMap: Record<string | number, string>,
  slotKey: string | number
): string | null {
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
export function bindNewChordToSlot(
  chordMap: Record<string | number, string>,
  slotKey: string | number,
  chordId: string
): void {
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
export function swapOrMoveSlotChords(
  chordMap: Record<string | number, string>,
  sourceKey: string | number,
  targetKey: string | number
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
function insertChordAtParsedLocation(
  chordMap: Record<string | number, string>,
  parsed: ParsedSlotKey,
  chordId: string
): void {
  if (parsed.type === 'char') {
    chordMap[`line_${parsed.lineId}_char_${parsed.index}`] = chordId;
  } else {
    const list = getEdgeChords(chordMap, parsed.lineId, parsed.type);
    const insertIdx = Math.min(Math.max(0, parsed.index), list.length);
    list.splice(insertIdx, 0, chordId);
    setEdgeChords(chordMap, parsed.lineId, parsed.type, list);
  }
}
