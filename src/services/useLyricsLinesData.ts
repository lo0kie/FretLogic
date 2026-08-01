import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import type { Chord } from '@/types';
import { computed } from 'vue';

export interface EdgeChordItem {
  slotKey: string;
  chord: Chord;
}

export interface CharItem {
  char: string;
  globalIndex: number;
}

export interface LineData {
  lineIdx: number;
  chars: CharItem[];
  startChords: EdgeChordItem[];
  endChords: EdgeChordItem[];
  nextStartKey: string;
  nextEndKey: string;
}

/** 纯函数：把歌词文本 + chordMap 拆解成按行组织的渲染数据（行首/行尾/行内和弦位）。脱离组件即可单测。 */
export function buildLyricsLinesWithEdges(lyrics: string, chordMap: Record<string | number, Chord>): LineData[] {
  const rawLines = lyrics.split('\n');
  let globalCharIdx = 0;

  return rawLines.map((lineText, lineIdx) => {
    const startChords: EdgeChordItem[] = [];
    let startCount = 0;
    while (chordMap[`line_${lineIdx}_start_${startCount}`]) {
      startChords.push({
        slotKey: `line_${lineIdx}_start_${startCount}`,
        chord: chordMap[`line_${lineIdx}_start_${startCount}`],
      });
      startCount++;
    }

    const endChords: EdgeChordItem[] = [];
    let endCount = 0;
    while (chordMap[`line_${lineIdx}_end_${endCount}`]) {
      endChords.push({
        slotKey: `line_${lineIdx}_end_${endCount}`,
        chord: chordMap[`line_${lineIdx}_end_${endCount}`],
      });
      endCount++;
    }

    const chars = lineText.split('').map(char => ({
      char,
      globalIndex: globalCharIdx++,
    }));

    globalCharIdx++; // 换行符本身也占一个全局下标位

    return {
      lineIdx,
      chars,
      startChords: startChords.reverse(),
      endChords,
      nextStartKey: `line_${lineIdx}_start_${startCount}`,
      nextEndKey: `line_${lineIdx}_end_${endCount}`,
    };
  });
}

/** 响应式包装：跟随当前曲谱的歌词与和弦映射自动重算 */
export function useLyricsLinesData() {
  const scoreEditor = useScoreEditorStore();

  const lyricsLinesWithEdges = computed<LineData[]>(() => {
    if (!scoreEditor.activeSong) return [];
    return buildLyricsLinesWithEdges(scoreEditor.activeSong.lyrics, scoreEditor.activeSong.chordMap || {});
  });

  return { lyricsLinesWithEdges };
}
