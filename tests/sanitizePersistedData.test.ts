import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';

import { sanitizePersistedData } from '@/app/services/validation/persistedData';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { Tuning } from '@/domains/chord/theory/theory';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { serializeForStorage } from '@/platform/utils/common';

import type { Chord, Group } from '@/domains/chord/types';
import type { Song } from '@/domains/score/types';

const group: Group = { id: 'group-1', name: 'C', sortRule: 'ROOT_PITCH' };
const validChord: Chord = {
  id: 'chord-1',
  nameSegments: { root: ['C', 0] },
  strings: [
    [-1, false],
    [3, false],
    [2, false],
    [0, false],
    [1, false],
    [0, false],
  ],
  fretCount: 3,
  fretOffset: 0,
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
    expect(result.chords).toHaveLength(1);
    expect(result.chords[0]).toMatchObject(validChord);
    expect(result.songs[0].chordMap).toEqual(new Map([['line_line-1_char_0', 'chord-1']]));
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

    expect(result.songs[0].chordMap).toEqual(new Map([['line_line-1_char_0', 'chord-1']]));
  });

  it('分组缺失时间戳时按数组顺序递增补全', () => {
    const before = Date.now();
    const result = sanitizePersistedData({
      groups: [
        { id: 'g1', name: 'C' },
        { id: 'g2', name: 'D' },
        { id: 'g3', name: 'E' },
      ],
      chords: [],
      songs: [],
    });

    const created = result.groups.map(g => g.createdAt);
    expect(created.every(ts => typeof ts === 'number' && Number.isFinite(ts))).toBe(true);
    expect(created[0]!).toBeGreaterThanOrEqual(before);
    expect(created[0]!).toBeLessThan(created[1]!);
    expect(created[1]!).toBeLessThan(created[2]!);
  });

  it('和弦缺失时间戳时按数组顺序递增补全', () => {
    const secondChord = {
      ...validChord,
      id: 'chord-2',
      strings: [
        [-1, false],
        [0, false],
        [2, false],
        [0, false],
        [1, false],
        [0, false],
      ],
    } as unknown as Chord;

    const result = sanitizePersistedData({ groups: [group], chords: [validChord, secondChord] });

    expect(result.chords).toHaveLength(2);
    expect(result.chords[0].createdAt!).toBeLessThan(result.chords[1].createdAt!);
  });

  it('乐谱缺失时间戳时按数组顺序递增补全', () => {
    const buildSong = (id: string): Song => ({
      id,
      title: `Song-${id}`,
      lyrics: '',
      lineIds: [],
      playKey: 'C',
      capo: 0,
      chordMap: {},
      version: 1,
    });

    const result = sanitizePersistedData({ groups: [], chords: [], songs: [buildSong('s1'), buildSong('s2')] });

    expect(result.songs).toHaveLength(2);
    expect(result.songs[0].createdAt!).toBeLessThan(result.songs[1].createdAt!);
  });

  it('已有时间戳保持不变，updatedAt 缺失时回退为 createdAt', () => {
    const result = sanitizePersistedData({
      groups: [
        { id: 'g1', name: 'C' },
        { id: 'g2', name: 'D', createdAt: 1000, updatedAt: 2000 },
      ],
      chords: [],
      songs: [],
    });

    expect(result.groups[0].updatedAt).toBe(result.groups[0].createdAt);
    expect(result.groups[1].createdAt).toBe(1000);
    expect(result.groups[1].updatedAt).toBe(2000);
  });

  it('非法时间戳视为缺失并参与递增补全', () => {
    const rawGroups = [
      { id: 'g1', name: 'C', createdAt: 'not-a-number' },
      { id: 'g2', name: 'D', createdAt: Number.NaN },
    ] as unknown as Group[];

    const result = sanitizePersistedData({ groups: rawGroups, chords: [], songs: [] });

    expect(Number.isFinite(result.groups[0].createdAt!)).toBe(true);
    expect(result.groups[1].createdAt!).toBeGreaterThan(result.groups[0].createdAt!);
  });

  it('chordMap 序列化往返：Map 落盘为对象，读回还原为 Map', () => {
    const song: Song = {
      id: 'song-1',
      title: 'Song',
      lyrics: 'Hello',
      lineIds: ['line-1'],
      playKey: 'C',
      capo: 0,
      chordMap: new Map([['line_line-1_char_0', 'chord-1']]),
      version: 1,
    };

    // 落盘：Map 必须序列化为普通对象（直接 stringify Map 会得到 {}）
    const stored = JSON.parse(serializeForStorage(song));
    expect(stored.chordMap).toEqual({ 'line_line-1_char_0': 'chord-1' });

    // 读回：普通对象还原为 Map
    const result = sanitizePersistedData({ songs: [stored] });
    expect(result.songs[0].chordMap).toBeInstanceOf(Map);
    expect(result.songs[0].chordMap.get('line_line-1_char_0')).toBe('chord-1');
  });

  it('迁移旧版和弦顶层 capo -> fretOffset：合法旧值 2 保留为 fretOffset 2 且不再含 capo 字段', () => {
    const legacyChord = {
      id: 'chord-legacy',
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
      capo: 2,
      groupId: 'group-1',
      tuning: Tuning.STANDARD,
      rootStringIndex: 4,
    };

    const result = sanitizePersistedData({ groups: [group], chords: [legacyChord], songs: [] });

    expect(result.chords[0].fretOffset).toBe(2);
    expect(result.chords[0]).not.toHaveProperty('capo');
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
    expect(songStore.songs[0].chordMap).toEqual(new Map([['line_line-1_char_0', 'chord-1']]));
  });
});
