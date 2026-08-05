import { useSongStore } from '@/stores/songStore';
import type { Chord, Song } from '@/types';
import { cloneDeep } from '@/utils/dataParser';
import { garbageCollectChordMap, matchLineIds, sanitizeLyricsText } from '@/utils/lineIdMatcher';
import { getKeySemitones, transposeChordName } from '@/utils/musicTheory';
import { useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

export type ScoreActiveTab = 'edit' | 'interactive';

interface HistoryState {
  lyrics: string;
  lineIds: string[];
  chordMap: Record<string | number, string>;
}

export const useScoreEditorStore = defineStore('scoreEditor', () => {
  const songStore = useSongStore();

  const activeSongId = useStorage<string | null>('CHORD_LAB_ACTIVE_SONG_ID_V1', null);
  const activeTabRef = ref<ScoreActiveTab>('edit');
  const selectedSlotKey = ref<string | number | null>(null);

  const fontScale = useStorage('CHORD_LAB_SCORE_FONT_SCALE_V1', 1.0);
  const fretboardScale = useStorage('CHORD_LAB_SCORE_FRETBOARD_V1', 1.0);

  const historyStack = ref<HistoryState[]>([]);
  const historyIndex = ref(-1);
  const isUndoRedoAction = ref(false);

  const activeSong = computed<Song | null>(() => {
    if (!activeSongId.value) return null;
    return songStore.songs.find(s => s.id === activeSongId.value) || null;
  });

  const hasLyrics = computed(() => Boolean(activeSong.value?.lyrics && activeSong.value.lyrics.trim().length > 0));

  const activeTab = computed({
    get: () => {
      if (!hasLyrics.value) return 'edit';
      return activeTabRef.value;
    },
    set: (val: ScoreActiveTab) => {
      if (val === 'interactive' && !hasLyrics.value) {
        activeTabRef.value = 'edit';
        return;
      }
      activeTabRef.value = val;
    },
  });

  const recordHistory = (song?: Song) => {
    const target = song || activeSong.value;
    if (!target || isUndoRedoAction.value) return;

    historyStack.value.splice(historyIndex.value + 1);
    historyStack.value.push(
      cloneDeep({
        lyrics: target.lyrics,
        lineIds: target.lineIds,
        chordMap: target.chordMap || {},
      })
    );

    if (historyStack.value.length > 50) {
      historyStack.value.shift();
    }
    historyIndex.value = historyStack.value.length - 1;
  };

  const undo = () => {
    if (historyIndex.value > 0 && activeSong.value) {
      isUndoRedoAction.value = true;
      historyIndex.value--;
      const state = cloneDeep(historyStack.value[historyIndex.value]);
      songStore.updateSongMeta(activeSong.value.id, state);
      setTimeout(() => {
        isUndoRedoAction.value = false;
      }, 50);
    }
  };

  const redo = () => {
    if (historyIndex.value < historyStack.value.length - 1 && activeSong.value) {
      isUndoRedoAction.value = true;
      historyIndex.value++;
      const state = cloneDeep(historyStack.value[historyIndex.value]);
      songStore.updateSongMeta(activeSong.value.id, state);
      setTimeout(() => {
        isUndoRedoAction.value = false;
      }, 50);
    }
  };

  watch(
    activeSong,
    newSong => {
      selectedSlotKey.value = null;
      if (!newSong) {
        activeTabRef.value = 'edit';
        historyStack.value = [];
        historyIndex.value = -1;
        return;
      }

      if (!isUndoRedoAction.value && historyStack.value.length === 0) {
        recordHistory(newSong);
      }

      const validLyrics = Boolean(newSong.lyrics && newSong.lyrics.trim().length > 0);
      activeTabRef.value = validLyrics ? 'interactive' : 'edit';
    },
    { immediate: true }
  );

  const setActiveSong = (id: string | null) => {
    activeSongId.value = id;
    selectedSlotKey.value = null;
    historyStack.value = [];
    historyIndex.value = -1;
  };

  const updateKey = (key: string) => {
    if (activeSong.value && activeSong.value.key !== key) {
      recordHistory();
      const delta = getKeySemitones(activeSong.value.key || 'C', key);
      const newPlayKey = transposeChordName(activeSong.value.playKey || 'C', delta);

      songStore.updateSongMeta(activeSong.value.id, {
        key,
        playKey: newPlayKey,
      });
    }
  };

  const updatePlayKey = (playKey: string) => {
    if (activeSong.value && activeSong.value.playKey !== playKey) {
      recordHistory();

      const delta = getKeySemitones(activeSong.value.playKey || 'C', playKey);
      const newKey = transposeChordName(activeSong.value.key || 'C', delta);

      songStore.updateSongMeta(activeSong.value.id, {
        playKey,
        key: newKey,
      });
    }
  };

  const updateCapo = (capo: number) => {
    if (activeSong.value && activeSong.value.capo !== capo) {
      recordHistory();
      const clampedCapo = Math.min(12, Math.max(0, capo));
      const deltaCapo = clampedCapo - (activeSong.value.capo || 0);
      const newKey = transposeChordName(activeSong.value.key || 'C', deltaCapo);

      songStore.updateSongMeta(activeSong.value.id, {
        capo: clampedCapo,
        key: newKey,
      });
    }
  };

  const updateLyrics = (lyrics: string) => {
    if (!activeSong.value) return;

    const sanitizedLyrics = sanitizeLyricsText(lyrics);
    if (sanitizedLyrics === activeSong.value.lyrics) return;

    recordHistory();

    const oldLines = activeSong.value.lyrics.split('\n');
    const newLines = sanitizedLyrics.split('\n');

    const newIds = matchLineIds(oldLines, newLines, activeSong.value.lineIds ?? []);
    const { map: updatedChordMap, changed } = garbageCollectChordMap(activeSong.value.chordMap || {}, newIds);

    songStore.updateSongMeta(activeSong.value.id, {
      lyrics: sanitizedLyrics,
      lineIds: newIds,
      chordMap: changed ? updatedChordMap : activeSong.value.chordMap,
    });

    if (!sanitizedLyrics.trim()) {
      activeTabRef.value = 'edit';
    }
  };

  const setSlotChord = (slotKey: string | number, chord: Chord) => {
    if (!activeSong.value) return;
    recordHistory();
    // 🌟 核心：存入和弦 ID，实现解耦绑定
    songStore.setCharChord(activeSong.value.id, slotKey, chord.id);
  };

  const removeSlotChord = (slotKey: string | number) => {
    if (!activeSong.value) return;
    recordHistory();
    songStore.removeCharChord(activeSong.value.id, slotKey);
  };

  const swapSlotChords = (sourceKey: string | number, targetKey: string | number) => {
    if (!activeSong.value || sourceKey === targetKey) return;
    recordHistory();
    songStore.swapSongSlotChords(activeSong.value.id, sourceKey, targetKey);
  };

  return {
    activeSongId,
    activeTab,
    selectedSlotKey,
    activeSong,
    hasLyrics,
    setActiveSong,
    updateKey,
    updatePlayKey,
    updateCapo,
    updateLyrics,
    setSlotChord,
    removeSlotChord,
    swapSlotChords,
    fontScale,
    fretboardScale,
    undo,
    redo,
  };
});
