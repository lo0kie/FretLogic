// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { createSongRepository } from '@/app/services/repositories';
import { useSongStore } from '@/domains/score/library/store/songStore';

import type { Song } from '@/domains/score/types';

const SONG_ENTRY_PREFIX = 'CHORD_LAB_SONG_ENTRY_V1:';

const buildSong = (id: string): Song => ({
  id,
  title: `Song-${id}`,
  lyrics: 'la',
  lineIds: ['l1'],
  playKey: 'C',
  capo: 0,
  chordMap: new Map(),
  version: 1,
  createdAt: 1,
  updatedAt: 1,
});

const seedIds = ['s1', 's2', 's3'];

describe('songStore.reorderSongs 排序不应删除数据', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('CHORD_LAB_SONGS_INDEX_V1', JSON.stringify(seedIds));
    for (const id of seedIds) {
      localStorage.setItem(`${SONG_ENTRY_PREFIX}${id}`, JSON.stringify(buildSong(id)));
    }
    setActivePinia(createPinia());
  });

  it('重排顺序后，三首歌都还在（含存储键）', () => {
    const songStore = useSongStore();
    const songRepository = createSongRepository(localStorage);
    const [a, b, c] = [...songStore.songs];

    songStore.reorderSongs([c!, a!, b!]);

    expect(songStore.songs.map(s => s.id)).toEqual([c!.id, a!.id, b!.id]);
    expect(songStore.songs).toHaveLength(3);
    expect(songRepository.listSongIds().sort()).toEqual(seedIds);
  });

  it('传入不完整集合时拒绝重排，不删除任何歌曲', () => {
    const songStore = useSongStore();
    const songRepository = createSongRepository(localStorage);
    const [a] = [...songStore.songs];

    songStore.reorderSongs([a!]);

    expect(songStore.songs.map(s => s.id)).toEqual(seedIds);
    expect(songStore.songs).toHaveLength(3);
    expect(songRepository.listSongIds().sort()).toEqual(seedIds);
  });

  it('删除乐谱后支持 undoDeleteSong 恢复到原位置', () => {
    const songStore = useSongStore();
    const [a, b, c] = [...songStore.songs];

    // 删除第 2 首 (b)
    songStore.deleteSong(b!.id);
    expect(songStore.songs.map(s => s.id)).toEqual([a!.id, c!.id]);

    // 撤销删除
    const restored = songStore.undoDeleteSong();
    expect(restored?.id).toBe(b!.id);
    expect(songStore.songs.map(s => s.id)).toEqual([a!.id, b!.id, c!.id]);
  });

  it('restoreSong 能准确将歌曲恢复至指定索引', () => {
    const songStore = useSongStore();
    const [a, b, c] = [...songStore.songs];

    songStore.deleteSong(a!.id);
    expect(songStore.songs.map(s => s.id)).toEqual([b!.id, c!.id]);

    songStore.restoreSong(a!, 0);
    expect(songStore.songs.map(s => s.id)).toEqual([a!.id, b!.id, c!.id]);
  });
});
