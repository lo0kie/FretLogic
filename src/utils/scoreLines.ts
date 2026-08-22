import type { Chord } from '@/types';

export interface EdgeChordItem {
  slotKey: string;
  chord: Chord;
}

export interface CharItem {
  char: string;
  slotKey: string;
}

export interface LineData {
  lineIdx: number;
  lineId: string;
  chars: CharItem[];
  startChords: EdgeChordItem[];
  endChords: EdgeChordItem[];
  nextStartKey: string;
  nextEndKey: string;
}

const prevCharsByLineId = new Map<string, { text: string; chars: CharItem[] }>();
const prevEdgeChordsCache = new Map<string, { sig: string; chords: EdgeChordItem[] }>();

function getEdgeChordsWithNextKey(
  chordMap: Record<string, string>,
  lineId: string,
  type: 'start' | 'end',
  chordsLookupMap: Map<string, Chord>
) {
  let count = 0;
  let sig = '';
  while (chordMap[`line_${lineId}_${type}_${count}`]) {
    sig += `${count}:${chordMap[`line_${lineId}_${type}_${count}`]}|`;
    count++;
  }
  const cacheKey = `${lineId}_${type}`;
  const cached = prevEdgeChordsCache.get(cacheKey);
  if (cached && cached.sig === sig) {
    return {
      chords: cached.chords,
      nextKey: `line_${lineId}_${type}_${count}`,
    };
  }

  const chords: EdgeChordItem[] = [];
  let i = 0;
  while (chordMap[`line_${lineId}_${type}_${i}`]) {
    const chordId = chordMap[`line_${lineId}_${type}_${i}`] ?? '';
    const foundChord = chordsLookupMap.get(chordId);
    if (foundChord) {
      chords.push({
        slotKey: `line_${lineId}_${type}_${i}`,
        chord: foundChord,
      });
    }
    i++;
  }
  prevEdgeChordsCache.set(cacheKey, { sig, chords });
  return {
    chords,
    nextKey: `line_${lineId}_${type}_${count}`,
  };
}

function buildChars(lineId: string, lineText: string): CharItem[] {
  const cached = prevCharsByLineId.get(lineId);
  if (cached && cached.text === lineText) {
    return cached.chars;
  }
  const chars = lineText.split('').map((char, charIdx) => ({
    char,
    slotKey: `line_${lineId}_char_${charIdx}`,
  }));
  prevCharsByLineId.set(lineId, { text: lineText, chars });
  return chars;
}

export function buildLyricsLinesWithEdges(
  lyrics: string,
  chordMap: Record<string, string>,
  chordsLookupMap: Map<string, Chord>,
  existingLineIds: string[] = []
): LineData[] {
  const rawLines = lyrics.split('\n');
  const activeIds = new Set<string>();
  const result = rawLines.map((lineText, lineIdx) => {
    const lineId = existingLineIds[lineIdx] || String(lineIdx);
    activeIds.add(lineId);
    const { chords: startChords, nextKey: nextStartKey } = getEdgeChordsWithNextKey(
      chordMap,
      lineId,
      'start',
      chordsLookupMap
    );
    const { chords: endChords, nextKey: nextEndKey } = getEdgeChordsWithNextKey(
      chordMap,
      lineId,
      'end',
      chordsLookupMap
    );
    return {
      lineIdx,
      lineId,
      chars: buildChars(lineId, lineText),
      startChords,
      endChords,
      nextStartKey,
      nextEndKey,
    };
  });
  for (const id of prevCharsByLineId.keys()) {
    if (!activeIds.has(id)) {
      prevCharsByLineId.delete(id);
      prevEdgeChordsCache.delete(`${id}_start`);
      prevEdgeChordsCache.delete(`${id}_end`);
    }
  }
  return result;
}

export function clearLyricsLineCharsCache() {
  prevCharsByLineId.clear();
  prevEdgeChordsCache.clear();
}
