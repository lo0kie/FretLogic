import { useChordStore } from '@/stores/chordStore';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import type { Chord } from '@/types';
import { computeChordFingerprint } from '@/utils/musicTheory';
import { buildLyricsLinesWithEdges, clearLyricsLineCharsCache, type LineData } from '@/utils/scoreLines';
import { computed, watch } from 'vue';

// 模块级单例：ScoreView 与 ScoreInteractiveArea 共享同一套 computed，
// 避免 chordsLookupMap / lyricsLinesWithEdges 各自重复构建与双份依赖追踪
let singleton: ReturnType<typeof buildSingleton> | null = null;

function buildSingleton() {
  const scoreEditor = useScoreEditorStore();
  const chordStore = useChordStore();

  const chordsLookupMap = computed(() => {
    const map = new Map<string, Chord>();
    chordStore.savedChordsList.forEach(c => {
      if (c.id) map.set(c.id, c);
      map.set(computeChordFingerprint(c), c);
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

  watch(
    () => scoreEditor.activeSongId,
    () => clearLyricsLineCharsCache()
  );

  return { lyricsLinesWithEdges, chordsLookupMap };
}

export function useScoreLinesData() {
  if (!singleton) {
    singleton = buildSingleton();
  }
  return singleton;
}
