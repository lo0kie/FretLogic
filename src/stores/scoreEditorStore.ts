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
  const activeTab = ref<ScoreActiveTab>('interactive');

  // 3. 当前选中的和弦插槽（用于 ChordPickerModal 或高亮显示）
  const selectedSlotKey = ref<string | number | null>(null);

  // 🌟 当前激活的完整乐谱对象（响应式计算）
  const activeSong = computed<Song | null>(() => {
    if (!activeSongId.value) return null;
    return songStore.songs.find(s => s.id === activeSongId.value) || null;
  });

  // 🌟 是否处于空状态（未选择乐谱）
  const isEmpty = computed(() => !activeSong.value);

  watch(activeSongId, () => {
    selectedSlotKey.value = null;
  });

  // --- Actions ---

  // 切换选中乐谱
  const setActiveSong = (id: string | null) => {
    activeSongId.value = id;
    selectedSlotKey.value = null;
  };

  // 更改调性 (Key)
  const updateKey = (key: string) => {
    if (activeSong.value) {
      activeSong.value.key = key;
    }
  };

  // 更改变调夹 (Capo)
  const updateCapo = (capo: number) => {
    if (activeSong.value) {
      activeSong.value.capo = Math.min(12, Math.max(0, capo));
    }
  };

  // 更新歌词（带格式清洗：移除空格与 Tab，保留换行）
  const updateLyrics = (lyrics: string) => {
    if (activeSong.value) {
      songStore.updateSongLyrics(activeSong.value.id, lyrics);
    }
  };

  // 绑定和弦到指定字符/行插槽
  const setSlotChord = (slotKey: string | number, chord: Chord) => {
    if (!activeSong.value) return;
    songStore.setCharChord(activeSong.value.id, slotKey, chord);
  };

  // 移除指定插槽的和弦
  const removeSlotChord = (slotKey: string | number) => {
    if (!activeSong.value) return;
    songStore.removeCharChord(activeSong.value.id, slotKey);
  };

  // 🌟 拖拽/移动交换两个插槽的和弦
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

  return {
    activeSongId,
    activeTab,
    selectedSlotKey,
    activeSong,
    isEmpty,
    setActiveSong,
    updateKey,
    updateCapo,
    updateLyrics,
    setSlotChord,
    removeSlotChord,
    swapSlotChords, // 🌟 必须在这里正确导出，TS 报错即刻消除
  };
});
