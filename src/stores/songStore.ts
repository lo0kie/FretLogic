// === FILE: C:\Users\lookie\userspace\coding\fret-logic\src\stores\songStore.ts ===

import type { Chord, Song } from '@/types';
import { generateUUID } from '@/utils/validators';
import { useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { ref } from 'vue'; // 确保引入 ref

export const useSongStore = defineStore('song', () => {
  const songs = useStorage<Song[]>('CHORD_LAB_SONGS_V1', [], localStorage);

  // 🌟 新增：用于临时存放最近被删除的乐谱及其索引，供撤销使用
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
    };
    songs.value.push(newSong);
    return newSong;
  };

  const deleteSong = (id: string) => {
    const index = songs.value.findIndex(s => s.id === id);
    if (index === -1) return;

    // 记录被删除的曲谱及原位置
    lastDeletedSongInfo.value = {
      song: { ...songs.value[index] },
      index,
    };

    songs.value = songs.value.filter(s => s.id !== id);
  };

  // 🌟 新增：执行撤销恢复
  const undoDeleteSong = () => {
    if (!lastDeletedSongInfo.value) return;
    const { song, index } = lastDeletedSongInfo.value;

    // 插入回原来的位置，如果位置越界则直接 push
    if (index >= 0 && index <= songs.value.length) {
      songs.value.splice(index, 0, song);
    } else {
      songs.value.push(song);
    }

    lastDeletedSongInfo.value = null;
  };

  const updateSongLyrics = (id: string, lyrics: string) => {
    const target = songs.value.find(s => s.id === id);
    if (target) {
      target.lyrics = lyrics.replace(/[ \t\u3000]/g, '');
    }
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
      const lineIdx = parts[1];
      const type = parts[2];
      const delIdx = parseInt(parts[3], 10);

      delete target.chordMap[slotKey];

      const remaining: Chord[] = [];
      let i = 0;
      while (true) {
        const currentKey = `line_${lineIdx}_${type}_${i}`;
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
        target.chordMap[`line_${lineIdx}_${type}_${newIdx}`] = chord;
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
    undoDeleteSong, // 🌟 导出撤销方法
    updateSongLyrics,
    setCharChord,
    removeCharChord,
    overwriteSongs,
  };
});
