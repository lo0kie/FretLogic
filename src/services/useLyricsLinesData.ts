// src/services/useLyricsLinesData.ts

import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import type { Chord } from '@/types';
import { generateUUID } from '@/utils/validators';
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
  chordMap: Record<string | number, Chord>,
  existingLineIds: string[] = []
): LineData[] {
  const rawLines = lyrics.split('\n');

  return rawLines.map((lineText, lineIdx) => {
    const lineId = existingLineIds[lineIdx] || 'l_' + generateUUID('', 8);

    const startChords: EdgeChordItem[] = [];
    let startCount = 0;
    while (chordMap[`line_${lineId}_start_${startCount}`]) {
      startChords.push({
        slotKey: `line_${lineId}_start_${startCount}`,
        chord: chordMap[`line_${lineId}_start_${startCount}`],
      });
      startCount++;
    }

    const endChords: EdgeChordItem[] = [];
    let endCount = 0;
    while (chordMap[`line_${lineId}_end_${endCount}`]) {
      endChords.push({
        slotKey: `line_${lineId}_end_${endCount}`,
        chord: chordMap[`line_${lineId}_end_${endCount}`],
      });
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

/** 响应式包装：纯计算属性，绝不包含任何响应式写副作用 */
export function useLyricsLinesData() {
  const scoreEditor = useScoreEditorStore();

  const lyricsLinesWithEdges = computed<LineData[]>(() => {
    if (!scoreEditor.activeSong) return [];

    return buildLyricsLinesWithEdges(
      scoreEditor.activeSong.lyrics,
      scoreEditor.activeSong.chordMap || {},
      scoreEditor.activeSong.lineIds || []
    );
  });

  return { lyricsLinesWithEdges };
}
