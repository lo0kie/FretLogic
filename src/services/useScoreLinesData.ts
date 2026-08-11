import { useChordStore } from '@/stores/chordStore';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import type { Chord } from '@/types';
import { buildLyricsLinesWithEdges, clearLyricsLineCharsCache, type LineData } from '@/utils/scoreLines';
import { computed, watch } from 'vue';

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

  watch(
    () => scoreEditor.activeSongId,
    () => clearLyricsLineCharsCache()
  );

  return { lyricsLinesWithEdges, chordsLookupMap };
}
