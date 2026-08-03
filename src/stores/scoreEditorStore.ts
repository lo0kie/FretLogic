import { parseSlotKey, useSongStore } from '@/stores/songStore';
import type { Chord, Song } from '@/types';
import { cloneDeep, getEditDistance } from '@/utils/dataParser';
import { getKeySemitones, transposeChordName, transposePhysicalChord } from '@/utils/musicTheory';
import { generateUUID } from '@/utils/validators';
import { useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

export type ScoreActiveTab = 'edit' | 'interactive';

interface HistoryState {
  lyrics: string;
  lineIds: string[];
  chordMap: Record<string | number, Chord>;
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

  // 🌟 P2：撤销重做支持
  const recordHistory = (song?: Song) => {
    const target = song || activeSong.value;
    if (!target || isUndoRedoAction.value) return;

    historyStack.value.splice(historyIndex.value + 1);
    historyStack.value.push(
      cloneDeep({
        lyrics: target.lyrics,
        lineIds: target.lineIds || [],
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

  // 🌟 P3：自动计算移调
  const updateKey = (key: string) => {
    if (activeSong.value && activeSong.value.key !== key) {
      recordHistory();
      const delta = getKeySemitones(activeSong.value.key || 'C', key);
      const newPlayKey = transposeChordName(activeSong.value.playKey || 'C', delta);
      const newChordMap = { ...activeSong.value.chordMap };

      if (delta !== 0) {
        Object.keys(newChordMap).forEach(k => {
          if (newChordMap[k]) {
            newChordMap[k] = transposePhysicalChord(newChordMap[k], delta);
          }
        });
      }
      songStore.updateSongMeta(activeSong.value.id, {
        key,
        playKey: newPlayKey,
        chordMap: newChordMap,
      });
    }
  };

  const updatePlayKey = (playKey: string) => {
    if (activeSong.value && activeSong.value.playKey !== playKey) {
      recordHistory();

      const delta = getKeySemitones(activeSong.value.playKey || 'C', playKey);
      const newKey = transposeChordName(activeSong.value.key || 'C', delta);
      const newChordMap = { ...activeSong.value.chordMap };

      if (delta !== 0) {
        Object.keys(newChordMap).forEach(k => {
          if (newChordMap[k]) {
            newChordMap[k] = transposePhysicalChord(newChordMap[k], delta);
          }
        });
      }

      songStore.updateSongMeta(activeSong.value.id, {
        playKey,
        key: newKey,
        chordMap: newChordMap,
      });
    }
  };

  const updateCapo = (capo: number) => {
    if (activeSong.value && activeSong.value.capo !== capo) {
      recordHistory();
      const clampedCapo = Math.min(12, Math.max(0, capo));
      const deltaCapo = clampedCapo - (activeSong.value.capo || 0);
      const newKey = transposeChordName(activeSong.value.key || 'C', deltaCapo);

      const newChordMap = { ...activeSong.value.chordMap };
      if (deltaCapo !== 0) {
        Object.keys(newChordMap).forEach(k => {
          if (newChordMap[k]) {
            // Capo 平移保持指法命名不变，仅平移物理品位
            newChordMap[k] = transposePhysicalChord(newChordMap[k], deltaCapo, clampedCapo, false);
          }
        });
      }
      songStore.updateSongMeta(activeSong.value.id, {
        capo: clampedCapo,
        key: newKey,
        chordMap: newChordMap,
      });
    }
  };

  // 🌟 P0：编辑歌词，完美保持现有行并执行防重叠的回收
  const updateLyrics = (lyrics: string) => {
    if (!activeSong.value) return;

    recordHistory();

    const sanitizedLyrics = lyrics
      .split('\n')
      .map(line => line.replace(/[\t\r\u3000]+/g, '').trimEnd())
      .join('\n');

    const oldLines = activeSong.value.lyrics.split('\n');
    const newLines = sanitizedLyrics.split('\n');

    // 对齐补充 oldIds（应对旧数据或初始空数组的情况）
    const oldIds = [...(activeSong.value.lineIds || [])];
    if (oldIds.length < oldLines.length) {
      for (let i = oldIds.length; i < oldLines.length; i++) {
        oldIds[i] = String(i);
      }
    }

    const newIds: Array<string | null> = new Array(newLines.length).fill(null);
    const usedOldIndices = new Set<number>();

    // 完全一致优先继承
    for (let i = 0; i < newLines.length; i++) {
      for (let j = 0; j < oldLines.length; j++) {
        if (!usedOldIndices.has(j) && newIds[i] === null && oldLines[j] === newLines[i]) {
          newIds[i] = oldIds[j];
          usedOldIndices.add(j);
          break;
        }
      }
    }

    // 编辑距离相近分配
    for (let i = 0; i < newLines.length; i++) {
      if (newIds[i] === null) {
        let bestMatchIdx = -1;
        let minDistance = Infinity;

        for (let j = 0; j < oldLines.length; j++) {
          if (!usedOldIndices.has(j)) {
            const dist = getEditDistance(oldLines[j], newLines[i]);
            const maxLength = Math.max(oldLines[j].length, newLines[i].length);
            const similarity = 1 - dist / (maxLength || 1);

            if (similarity >= 0.45 && dist < minDistance) {
              minDistance = dist;
              bestMatchIdx = j;
            }
          }
        }

        if (bestMatchIdx !== -1) {
          newIds[i] = oldIds[bestMatchIdx];
          usedOldIndices.add(bestMatchIdx);
        }
      }
    }

    // 全新分配
    for (let i = 0; i < newLines.length; i++) {
      if (!newIds[i]) {
        newIds[i] = 'l_' + generateUUID('', 8);
      }
    }

    // 使用原生解析器处理的严谨垃圾回收
    const finalIdsSet = new Set(newIds as string[]);
    const updatedChordMap = { ...(activeSong.value.chordMap || {}) };
    let hasMapChanged = false;

    Object.keys(updatedChordMap).forEach(key => {
      const parsed = parseSlotKey(key);
      if (parsed && !finalIdsSet.has(parsed.lineId)) {
        delete updatedChordMap[key];
        hasMapChanged = true;
      }
    });

    songStore.updateSongMeta(activeSong.value.id, {
      lyrics: sanitizedLyrics,
      lineIds: newIds as string[],
      chordMap: hasMapChanged ? updatedChordMap : activeSong.value.chordMap,
    });

    if (!sanitizedLyrics.trim()) {
      activeTabRef.value = 'edit';
    }
  };

  const setSlotChord = (slotKey: string | number, chord: Chord) => {
    if (!activeSong.value) return;
    recordHistory();
    songStore.setCharChord(activeSong.value.id, slotKey, chord);
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
