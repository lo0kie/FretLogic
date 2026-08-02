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
  lineId: string; // 🌟 引入唯一行 ID
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
): { lines: LineData[]; updatedLineIds: string[] } {
  const rawLines = lyrics.split('\n');
  const updatedLineIds: string[] = [];

  const lines = rawLines.map((lineText, lineIdx) => {
    // 🌟 如果当前行已有稳定 ID 则复用，没有则生成全新 ID
    const lineId = existingLineIds[lineIdx] || 'l_' + generateUUID('', 8);
    updatedLineIds.push(lineId);

    // 1. 行首和弦组 (基于 lineId 绑定)
    const startChords: EdgeChordItem[] = [];
    let startCount = 0;
    while (chordMap[`line_${lineId}_start_${startCount}`]) {
      startChords.push({
        slotKey: `line_${lineId}_start_${startCount}`,
        chord: chordMap[`line_${lineId}_start_${startCount}`],
      });
      startCount++;
    }

    // 2. 行尾和弦组 (基于 lineId 绑定)
    const endChords: EdgeChordItem[] = [];
    let endCount = 0;
    while (chordMap[`line_${lineId}_end_${endCount}`]) {
      endChords.push({
        slotKey: `line_${lineId}_end_${endCount}`,
        chord: chordMap[`line_${lineId}_end_${endCount}`],
      });
      endCount++;
    }

    // 3. 行内字符和弦组 (基于 lineId + charIdx 绑定)
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

  return { lines, updatedLineIds };
}

/** 响应式包装：跟随当前曲谱的歌词与和弦映射自动重算 */
export function useLyricsLinesData() {
  const scoreEditor = useScoreEditorStore();

  const lyricsLinesWithEdges = computed<LineData[]>(() => {
    if (!scoreEditor.activeSong) return [];

    const { lines, updatedLineIds } = buildLyricsLinesWithEdges(
      scoreEditor.activeSong.lyrics,
      scoreEditor.activeSong.chordMap || {},
      scoreEditor.activeSong.lineIds || []
    );

    // 🌟 自动同步补全 lineIds，确保 ID 稳定
    if (JSON.stringify(scoreEditor.activeSong.lineIds) !== JSON.stringify(updatedLineIds)) {
      scoreEditor.activeSong.lineIds = updatedLineIds;
    }

    return lines;
  });

  return { lyricsLinesWithEdges };
}
