// @vitest-environment jsdom
/**
 * songStore.overwriteSongs 的全量覆盖语义（备份导入 / 云端拉取「覆盖本地」的落点）。
 *
 * 这个 action 此前零测试引用，而它是「以包为准」的唯一入口：内存里多出来的歌要删、包内的歌要落盘、
 * 顺序索引要跟着换、存储里残留的孤立记录也要清掉。判错的表现都是静默的——本地删过的歌被云端旧包
 * 灌回来，或者删掉的歌永远留在 IDB 里跟着下一次备份走。
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { useSongStore } from '@/domains/score/library/store/songStore';
import { toSongId } from '@/domains/score/model/scoreModel';
import { songRepository } from '@/domains/score/model/songRepository';
import { idb } from '@/platform/services/storage';
import { hydrateIdbKv } from '@/platform/services/storage/idbKv';

import type { LineId, Song, SongId } from '@/domains/score/types';

const toLineIds = (...values: string[]): LineId[] => values.map(v => v as LineId);

const buildSong = (id: string, title = `Song-${id}`): Song => ({
  id: toSongId(id),
  title,
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

const seedIds: SongId[] = ['s1', 's2', 's3'].map(toSongId);
const sorted = (ids: readonly SongId[]) => [...ids].sort();

describe('songStore.overwriteSongs 全量覆盖', () => {
  beforeEach(async () => {
    await idb.clear('chords');
    await idb.clear('groups');
    await idb.clear('songs');
    await idb.clear('syncMeta');
    await idb.clear('kv');
    await hydrateIdbKv();
    for (const id of seedIds) await songRepository.saveSong(buildSong(id));
    await songRepository.saveSongIds(seedIds);
    setActivePinia(createPinia());
    await useSongStore().hydrate();
  });

  it('以包为准：本地多出的歌被删除，包内的歌落盘且顺序按包内顺序', async () => {
    const songStore = useSongStore();

    // 包内只有 s2 的改版 + 一首新歌 s9；本地的 s1 / s3 不在包里，必须消失
    await songStore.overwriteSongs([buildSong('s2', '改过的 s2'), buildSong('s9')]);

    expect(songStore.songs.map(s => s.id)).toEqual([toSongId('s2'), toSongId('s9')]);
    expect(sorted(await songRepository.listSongIds())).toEqual(sorted([toSongId('s2'), toSongId('s9')]));
    expect(sorted((await songRepository.loadSongs()).map(s => s.id))).toEqual(sorted([toSongId('s2'), toSongId('s9')]));
    // 包内那首的改动确实落了盘（不只是进了内存）
    expect((await songRepository.loadSongs()).find(s => s.id === toSongId('s2'))?.title).toBe('改过的 s2');
  });

  it('存储里残留的孤立记录也一并清理（索引与记录都在、内存里却没有这一首）', async () => {
    const songStore = useSongStore();
    // 造「索引与记录都在、内存里却没有」的孤立歌曲：上一次落盘中断 / 换版本迁移都可能留下它。
    // 必须在 hydrate 之后再塞，否则它会随水合进内存，就测不到 orphan 那条分支了。
    await songRepository.saveSong(buildSong('ghost'));
    await songRepository.saveSongIds([...seedIds, toSongId('ghost')]);

    await songStore.overwriteSongs([buildSong('s1')]);

    expect(songStore.songs.map(s => s.id)).toEqual([toSongId('s1')]);
    // 记录必须被清掉：ghost 既不在内存、也不在任何脏集合里，只有 orphan 那条扫描能删到它。
    // 顺序索引 meta 本来就会被整体重写（flushChanges 的 orderIds），所以它测不出这条分支。
    expect(await idb.getAllKeys('songs')).not.toContain('ghost');
  });
});
