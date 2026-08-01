import { useSongStore } from '@/stores/songStore';
import type { Chord, Song } from '@/types';
import { useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

export type ScoreActiveTab = 'edit' | 'interactive';

export const useScoreEditorStore = defineStore('scoreEditor', () => {
  const songStore = useSongStore();

  // 1. 当前激活的乐谱 ID（持久化）
  const activeSongId = useStorage<string | null>('CHORD_LAB_ACTIVE_SONG_ID_V1', null);

  // 2. 当前视图模式：'edit' (编辑歌词) | 'interactive' (排列和弦)
  const activeTabRef = ref<ScoreActiveTab>('edit');

  // 3. 当前选中的和弦插槽
  const selectedSlotKey = ref<string | number | null>(null);

  // 🌟 当前激活的完整乐谱对象
  const activeSong = computed<Song | null>(() => {
    if (!activeSongId.value) return null;
    return songStore.songs.find(s => s.id === activeSongId.value) || null;
  });

  // 🌟 当前乐谱是否有有效歌词
  const hasLyrics = computed(() => Boolean(activeSong.value?.lyrics && activeSong.value.lyrics.trim().length > 0));

  if (hasLyrics.value) {
    activeTabRef.value = 'interactive';
  }

  // 🌟 受约束的 activeTabGetter / Setter
  const activeTab = computed({
    get: () => {
      // 核心拦截：如果无歌词，强制返回 'edit'
      if (!hasLyrics.value) {
        return 'edit';
      }
      return activeTabRef.value;
    },
    set: (val: ScoreActiveTab) => {
      if (val === 'interactive' && !hasLyrics.value) {
        // 无歌词时阻止切换到排列和弦
        activeTabRef.value = 'edit';
        return;
      }
      activeTabRef.value = val;
    },
  });

  // 切换乐谱或歌词被清空时，自动做校验回退
  watch(
    [activeSong, hasLyrics],
    ([_, validLyrics]) => {
      selectedSlotKey.value = null;
      if (!validLyrics) {
        activeTabRef.value = 'edit';
      }
    },
    { immediate: true }
  );

  // --- Actions ---

  const setActiveSong = (id: string | null) => {
    activeSongId.value = id;
    selectedSlotKey.value = null;
  };

  const updateKey = (key: string) => {
    if (activeSong.value) {
      activeSong.value.key = key;
    }
  };

  const updateCapo = (capo: number) => {
    if (activeSong.value) {
      activeSong.value.capo = Math.min(12, Math.max(0, capo));
    }
  };

  const updateLyrics = (lyrics: string) => {
    if (activeSong.value) {
      songStore.updateSongLyrics(activeSong.value.id, lyrics);
      // 如果歌词被清空，强制退回编辑歌词模式
      if (!lyrics.trim()) {
        activeTabRef.value = 'edit';
      }
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

    const map = activeSong.value.chordMap || {};
    const sourceChord = map[sourceKey];
    const targetChord = map[targetKey];

    if (sourceChord) {
      setSlotChord(targetKey, sourceChord);
      if (targetChord) {
        setSlotChord(sourceKey, targetChord);
      } else {
        removeSlotChord(sourceKey);
      }
    }
  };

  const updatePlayKey = (playKey: string) => {
    if (activeSong.value) {
      activeSong.value.playKey = playKey;
    }
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
  };
});
