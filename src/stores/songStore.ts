import type { Chord, Song } from '@/types';
import { generateUUID } from '@/utils/validators';
import { useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface ParsedSlotKey {
  lineId: string;
  type: 'char' | 'start' | 'end';
  index: number;
}

export function parseSlotKey(slotKey: string | number): ParsedSlotKey | null {
  const str = String(slotKey);
  const match = str.match(/^line_(.+?)_(char|start|end)_(\d+)$/);
  if (!match) return null;
  return {
    lineId: match[1],
    type: match[2] as 'char' | 'start' | 'end',
    index: parseInt(match[3], 10),
  };
}

export function getEdgeChords(
  chordMap: Record<string | number, Chord>,
  lineId: string,
  type: 'start' | 'end'
): Chord[] {
  const result: Chord[] = [];
  let i = 0;
  while (chordMap[`line_${lineId}_${type}_${i}`]) {
    result.push(chordMap[`line_${lineId}_${type}_${i}`]);
    i++;
  }
  return result;
}

export function setEdgeChords(
  chordMap: Record<string | number, Chord>,
  lineId: string,
  type: 'start' | 'end',
  chords: Chord[]
): void {
  let i = 0;
  while (chordMap[`line_${lineId}_${type}_${i}`]) {
    delete chordMap[`line_${lineId}_${type}_${i}`];
    i++;
  }
  for (let j = i; j < i + 10; j++) {
    delete chordMap[`line_${lineId}_${type}_${j}`];
  }

  chords.forEach((chord, idx) => {
    chordMap[`line_${lineId}_${type}_${idx}`] = chord;
  });
}

export function removeChordFromSlot(chordMap: Record<string | number, Chord>, slotKey: string | number): Chord | null {
  const parsed = parseSlotKey(slotKey);
  if (!parsed) {
    const removed = chordMap[slotKey] || null;
    delete chordMap[slotKey];
    return removed;
  }

  const { lineId, type, index } = parsed;

  if (type === 'char') {
    const removed = chordMap[slotKey] || null;
    delete chordMap[slotKey];
    return removed;
  } else {
    const list = getEdgeChords(chordMap, lineId, type);
    if (index < 0 || index >= list.length) {
      return null;
    }
    const [removed] = list.splice(index, 1);
    setEdgeChords(chordMap, lineId, type, list);
    return removed;
  }
}

export function bindNewChordToSlot(
  chordMap: Record<string | number, Chord>,
  slotKey: string | number,
  chord: Chord
): void {
  const parsed = parseSlotKey(slotKey);
  if (!parsed || parsed.type === 'char') {
    chordMap[slotKey] = chord;
    return;
  }

  const { lineId, type, index } = parsed;
  const list = getEdgeChords(chordMap, lineId, type);

  if (index >= list.length) {
    if (type === 'start') {
      list.unshift(chord);
    } else {
      list.push(chord);
    }
  } else {
    list[index] = chord;
  }

  setEdgeChords(chordMap, lineId, type, list);
}

export function swapOrMoveSlotChords(
  chordMap: Record<string | number, Chord>,
  sourceKey: string | number,
  targetKey: string | number
): void {
  if (sourceKey === targetKey) return;

  const sourceParsed = parseSlotKey(sourceKey);
  const targetParsed = parseSlotKey(targetKey);

  if (!sourceParsed || !targetParsed) return;

  if (
    sourceParsed.lineId === targetParsed.lineId &&
    sourceParsed.type === targetParsed.type &&
    sourceParsed.type !== 'char'
  ) {
    const list = getEdgeChords(chordMap, sourceParsed.lineId, sourceParsed.type);
    const srcIdx = sourceParsed.index;
    const tgtIdx = targetParsed.index;

    if (srcIdx >= 0 && srcIdx < list.length) {
      const [movedChord] = list.splice(srcIdx, 1);
      const insertIdx = Math.min(Math.max(0, tgtIdx), list.length);
      list.splice(insertIdx, 0, movedChord);
      setEdgeChords(chordMap, sourceParsed.lineId, sourceParsed.type, list);
    }
    return;
  }

  const peekChord = (parsed: ParsedSlotKey): Chord | null => {
    if (parsed.type === 'char') {
      return chordMap[`line_${parsed.lineId}_char_${parsed.index}`] || null;
    }
    const list = getEdgeChords(chordMap, parsed.lineId, parsed.type);
    return list[parsed.index] || null;
  };

  const sourceChord = peekChord(sourceParsed);
  if (!sourceChord) return;

  const targetChord = peekChord(targetParsed);

  removeChordFromSlot(chordMap, sourceKey);
  if (targetChord) {
    removeChordFromSlot(chordMap, targetKey);
  }

  insertChordAtParsedLocation(chordMap, targetParsed, sourceChord);

  if (targetChord) {
    insertChordAtParsedLocation(chordMap, sourceParsed, targetChord);
  }
}

function insertChordAtParsedLocation(
  chordMap: Record<string | number, Chord>,
  parsed: ParsedSlotKey,
  chord: Chord
): void {
  if (parsed.type === 'char') {
    chordMap[`line_${parsed.lineId}_char_${parsed.index}`] = chord;
  } else {
    const list = getEdgeChords(chordMap, parsed.lineId, parsed.type);
    const insertIdx = Math.min(Math.max(0, parsed.index), list.length);
    list.splice(insertIdx, 0, chord);
    setEdgeChords(chordMap, parsed.lineId, parsed.type, list);
  }
}

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
      bindNewChordToSlot(target.chordMap, slotKey, chord);
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
