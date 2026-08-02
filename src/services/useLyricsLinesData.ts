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

/** 纯函数：把歌词文本 + Line ID + chordMap 拆解成按 Line ID 绑定的渲染数据 */
export function buildLyricsLinesWithEdges(
  lyrics: string,
  chordMap: Record<string | number, Chord>,
  existingLineIds: string[] = []
): LineData[] {
  const rawLines = lyrics.split('\n');

  return rawLines.map((lineText, lineIdx) => {
    // 🌟 如果没有对应位置的 lineId，作为兜底生成后使用（纯只读，不做写回操作）
    const lineId = existingLineIds[lineIdx] || 'l_' + generateUUID('', 8);

    // 1. 行首和弦组
    const startChords: EdgeChordItem[] = [];
    let startCount = 0;
    while (chordMap[`line_${lineId}_start_${startCount}`]) {
      startChords.push({
        slotKey: `line_${lineId}_start_${startCount}`,
        chord: chordMap[`line_${lineId}_start_${startCount}`],
      });
      startCount++;
    }

    // 2. 行尾和弦组
    const endChords: EdgeChordItem[] = [];
    let endCount = 0;
    while (chordMap[`line_${lineId}_end_${endCount}`]) {
      endChords.push({
        slotKey: `line_${lineId}_end_${endCount}`,
        chord: chordMap[`line_${lineId}_end_${endCount}`],
      });
      endCount++;
    }

    // 3. 行内字符和弦组
    const chars: CharItem[] = lineText.split('').map((char, charIdx) => ({
      char,
      slotKey: `line_${lineId}_char_${charIdx}`,
    }));

    return {
      lineIdx,
      lineId,
      chars,
      startChords: startChords.reverse(),
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
