import { STORAGE_KEYS } from '@/constants';
import { useSongStore } from '@/stores/songStore';
import type { Chord, Song } from '@/types';
import { garbageCollectChordMap } from '@/utils/chordMap';
import { cloneDeep } from '@/utils/cloneDeep';
import { matchLineIds } from '@/utils/lineIdMatcher';
import { computeSongKey, getKeySemitones, transposeChordName } from '@/utils/musicTheory';
import { sanitizeLyricsText } from '@/utils/sanitizeLyricsText';
import { debounceFilter, useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, nextTick, ref, watch } from 'vue';

type ScoreActiveTab = 'edit' | 'interactive';

interface HistoryState {
  lyrics: string;
  lineIds: string[];
  chordMap: Record<string, string>;
}

export const useScoreEditorStore = defineStore('scoreEditor', () => {
  const songStore = useSongStore();
  const activeSongId = useStorage<string | null>(STORAGE_KEYS.ACTIVE_SONG_ID, null);
  const activeTabRef = ref<ScoreActiveTab>('edit');
  const selectedSlotKey = ref<string | null>(null);
  const fontScale = useStorage(STORAGE_KEYS.SCORE_FONT_SCALE, 1.0, localStorage, {
    eventFilter: debounceFilter(400, { maxWait: 1500 }),
  });
  const fretboardScale = useStorage(STORAGE_KEYS.SCORE_FRETBOARD_SCALE, 1.0, localStorage, {
    eventFilter: debounceFilter(400, { maxWait: 1500 }),
  });
  // A4 导出适配用的非持久化倍率：不写 localStorage，导出结束后归位
  const exportScaleMultiplier = ref(1);
  const effectiveFontScale = computed(() => fontScale.value * exportScaleMultiplier.value);
  const effectiveFretboardScale = computed(() => fretboardScale.value * exportScaleMultiplier.value);
  const historyStack: HistoryState[] = [];
  let historyIndex = -1;
  const isUndoRedoAction = ref(false);
  const HISTORY_CAPACITY = 20;
  const scrollSpeed = useStorage(STORAGE_KEYS.SCORE_SCROLL_SPEED, 60);

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
    historyStack.splice(historyIndex + 1);
    historyStack.push(
      cloneDeep({
        lyrics: target.lyrics,
        lineIds: target.lineIds,
        chordMap: target.chordMap || {},
      })
    );
    if (historyStack.length > HISTORY_CAPACITY) {
      historyStack.shift();
    }
    historyIndex = historyStack.length - 1;
  };

  const undo = async () => {
    if (historyIndex > 0 && activeSong.value) {
      isUndoRedoAction.value = true;
      historyIndex--;
      // 快照可能被 songStore 以引用方式接管（chordMap 会被原地修改），恢复时必须克隆
      const state = cloneDeep(historyStack[historyIndex]!);
      songStore.updateSongMeta(activeSong.value.id, state);
      await nextTick();
      await nextTick();
      isUndoRedoAction.value = false;
    }
  };

  const redo = async () => {
    if (historyIndex < historyStack.length - 1 && activeSong.value) {
      isUndoRedoAction.value = true;
      historyIndex++;
      const state = cloneDeep(historyStack[historyIndex]!);
      songStore.updateSongMeta(activeSong.value.id, state);
      await nextTick();
      await nextTick();
      isUndoRedoAction.value = false;
    }
  };

  watch(
    activeSong,
    newSong => {
      selectedSlotKey.value = null;
      historyStack.length = 0;
      historyIndex = -1;
      if (!newSong) {
        activeTabRef.value = 'edit';
        return;
      }
      if (!isUndoRedoAction.value) {
        recordHistory(newSong);
      }
      const validLyrics = Boolean(newSong.lyrics && newSong.lyrics.trim().length > 0);
      activeTabRef.value = validLyrics ? 'interactive' : 'edit';
    },
    { immediate: true }
  );

  const setActiveSong = (id: string | null) => {
    activeSongId.value = id;
  };

  const updateKey = (key: string) => {
    if (!activeSong.value) return;
    const currentKey = computeSongKey(activeSong.value.playKey, activeSong.value.capo);
    if (currentKey !== key) {
      recordHistory();
      const delta = getKeySemitones(currentKey, key);
      const newPlayKey = transposeChordName(activeSong.value.playKey || 'C', delta);
      songStore.updateSongMeta(activeSong.value.id, {
        playKey: newPlayKey,
      });
    }
  };

  const updatePlayKey = (playKey: string) => {
    if (activeSong.value && activeSong.value.playKey !== playKey) {
      recordHistory();
      songStore.updateSongMeta(activeSong.value.id, {
        playKey,
      });
    }
  };

  const updateCapo = (capo: number) => {
    if (activeSong.value && activeSong.value.capo !== capo) {
      recordHistory();
      const clampedCapo = Math.min(11, Math.max(0, capo));
      songStore.updateSongMeta(activeSong.value.id, {
        capo: clampedCapo,
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

  const setSlotChord = (slotKey: string, chord: Chord) => {
    if (!activeSong.value) return;
    recordHistory();
    songStore.setCharChord(activeSong.value.id, slotKey, chord.id);
  };

  const removeSlotChord = (slotKey: string) => {
    if (!activeSong.value) return;
    recordHistory();
    songStore.removeCharChord(activeSong.value.id, slotKey);
  };

  const clearLineChords = (lineId: string) => {
    if (!activeSong.value || !activeSong.value.chordMap) return;
    recordHistory();
    const linePrefix = `line_${lineId}_`;
    const updatedMap = { ...activeSong.value.chordMap };
    let changed = false;
    Object.keys(updatedMap).forEach(key => {
      if (key.startsWith(linePrefix)) {
        delete updatedMap[key];
        changed = true;
      }
    });
    if (changed) {
      songStore.updateSongMeta(activeSong.value.id, { chordMap: updatedMap });
    }
  };

  const swapSlotChords = (sourceKey: string, targetKey: string) => {
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
    clearLineChords,
    swapSlotChords,
    fontScale,
    fretboardScale,
    exportScaleMultiplier,
    effectiveFontScale,
    effectiveFretboardScale,
    undo,
    redo,
    scrollSpeed,
  };
});
