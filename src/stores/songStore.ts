import type { Chord, Song } from '@/types';
import { generateUUID } from '@/utils/validators';
import { useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';

export const useSongStore = defineStore('song', () => {
  const songs = useStorage<Song[]>('CHORD_LAB_SONGS_V1', [], localStorage);

  const createSong = (title: string): Song => {
    const newSong: Song = {
      id: 's_' + generateUUID().slice(0, 8),
      title: title.trim() || '未命名乐谱',
      lyrics: '',
      key: 'C',
      capo: 0,
      chordMap: {},
    };
    songs.value.push(newSong);
    return newSong;
  };

  const deleteSong = (id: string) => {
    songs.value = songs.value.filter(s => s.id !== id);
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
    if (target && target.chordMap && target.chordMap[slotKey]) {
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
    updateSongLyrics,
    setCharChord,
    removeCharChord,
    overwriteSongs,
  };
});
