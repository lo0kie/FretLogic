// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

  // 同一条「按记录索引恢复原位」的两组取值：删中间一首走 undoDeleteSong，删首首走显式 restoreSong
  // （后者同时钉住 index=0 的插入边界）
  it.each([
    { label: '删除第 2 首后 undoDeleteSong 恢复到原位置', removedIndex: 1, viaUndo: true },
    { label: '删除第 1 首后 restoreSong 恢复至索引 0', removedIndex: 0, viaUndo: false },
  ])('$label', async ({ removedIndex, viaUndo }) => {
    const songStore = useSongStore();
    const songs = [...songStore.songs];
    const removed = songs[removedIndex]!;

    songStore.deleteSong(removed.id);
    expect(songStore.songs.map(s => s.id)).toEqual(songs.filter(song => song.id !== removed.id).map(song => song.id));

    if (viaUndo) expect(songStore.undoDeleteSong()?.id).toBe(removed.id);
    else songStore.restoreSong(removed, removedIndex);
    expect(songStore.songs.map(s => s.id)).toEqual(songs.map(s => s.id));

    await songStore.flushSongsNow();
    expect((await songRepository.loadSongs()).map(s => s.id)).toEqual(['s1', 's2', 's3']);
  });

  it('传入同一批对象时只更新顺序索引，不逐首重写歌曲内容', async () => {
    const songStore = useSongStore();
    const [a, b, c] = [...songStore.songs];
    const flushSpy = vi.spyOn(songRepository, 'flushChanges');

    songStore.reorderSongs([c!, a!, b!]);
    await songStore.flushSongsNow();

    // 顺序信息完全由索引键承载、歌曲内容一无所变 ⇒ 只送 orderIds、不送任何 dirtySong：
    // 否则拖拽一次就要把全库每首歌重新序列化（且每首内部还要 parse 索引键做 O(N) 查找），
    // 与「按歌曲拆分持久化」的初衷相反
    const lastCall = flushSpy.mock.calls.at(-1)?.[0];
    expect(lastCall?.dirtySongs).toEqual([]);
    expect(lastCall?.orderIds).toEqual([c!.id, a!.id, b!.id]);
    flushSpy.mockRestore();
  });

  it('传入新对象时退回逐首标脏，夹带的内容变更不得被静默丢掉', async () => {
    const songStore = useSongStore();
    const [a, b, c] = [...songStore.songs];
    const flushSpy = vi.spyOn(songRepository, 'flushChanges');

    // 调用契约是「传 songs 里的同一批对象、仅顺序不同」；传新对象说明调用方可能夹带了内容变更，
    // 此时只标索引脏就会把那些变更留在内存里永不落盘 —— 故整批退回逐首标脏
    const renamed = { ...c!, title: '改过的标题' };
    songStore.reorderSongs([renamed, a!, b!]);
    await songStore.flushSongsNow();

    const lastCall = flushSpy.mock.calls.at(-1)?.[0];
    expect(lastCall?.dirtySongs?.map(s => s.id).sort()).toEqual([a!.id, b!.id, c!.id].sort());
    // 且改动真的落了盘（不只是进了脏集合）
    expect((await songRepository.loadSongs()).find(s => s.id === c!.id)?.title).toBe('改过的标题');
    flushSpy.mockRestore();
  });
});
