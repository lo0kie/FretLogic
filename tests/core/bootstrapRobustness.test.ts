import { describe, expect, it, vi } from 'vitest';

import { songRepository } from '@/app/services/data';
import { bootstrapDataLayer, syncLocalStorageToIdb } from '@/app/services/data/bootstrap';
import { idb } from '@/platform/services/storage';
import { STORAGE_KEYS } from '@/platform/utils/constants';
import { logger } from '@/platform/utils/logger';

import type { Group } from '@/domains/chord/types';
import type { Song } from '@/domains/score/types';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
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
    this.map.set(key, value);
  }
}

describe('数据层启动契约', () => {
  it('回填失败时保留 localStorage 原有资产且记录错误', async () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEYS.SONGS_INDEX, JSON.stringify(['s1']));
    storage.setItem(`${STORAGE_KEYS.SONG_ENTRY}:s1`, JSON.stringify({ id: 's1' }));
    const errorSpy = import.meta.env.VITEST ? vi.spyOn(logger, 'error').mockImplementation(() => {}) : undefined;
    await idb.clear('songs');
    const original = songRepository.loadSongs;
    songRepository.loadSongs = () => {
      throw new Error('IDB unavailable');
    };
    try {
      await expect(bootstrapDataLayer(storage)).resolves.toBeUndefined();
    } finally {
      songRepository.loadSongs = original;
      errorSpy?.mockRestore();
    }
    expect(storage.getItem(STORAGE_KEYS.SONGS_INDEX)).toContain('s1');
  });

  it('退出同步不会因单曲损坏而丢失其他歌曲', async () => {
    const storage = new MemoryStorage();
    const group: Group = { id: 'g1', name: 'C', sortRule: 'ROOT_PITCH' };
    const validSong: Song = {
      id: 's1',
      title: 'Song',
      lyrics: '',
      lineIds: [],
      playKey: 'C',
      capo: 0,
      chordMap: {},
      version: 1,
    };
    storage.setItem(STORAGE_KEYS.GROUPS, JSON.stringify([group]));
    storage.setItem(STORAGE_KEYS.CHORD_LIST, '[]');
    storage.setItem(`${STORAGE_KEYS.SONG_ENTRY}:bad`, '{broken');
    storage.setItem(`${STORAGE_KEYS.SONG_ENTRY}:s1`, JSON.stringify(validSong));
    await syncLocalStorageToIdb(storage);
    const songs = await songRepository.loadSongs();
    expect(songs).toHaveLength(1);
    expect(songs[0]?.id).toBe('s1');
  });
});
