import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useChordStore } from '@/stores/chordStore';
import { useSongStore } from '@/stores/songStore';
import { Tuning } from '@/utils/musicTheory';
import { sanitizePersistedData } from '@/domain/validation/persistedData';
import type { Chord, Group, Song } from '@/types';

const group: Group = { id: 'group-1', name: 'C', sortRule: 'ROOT_PITCH' };
const validChord: Chord = {
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

describe('sanitizePersistedData', () => {
  it('removes invalid persisted chords and prunes orphan song references', () => {
    const invalidChord = { ...validChord, id: 'chord-2', strings: 'broken' } as unknown as Chord;
    const song: Song = {
      id: 'song-1',
      title: 'Song',
      lyrics: '',
      lineIds: ['line-1'],
      playKey: 'C',
      capo: 0,
      chordMap: { 'line_line-1_char_0': 'chord-1', 'line_line-1_char_1': 'missing' },
      version: 1,
    };

    const result = sanitizePersistedData({
      groups: [group, null],
      chords: [validChord, invalidChord],
      songs: [song],
    });

    expect(result.groups).toHaveLength(1);
    expect(result.chords).toEqual([validChord]);
    expect(result.songs[0].chordMap).toEqual({ 'line_line-1_char_0': 'chord-1' });
  });

  it('deduplicates identical fingerprints within one group', () => {
    const result = sanitizePersistedData({ groups: [group], chords: [validChord, { ...validChord }] });
    expect(result.chords).toHaveLength(1);
  });

  it('preserves score chord bindings when loading a song without a chord library snapshot', () => {
    const song: Song = {
      id: 'song-1',
      title: 'Song',
      lyrics: 'Hello',
      lineIds: ['line-1'],
      playKey: 'C',
      capo: 0,
      chordMap: { 'line_line-1_char_0': 'chord-1' },
      version: 1,
    };

    const result = sanitizePersistedData({ groups: [], chords: null, songs: [song] });

    expect(result.songs[0].chordMap).toEqual({ 'line_line-1_char_0': 'chord-1' });
  });
});

describe('store startup sanitization', () => {
  it('cleans malformed localStorage chord data before exposing it', () => {
    localStorage.clear();
    localStorage.setItem('CHORD_LAB_GROUPS', JSON.stringify([group]));
    localStorage.setItem('CHORD_LAB_LIST_V4', JSON.stringify([validChord, { ...validChord, id: 'bad' }]));
    setActivePinia(createPinia());
    const chordStore = useChordStore();

    expect(chordStore.savedChordsList).toHaveLength(1);
  });

  it('cleans malformed localStorage song data before exposing it', () => {
    localStorage.clear();
    localStorage.setItem('CHORD_LAB_SONGS_INDEX_V1', JSON.stringify(['song-1']));
    localStorage.setItem(
      'CHORD_LAB_SONG_ENTRY_V1:song-1',
      JSON.stringify({
        id: 'song-1',
        title: 'Song',
        lyrics: 'Hello',
        lineIds: ['line-1', 42],
        playKey: 'C',
        capo: 99,
        chordMap: { 'line_line-1_char_0': 'chord-1' },
      })
    );
    setActivePinia(createPinia());
    const songStore = useSongStore();

    expect(songStore.songs).toHaveLength(1);
    expect(songStore.songs[0].capo).toBe(0);
    expect(songStore.songs[0].lineIds).toEqual(['line-1']);
    expect(songStore.songs[0].chordMap).toEqual({ 'line_line-1_char_0': 'chord-1' });
  });
});
