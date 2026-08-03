// src/stores/scoreEditorStore.ts

import { useSongStore } from '@/stores/songStore';
import type { Chord, Song } from '@/types';
import { generateUUID } from '@/utils/validators';
import { useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

export type ScoreActiveTab = 'edit' | 'interactive';

export const useScoreEditorStore = defineStore('scoreEditor', () => {
  const songStore = useSongStore();

  const activeSongId = useStorage<string | null>('CHORD_LAB_ACTIVE_SONG_ID_V1', null);
  const activeTabRef = ref<ScoreActiveTab>('edit');
  const selectedSlotKey = ref<string | number | null>(null);

  const fontScale = useStorage('CHORD_LAB_SCORE_FONT_SCALE_V1', 1.0);
  const fretboardScale = useStorage('CHORD_LAB_SCORE_FRETBOARD_V1', 1.0);

  // 当前激活的乐谱对象
  const activeSong = computed<Song | null>(() => {
    if (!activeSongId.value) return null;
    return songStore.songs.find(s => s.id === activeSongId.value) || null;
  });

  // 校验乐谱是否有有效歌词
  const hasLyrics = computed(() => Boolean(activeSong.value?.lyrics && activeSong.value.lyrics.trim().length > 0));

  // 受约束的 activeTab 读写拦截器
  const activeTab = computed({
    get: () => {
      if (!hasLyrics.value) {
        return 'edit';
      }
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

  // 🌟 核心修复 1：监听 activeSong 变更（换歌 / 删歌），健全同步 Tab 状态机
  watch(
    activeSong,
    newSong => {
      selectedSlotKey.value = null;
      if (!newSong) {
        activeTabRef.value = 'edit';
        return;
      }

      // 有歌词 → 排列和弦，无歌词 → 编辑歌词
      const validLyrics = Boolean(newSong.lyrics && newSong.lyrics.trim().length > 0);
      activeTabRef.value = validLyrics ? 'interactive' : 'edit';
    },
    { immediate: true }
  );

  // --- Actions ---

  const setActiveSong = (id: string | null) => {
    activeSongId.value = id;
    selectedSlotKey.value = null;
  };

  // 🌟 核心修复 2：所有属性修改统一走 songStore.updateSongMeta
  const updateKey = (key: string) => {
    if (activeSong.value) {
      songStore.updateSongMeta(activeSong.value.id, { key });
    }
  };

  const updatePlayKey = (playKey: string) => {
    if (activeSong.value) {
      songStore.updateSongMeta(activeSong.value.id, { playKey });
    }
  };

  const updateCapo = (capo: number) => {
    if (activeSong.value) {
      const clampedCapo = Math.min(12, Math.max(0, capo));
      songStore.updateSongMeta(activeSong.value.id, { capo: clampedCapo });
    }
  };

  // FILE: src/stores/scoreEditorStore.ts

  const updateLyrics = (lyrics: string) => {
    if (!activeSong.value) return;

    // 1. 剔除行尾空格与全角无用空白
    const sanitizedLyrics = lyrics
      .split('\n')
      .map(line => line.replace(/[\t\r\u3000]+/g, '').trimEnd())
      .join('\n');

    const oldLines = activeSong.value.lyrics.split('\n');
    const newLines = sanitizedLyrics.split('\n');

    // 🌟 核心修复：保底对齐 oldIds！如果持久化的 lineIds 不存在或长度对不上，立即按原始歌词补齐旧 ID
    let oldIds = [...(activeSong.value.lineIds || [])];
    if (oldIds.length < oldLines.length) {
      for (let i = oldIds.length; i < oldLines.length; i++) {
        oldIds[i] = 'l_' + generateUUID('', 8);
      }
    }

    const newIds: Array<string | null> = new Array(newLines.length).fill(null);
    const usedOldIndices = new Set<number>();

    // A. 前向双指针匹配（内容未变的行，原样继承 ID）
    let start = 0;
    while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) {
      newIds[start] = oldIds[start];
      usedOldIndices.add(start);
      start++;
    }

    // B. 后向双指针匹配（倒序内容未变的行，原样继承 ID）
    let oldEnd = oldLines.length - 1;
    let newEnd = newLines.length - 1;
    while (oldEnd >= start && newEnd >= start && oldLines[oldEnd] === newLines[newEnd]) {
      if (!usedOldIndices.has(oldEnd)) {
        newIds[newEnd] = oldIds[oldEnd];
        usedOldIndices.add(oldEnd);
      }
      oldEnd--;
      newEnd--;
    }

    // C. 收集中间变动窗口内【尚未被占用】的旧 ID 队列
    const availableOldIds: string[] = [];
    for (let i = start; i <= oldEnd; i++) {
      if (!usedOldIndices.has(i) && oldIds[i]) {
        availableOldIds.push(oldIds[i]);
      }
    }

    // D. 优先把变动窗口内未使用的旧 ID 顺次分配给新窗口的变动行，余下的才分配全新 ID
    let availIdx = 0;
    for (let i = start; i <= newEnd; i++) {
      if (!newIds[i]) {
        if (availIdx < availableOldIds.length) {
          newIds[i] = availableOldIds[availIdx++];
        } else {
          newIds[i] = 'l_' + generateUUID('', 8);
        }
      }
    }

    // E. 兜底补全
    for (let i = 0; i < newLines.length; i++) {
      if (!newIds[i]) {
        newIds[i] = 'l_' + generateUUID('', 8);
      }
    }

    // F. 垃圾回收：仅物理清理那些真正的“废弃行 ID”
    const finalIdsSet = new Set(newIds as string[]);
    const updatedChordMap = { ...(activeSong.value.chordMap || {}) };
    let hasMapChanged = false;

    Object.keys(updatedChordMap).forEach(key => {
      if (key.startsWith('line_')) {
        const parts = key.split('_');
        const lineId = parts[1];
        if (lineId && !finalIdsSet.has(lineId)) {
          delete updatedChordMap[key];
          hasMapChanged = true;
        }
      }
    });

    // 统一写回 Store，持久化 Pinia 状态
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
    songStore.setCharChord(activeSong.value.id, slotKey, chord);
  };

  const removeSlotChord = (slotKey: string | number) => {
    if (!activeSong.value) return;
    songStore.removeCharChord(activeSong.value.id, slotKey);
  };

  const swapSlotChords = (sourceKey: string | number, targetKey: string | number) => {
    if (!activeSong.value || sourceKey === targetKey) return;
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
  };
});
