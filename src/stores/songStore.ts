import type { Song } from '@/types';
import { bindNewChordToSlot, removeChordFromSlot, swapOrMoveSlotChords } from '@/utils/chordMap';
import { generateUUID } from '@/utils/id';
import { debounceFilter, useEventListener, useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export const useSongStore = defineStore('song', () => {
  const songs = useStorage<Song[]>('CHORD_LAB_SONGS_V1', [], localStorage, {
    eventFilter: debounceFilter(400, { maxWait: 1500 }),
  });
  const songMap = computed(() => new Map(songs.value.map(s => [s.id, s])));
  const lastDeletedSongInfo = ref<{ song: Song; index: number } | null>(null);
  let needUpdate = false;
  const alignedSongs = songs.value.map(s => {
    let updated = false;
    const newSong = { ...s };
    if (typeof newSong.key !== 'string' || !newSong.key) {
      newSong.key = 'C';
      updated = true;
    }
    if (typeof newSong.playKey !== 'string' || !newSong.playKey) {
      newSong.playKey = newSong.key;
      updated = true;
    }
    if (typeof newSong.version !== 'number') {
      newSong.version = 1;
      updated = true;
    }
    if (updated) needUpdate = true;
    return newSong;
  });
  if (needUpdate) {
    songs.value = alignedSongs;
  }

  const createSong = (title: string): Song => {
    const newSong: Song = {
      id: 's_' + generateUUID().slice(0, 8),
      title: title.trim() || '未命名乐谱',
      lyrics: '',
      key: 'C',
      playKey: 'C',
      capo: 0,
      chordMap: {},
      lineIds: [],
      version: 1,
    };
    songs.value.push(newSong);
    return newSong;
  };

  const deleteSong = (id: string) => {
    const index = songs.value.findIndex(s => s.id === id);
    if (index === -1) return;
    lastDeletedSongInfo.value = {
      song: { ...songs.value[index] },
      index,
    };
    songs.value = songs.value.filter(s => s.id !== id);
  };

  const undoDeleteSong = () => {
    if (!lastDeletedSongInfo.value) return;
    const { song, index } = lastDeletedSongInfo.value;
    if (index >= 0 && index <= songs.value.length) {
      songs.value.splice(index, 0, song);
    } else {
      songs.value.push(song);
    }
    lastDeletedSongInfo.value = null;
  };

  const updateSongMeta = (
    id: string,
    payload: Partial<Pick<Song, 'title' | 'key' | 'playKey' | 'capo' | 'lyrics' | 'lineIds' | 'chordMap'>>
  ) => {
    const target = songMap.value.get(id);
    if (!target) return;

    let hasChanged = false;
    if (payload.title !== undefined && target.title !== payload.title) {
      target.title = payload.title;
      hasChanged = true;
    }
    if (payload.key !== undefined && target.key !== payload.key) {
      target.key = payload.key;
      hasChanged = true;
    }
    if (payload.playKey !== undefined && target.playKey !== payload.playKey) {
      target.playKey = payload.playKey;
      hasChanged = true;
    }
    if (payload.capo !== undefined && target.capo !== payload.capo) {
      target.capo = payload.capo;
      hasChanged = true;
    }
    if (payload.lyrics !== undefined && target.lyrics !== payload.lyrics) {
      target.lyrics = payload.lyrics;
      hasChanged = true;
    }
    if (payload.lineIds !== undefined && JSON.stringify(target.lineIds) !== JSON.stringify(payload.lineIds)) {
      target.lineIds = payload.lineIds;
      hasChanged = true;
    }
    if (payload.chordMap !== undefined && target.chordMap !== payload.chordMap) {
      target.chordMap = payload.chordMap;
      hasChanged = true;
    }

    if (hasChanged) {
      target.version = (target.version ?? 1) + 1;
    }
  };

  const setCharChord = (songId: string, slotKey: string | number, chordId: string) => {
    const target = songMap.value.get(songId);
    if (!target) return;
    target.chordMap ??= {};
    if (target.chordMap[slotKey] === chordId) return;
    bindNewChordToSlot(target.chordMap, slotKey, chordId);
    target.chordMap = { ...target.chordMap };
    target.version = (target.version ?? 1) + 1;
  };

  const removeCharChord = (songId: string, slotKey: string | number) => {
    const target = songMap.value.get(songId);
    if (!target || !target.chordMap) return;
    const removed = removeChordFromSlot(target.chordMap, slotKey);
    if (!removed) return;
    target.chordMap = { ...target.chordMap };
    target.version = (target.version ?? 1) + 1;
  };

  const swapSongSlotChords = (songId: string, sourceKey: string | number, targetKey: string | number) => {
    const target = songMap.value.get(songId);
    if (!target || !target.chordMap) return;
    swapOrMoveSlotChords(target.chordMap, sourceKey, targetKey);
    target.chordMap = { ...target.chordMap };
    target.version = (target.version ?? 1) + 1;
  };

  const overwriteSongs = (newSongs: Song[]) => {
    songs.value = [...newSongs];
  };

  const unbindChordIds = (targetIds: Set<string>) => {
    songs.value.forEach(song => {
      if (!song.chordMap) return;
      let hasChanged = false;
      Object.keys(song.chordMap).forEach(key => {
        const boundChordId = song.chordMap[key];
        if (boundChordId && targetIds.has(boundChordId)) {
          delete song.chordMap[key];
          hasChanged = true;
        }
      });
      if (hasChanged) {
        song.chordMap = { ...song.chordMap };
        song.version = (song.version ?? 1) + 1;
      }
    });
  };

  const flushSongsNow = () => {
    try {
      localStorage.setItem('CHORD_LAB_SONGS_V1', JSON.stringify(songs.value));
    } catch (err) {
      console.error('[songStore] flush on unload failed:', err);
    }
  };

  useEventListener(window, 'beforeunload', flushSongsNow);
  useEventListener(document, 'visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSongsNow();
  });

  return {
    songs,
    createSong,
    deleteSong,
    undoDeleteSong,
    updateSongMeta,
    setCharChord,
    removeCharChord,
    swapSongSlotChords,
    overwriteSongs,
    unbindChordIds,
  };
});
