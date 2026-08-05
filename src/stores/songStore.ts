import type { Song } from '@/types';
import { bindNewChordToSlot, removeChordFromSlot, swapOrMoveSlotChords } from '@/utils/chordMap';
import { generateUUID } from '@/utils/validators';
import { useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useSongStore = defineStore('song', () => {
  const songs = useStorage<Song[]>('CHORD_LAB_SONGS_V1', [], localStorage);
  const lastDeletedSongInfo = ref<{ song: Song; index: number } | null>(null);

  // 🌟 启动静默迁移：补齐老数据的缺失字段
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
    const target = songs.value.find(s => s.id === id);
    if (!target) return;

    if (payload.title !== undefined) target.title = payload.title;
    if (payload.key !== undefined) target.key = payload.key;
    if (payload.playKey !== undefined) target.playKey = payload.playKey;
    if (payload.capo !== undefined) target.capo = payload.capo;
    if (payload.lyrics !== undefined) target.lyrics = payload.lyrics;
    if (payload.lineIds !== undefined) target.lineIds = payload.lineIds;
    if (payload.chordMap !== undefined) target.chordMap = payload.chordMap;
  };

  const setCharChord = (songId: string, slotKey: string | number, chordId: string) => {
    const target = songs.value.find(s => s.id === songId);
    if (target) {
      if (!target.chordMap) target.chordMap = {};
      bindNewChordToSlot(target.chordMap, slotKey, chordId);
      target.chordMap = { ...target.chordMap };
    }
  };

  const removeCharChord = (songId: string, slotKey: string | number) => {
    const target = songs.value.find(s => s.id === songId);
    if (!target || !target.chordMap) return;

    removeChordFromSlot(target.chordMap, slotKey);
    target.chordMap = { ...target.chordMap };
  };

  const swapSongSlotChords = (songId: string, sourceKey: string | number, targetKey: string | number) => {
    const target = songs.value.find(s => s.id === songId);
    if (!target || !target.chordMap) return;

    swapOrMoveSlotChords(target.chordMap, sourceKey, targetKey);
    target.chordMap = { ...target.chordMap };
  };

  const overwriteSongs = (newSongs: Song[]) => {
    songs.value = [...newSongs];
  };

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
  };
});
