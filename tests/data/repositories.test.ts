// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { chordRepository, songRepository } from '@/app/services/data';
import { idb } from '@/platform/services/storage';

import type { Chord, Group } from '@/domains/chord/types';
import type { Song } from '@/domains/score/types';

const group: Group = { id: 'g1', name: 'C', sortRule: 'ROOT_PITCH' };
const chord: Chord = {
  id: 'c1',
  chordName: 'C',
  strings: [
    { fret: -1, preferFlat: false },
    { fret: 3, preferFlat: false },
    { fret: 2, preferFlat: false },
    { fret: 0, preferFlat: false },
    { fret: 1, preferFlat: false },
    { fret: 0, preferFlat: false },
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
  chordMap: new Map(),
  version: 1,
} as unknown as Song;

describe('IDB 数据仓储（chordRepository / songRepository）', () => {
  beforeEach(async () => {
    await idb.clear('chords');
    await idb.clear('groups');
    await idb.clear('songs');
    await idb.clear('syncMeta');
    await idb.clear('kv');
  });

  it('chordRepository：分组与和弦经 load 清洗读回', async () => {
    await chordRepository.save({ groups: [group], chords: [{ ...chord, capo: 99 }, { id: 'broken' }] });

    const result = await chordRepository.load();
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject(group);
    expect(result.chords[0].fretOffset).toBe(0);
    expect(result.chords).toHaveLength(1);
  });

  it('chordRepository：groups 与 chords 单事务同生共死', async () => {
    await chordRepository.save({ groups: [group], chords: [chord] });
    await chordRepository.save({ groups: [], chords: [] });

    const result = await chordRepository.load();
    expect(result.groups).toEqual([]);
    expect(result.chords).toEqual([]);
  });

  it('songRepository：saveSong / removeSong / listSongIds', async () => {
    await songRepository.saveSong(song);
    await songRepository.saveSong({ ...song, id: 's2' });

    expect((await songRepository.loadSongs()).map(s => s.id).sort()).toEqual(['s1', 's2']);
    expect((await songRepository.listSongIds()).sort()).toEqual(['s1', 's2']);

    await songRepository.removeSong('s1');
    expect((await songRepository.loadSongs()).map(s => s.id)).toEqual(['s2']);
  });

  it('songRepository：顺序索引决定 loadSongs 顺序，索引漂移的记录兜底追加尾部', async () => {
    await songRepository.saveSong(song);
    await songRepository.saveSong({ ...song, id: 's2' });
    await songRepository.saveSongIds(['s2', 's1']);

    expect((await songRepository.loadSongs()).map(s => s.id)).toEqual(['s2', 's1']);

    // 索引指向不存在的记录：命中者按索引序，未命中者不丢
    await songRepository.saveSongIds(['s2', 'ghost']);
    expect((await songRepository.loadSongs()).map(s => s.id)).toEqual(['s2', 's1']);
  });

  it('songRepository：flushChanges 单事务原子落库（删除 + 脏歌曲 + 顺序索引）', async () => {
    await songRepository.saveSong(song);
    await songRepository.saveSong({ ...song, id: 's2' });

    await songRepository.flushChanges({
      removedIds: ['s2'],
      dirtySongs: [{ ...song, title: 'Renamed' }],
      orderIds: ['s1'],
    });

    const loaded = await songRepository.loadSongs();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.title).toBe('Renamed');
    expect((await songRepository.listSongIds()).sort()).toEqual(['s1']);
  });
});
