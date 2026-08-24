import { describe, expect, it } from 'vitest';
import type { Chord, Group, Song } from '@/types';
import { Tuning } from '@/utils/musicTheory';
import { ChordRecord, GroupRecord, SongRecord } from '@/services/music/models';

const chord: Chord = {
  id: 'chord-1',
  chordName: 'C',
  strings: [
    [-1, false],
    [3, false],
    [2, false],
    [0, false],
    [1, false],
    [0, false],
  ],
  fretCount: 3,
  capo: 0,
  groupId: 'group-1',
  tuning: Tuning.STANDARD,
  rootStringIndex: 4,
};

describe('domain models', () => {
  it('exposes chord invariants without changing persisted shape', () => {
    expect(ChordRecord.id(chord)).toBe('chord-1');
    expect(ChordRecord.isActive(chord)).toBe(true);
    expect(ChordRecord.isMuted(chord.strings[0])).toBe(true);
  });

  it('exposes group and song identity invariants', () => {
    const group: Group = { id: 'group-1', name: 'C', sortRule: 'ROOT_PITCH' };
    const song: Song = {
      id: 'song-1',
      title: 'Song',
      lyrics: '',
      lineIds: [],
      playKey: 'C',
      capo: 0,
      chordMap: {},
      version: 1,
    };

    expect(GroupRecord.id(group)).toBe('group-1');
    expect(SongRecord.id(song)).toBe('song-1');
    expect(SongRecord.hasLyrics(song)).toBe(false);
  });
});
