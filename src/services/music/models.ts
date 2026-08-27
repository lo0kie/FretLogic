import type { Chord, Group, Song } from '@/types';
import { isMuted } from '@/utils/music/musicTheory';

export const ChordRecord = {
  id: (chord: Chord): string => chord.id,
  isActive: (chord: Chord): boolean => chord.strings.some(string => string[0] >= 0),
  isMuted,
};

export const GroupRecord = {
  id: (group: Group): string => group.id,
};

export const SongRecord = {
  id: (song: Song): string => song.id,
  hasLyrics: (song: Song): boolean => song.lyrics.trim().length > 0,
};
