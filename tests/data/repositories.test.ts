import { beforeEach, describe, expect, it } from 'vitest';

import { createChordRepository, createSongRepository } from '@/app/services/repositories';

import type { Chord, Group } from '@/domains/chord/types';
import type { Song } from '@/domains/score/types';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    if (value.includes('quota-error')) throw new DOMException('quota exceeded', 'QuotaExceededError');
    this.map.set(key, value);
  }
}

const group: Group = { id: 'g1', name: 'C', sortRule: 'ROOT_PITCH' };
const chord: Chord = {
  id: 'c1',
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
  fretOffset: 0,
  groupId: 'g1',
  tuning: 'STANDARD',
  rootStringIndex: null,
};
const song: Song = {
  id: 's1',
  title: 'Song',
  lyrics: '',
  lineIds: [],
  playKey: 'C',
  capo: 0,
  chordMap: {},
  version: 1,
};

describe('data repositories', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    localStorage.clear();
  });

  it('loads sanitized chords and groups', () => {
    storage.setItem('CHORD_LAB_GROUPS', JSON.stringify([group]));
    storage.setItem('CHORD_LAB_LIST_V4', JSON.stringify([{ ...chord, capo: 99 }, { id: 'broken' }]));
    const repository = createChordRepository(storage);
    const result = repository.load();

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject(group);
    expect(result.chords[0].fretOffset).toBe(0);
    expect(result.chords).toHaveLength(1);
  });

  it('returns empty data for corrupt JSON', () => {
    storage.setItem('CHORD_LAB_GROUPS', '{bad');
    storage.setItem('CHORD_LAB_LIST_V4', '[broken');
    const repository = createChordRepository(storage);

    expect(repository.load()).toEqual({ groups: [], chords: [] });
  });

  it('saves and removes songs through split keys', () => {
    const repository = createSongRepository(storage);
    repository.saveSong(song);

    const loadedSongs = repository.loadSongs();
    expect(loadedSongs).toHaveLength(1);
    expect(loadedSongs[0]).toMatchObject(song);

    repository.removeSong('s1');
    expect(repository.loadSongs()).toEqual([]);
  });

  it('maps quota errors to a structured persistence failure', () => {
    const repository = createSongRepository(storage);
    expect(() => repository.saveSong({ ...song, title: 'quota-error' })).toThrowError('PERSISTENCE_QUOTA_EXCEEDED');
  });
});
