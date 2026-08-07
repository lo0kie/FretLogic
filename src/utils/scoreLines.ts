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

function getEdgeChordsWithNextKey(
  chordMap: Record<string | number, string>,
  lineId: string,
  type: 'start' | 'end',
  chordsLookupMap: Map<string, Chord>
) {
  const chords: EdgeChordItem[] = [];
  let count = 0;
  while (chordMap[`line_${lineId}_${type}_${count}`]) {
    const chordId = chordMap[`line_${lineId}_${type}_${count}`];
    const foundChord = chordsLookupMap.get(chordId);
    if (foundChord) {
      chords.push({
        slotKey: `line_${lineId}_${type}_${count}`,
        chord: foundChord,
      });
    }
    count++;
  }
  return {
    chords,
    nextKey: `line_${lineId}_${type}_${count}`,
  };
}

export function buildLyricsLinesWithEdges(
  lyrics: string,
  chordMap: Record<string | number, string>,
  chordsLookupMap: Map<string, Chord>,
  existingLineIds: string[] = []
): LineData[] {
  const rawLines = lyrics.split('\n');

  return rawLines.map((lineText, lineIdx) => {
    const lineId = existingLineIds[lineIdx] || String(lineIdx);

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

    const chars: CharItem[] = lineText.split('').map((char, charIdx) => ({
      char,
      slotKey: `line_${lineId}_char_${charIdx}`,
    }));

    return {
      lineIdx,
      lineId,
      chars,
      startChords,
      endChords,
      nextStartKey,
      nextEndKey,
    };
  });
}
