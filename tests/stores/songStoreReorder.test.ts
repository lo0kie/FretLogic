// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { useSongStore } from '@/domains/score/library/store/songStore';
import { toSongId } from '@/domains/score/model/scoreModel';
import { songRepository } from '@/domains/score/model/songRepository';
import { idb } from '@/platform/services/storage';
import { hydrateIdbKv } from '@/platform/services/storage/idbKv';

import type { LineId, Song, SongId } from '@/domains/score/types';

/** 夹具窄化：lineId 在源码里是 branded string，测试按字面量书写后集中转换一次（每次调用返回新数组，保持歌曲间引用隔离） */
const toLineIds = (...values: string[]): LineId[] => values.map(v => v as LineId);

const buildSong = (id: string): Song => ({
  id: toSongId(id),
  title: `Song-${id}`,
  singer: '',
  originalKey: '',
  timeSignature: '',
  lyrics: 'la',
  lineIds: toLineIds('l1'),
  playKey: 'C',
  capo: 0,
  chordMap: new Map(),
  version: 1,
  createdAt: 1,
  updatedAt: 1,
});

/** 夹具窄化：仓储 id 契约为 branded SongId，与 toLineIds 同一形态集中注入 */
const seedIds: SongId[] = ['s1', 's2', 's3'].map(toSongId);

describe('songStore.reorderSongs 排序不应删除数据', () => {
  beforeEach(async () => {
    // 种子直接进 IDB（IDB 是唯一权威存储），再经 hydrate() 水合进 store
    await idb.clear('chords');
    await idb.clear('groups');
    await idb.clear('songs');
    await idb.clear('syncMeta');
    await idb.clear('kv');
    await hydrateIdbKv();
    for (const id of seedIds) {
      await songRepository.saveSong(buildSong(id));
    }
    await songRepository.saveSongIds(seedIds);
    setActivePinia(createPinia());
    await useSongStore().hydrate();
  });

  it('重排顺序后，三首歌都还在（含 IDB 记录与顺序索引）', async () => {
    const songStore = useSongStore();
    const [a, b, c] = [...songStore.songs];

    songStore.reorderSongs([c!, a!, b!]);
    await songStore.flushSongsNow();

    expect(songStore.songs.map(s => s.id)).toEqual([c!.id, a!.id, b!.id]);
    expect(songStore.songs).toHaveLength(3);
    expect((await songRepository.listSongIds()).sort()).toEqual(seedIds);
    expect((await songRepository.loadSongs()).map(s => s.id)).toEqual([c!.id, a!.id, b!.id]);
  });

  it('传入不完整集合时拒绝重排，不删除任何歌曲', async () => {
    const songStore = useSongStore();
    const [a] = [...songStore.songs];

    songStore.reorderSongs([a!]);
    await songStore.flushSongsNow();

    expect(songStore.songs.map(s => s.id)).toEqual(seedIds);
    expect(songStore.songs).toHaveLength(3);
    expect((await songRepository.listSongIds()).sort()).toEqual(seedIds);
  });

  it('删除乐谱后支持 undoDeleteSong 恢复到原位置', async () => {
    const songStore = useSongStore();
    const [a, b, c] = [...songStore.songs];

    // 删除第 2 首 (b)
    songStore.deleteSong(b!.id);
    expect(songStore.songs.map(s => s.id)).toEqual([a!.id, c!.id]);

    // 撤销删除
    const restored = songStore.undoDeleteSong();
    expect(restored?.id).toBe(b!.id);
    expect(songStore.songs.map(s => s.id)).toEqual([a!.id, b!.id, c!.id]);

    await songStore.flushSongsNow();
    expect((await songRepository.loadSongs()).map(s => s.id)).toEqual(['s1', 's2', 's3']);
  });

  it('restoreSong 能准确将歌曲恢复至指定索引', async () => {
    const songStore = useSongStore();
    const [a, b, c] = [...songStore.songs];

    songStore.deleteSong(a!.id);
    expect(songStore.songs.map(s => s.id)).toEqual([b!.id, c!.id]);

    songStore.restoreSong(a!, 0);
    expect(songStore.songs.map(s => s.id)).toEqual([a!.id, b!.id, c!.id]);

    await songStore.flushSongsNow();
    expect((await songRepository.loadSongs()).map(s => s.id)).toEqual(['s1', 's2', 's3']);
  });
});
