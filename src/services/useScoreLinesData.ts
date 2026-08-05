import { useChordStore } from '@/stores/chordStore';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import type { Chord } from '@/types';
import { computed } from 'vue';

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

export function buildLyricsLinesWithEdges(
  lyrics: string,
  chordMap: Record<string | number, string>,
  chordsLookupMap: Map<string, Chord>,
  existingLineIds: string[] = []
): LineData[] {
  const rawLines = lyrics.split('\n');

  return rawLines.map((lineText, lineIdx) => {
    const lineId = existingLineIds[lineIdx] || String(lineIdx);

    const startChords: EdgeChordItem[] = [];
    let startCount = 0;
    while (chordMap[`line_${lineId}_start_${startCount}`]) {
      const chordId = chordMap[`line_${lineId}_start_${startCount}`];
      const foundChord = chordsLookupMap.get(chordId);
      if (foundChord) {
        startChords.push({
          slotKey: `line_${lineId}_start_${startCount}`,
          chord: foundChord,
        });
      }
      startCount++;
    }

    const endChords: EdgeChordItem[] = [];
    let endCount = 0;
    while (chordMap[`line_${lineId}_end_${endCount}`]) {
      const chordId = chordMap[`line_${lineId}_end_${endCount}`];
      const foundChord = chordsLookupMap.get(chordId);
      if (foundChord) {
        endChords.push({
          slotKey: `line_${lineId}_end_${endCount}`,
          chord: foundChord,
        });
      }
      endCount++;
    }

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
      nextStartKey: `line_${lineId}_start_${startCount}`,
      nextEndKey: `line_${lineId}_end_${endCount}`,
    };
  });
}

export function useScoreLinesData() {
  const scoreEditor = useScoreEditorStore();
  const chordStore = useChordStore();

  const chordsLookupMap = computed(() => {
    const map = new Map<string, Chord>();
    chordStore.savedChordsList.forEach(c => {
      if (c.id) map.set(c.id, c);
      if (c.fingerprint) map.set(c.fingerprint, c);
    });
    return map;
  });

  const lyricsLinesWithEdges = computed<LineData[]>(() => {
    if (!scoreEditor.activeSong) return [];

    return buildLyricsLinesWithEdges(
      scoreEditor.activeSong.lyrics,
      scoreEditor.activeSong.chordMap || {},
      chordsLookupMap.value,
      scoreEditor.activeSong.lineIds
    );
  });

  return { lyricsLinesWithEdges, chordsLookupMap };
}
