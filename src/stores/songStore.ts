// src/stores/songStore.ts

import type { Chord, Song } from '@/types';
import { generateUUID } from '@/utils/validators';
import { useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useSongStore = defineStore('song', () => {
  const songs = useStorage<Song[]>('CHORD_LAB_SONGS_V1', [], localStorage);
  const lastDeletedSongInfo = ref<{ song: Song; index: number } | null>(null);

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

  // 🌟 规范化 Action：统一对外暴露乐谱基础元数据的显式修改口径
  const updateSongMeta = (
    id: string,
    payload: Partial<Pick<Song, 'key' | 'playKey' | 'capo' | 'lyrics' | 'lineIds' | 'chordMap'>>
  ) => {
    const target = songs.value.find(s => s.id === id);
    if (!target) return;

    if (payload.key !== undefined) target.key = payload.key;
    if (payload.playKey !== undefined) target.playKey = payload.playKey;
    if (payload.capo !== undefined) target.capo = payload.capo;
    if (payload.lyrics !== undefined) target.lyrics = payload.lyrics;
    if (payload.lineIds !== undefined) target.lineIds = payload.lineIds;
    if (payload.chordMap !== undefined) target.chordMap = payload.chordMap;
  };

  const setCharChord = (songId: string, slotKey: string | number, chord: Chord) => {
    const target = songs.value.find(s => s.id === songId);
    if (target) {
      if (!target.chordMap) target.chordMap = {};
      target.chordMap[slotKey] = chord;
    }
  };

  const removeCharChord = (songId: string, slotKey: string | number) => {
    const target = songs.value.find(s => s.id === songId);
    if (!target || !target.chordMap || !target.chordMap[slotKey]) return;

    const keyStr = String(slotKey);
    if (keyStr.includes('_start_') || keyStr.includes('_end_')) {
      const parts = keyStr.split('_');
      const lineId = parts[1];
      const type = parts[2];
      const delIdx = parseInt(parts[3], 10);

      delete target.chordMap[slotKey];

      const remaining: Chord[] = [];
      let i = 0;
      while (true) {
        const currentKey = `line_${lineId}_${type}_${i}`;
        if (i !== delIdx) {
          if (target.chordMap[currentKey]) {
            remaining.push(target.chordMap[currentKey]);
          }
        }
        if (target.chordMap[currentKey]) {
          delete target.chordMap[currentKey];
        } else if (i > delIdx + 5) {
          break;
        }
        i++;
        if (i > 20) break;
      }

      remaining.forEach((chord, newIdx) => {
        target.chordMap[`line_${lineId}_${type}_${newIdx}`] = chord;
      });
    } else {
      delete target.chordMap[slotKey];
    }
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
    overwriteSongs,
  };
});
