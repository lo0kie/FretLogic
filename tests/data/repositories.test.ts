// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chordRepository, songRepository } from '@/app/services/data';
import { toChordId, toGroupId } from '@/domains/chord/theory/entityFactories';
import { Tuning } from '@/domains/chord/theory/theory';
import { GroupSortRule } from '@/domains/chord/types';
import { toSongId } from '@/domains/score/model/scoreModel';
import { idb } from '@/platform/services/storage';

import type { Chord, Group } from '@/domains/chord/types';
import type { Song, SongId } from '@/domains/score/types';

/**
 * 夹具刻意保持「尚未清洗」的历史形态：分组无时间戳、和弦用 v7 之前的 chordName 字段而非 nameSegments。
 * 本文件验证的正是 load 侧清洗会补时间戳、从 chordName 派生 nameSegments、钳制越界品位并丢弃坏记录，
 * 一旦在夹具里补齐这些字段，被测分支就变成死代码——故仅在夹具处集中窄化为实体类型，运行时字段保持原样。
 */
const group = { id: toGroupId('g1'), name: 'C', sortRule: GroupSortRule.ROOT_PITCH } as Group;
const chord = {
  id: toChordId('c1'),
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
  groupId: toGroupId('g1'),
  tuning: Tuning.STANDARD,
  rootStringIndex: null,
} as unknown as Chord;
const song = {
  id: 's1',
  title: 'Song',
  lyrics: '',
  lineIds: [],
  playKey: 'C',
  capo: 0,
  chordMap: new Map(),
  version: 1,
} as unknown as Song;

/** 夹具窄化：仓储契约要 branded SongId，测试按字面量书写后集中转换一次 */
const songIds = (...values: string[]): SongId[] => values.map(toSongId);

describe('IDB 数据仓储（chordRepository / songRepository）', () => {
  beforeEach(async () => {
    await idb.clear('chords');
    await idb.clear('groups');
    await idb.clear('songs');
    await idb.clear('syncMeta');
    await idb.clear('kv');
  });

  it('chordRepository：分组与和弦经 load 清洗读回', async () => {
    // 两条刻意构造的坏记录：前者带 v7 之前的 capo 字段（应被既有 fretOffset 覆盖），后者仅有 id（应被丢弃）
    await chordRepository.save({
      groups: [group],
      chords: [{ ...chord, capo: 99 } as Chord, { id: toChordId('broken') } as Chord],
    });

    const result = await chordRepository.load();
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject(group);
    expect(result.chords).toHaveLength(1);
    expect(result.chords[0]!.fretOffset).toBe(0);
  });

  it('chordRepository：groups 与 chords 单事务同生共死（含失败注入）', async () => {
    await chordRepository.save({ groups: [group], chords: [chord] });

    // ① 机制：两个 store 必须在同一次事务里一起传入——这才是「同生共死」的实现依据
    // （事务模式不再经实参传入：runTx 只服务写入型事务，readwrite 在内部固定，见其签名注释）
    const txSpy = vi.spyOn(idb, 'runTx');
    await chordRepository.save({ groups: [], chords: [] });
    expect(txSpy).toHaveBeenCalledWith(['groups', 'chords'], expect.any(Function));
    txSpy.mockRestore();
    expect((await chordRepository.load()).groups).toEqual([]);

    // ② 原子性（原用例完全缺失的失败注入）：事务抛错 → 整体回滚，且镜像不更新
    await chordRepository.save({ groups: [group], chords: [chord] });
    const failSpy = vi.spyOn(idb, 'runTx').mockRejectedValueOnce(new Error('tx aborted'));
    await expect(chordRepository.save({ groups: [], chords: [] })).rejects.toThrow('tx aborted');
    failSpy.mockRestore();

    const after = await chordRepository.load();
    expect(after.groups).toHaveLength(1); // 失败即整体回滚，不留「groups 已清、chords 未清」的半提交态
    expect(after.groups[0]).toMatchObject(group);
  });

  it('songRepository：saveSong / removeSong / listSongIds', async () => {
    await songRepository.saveSong(song);
    await songRepository.saveSong({ ...song, id: toSongId('s2') });

    expect((await songRepository.loadSongs()).map(s => s.id).sort()).toEqual(['s1', 's2']);
    expect((await songRepository.listSongIds()).sort()).toEqual(['s1', 's2']);

    await songRepository.removeSong(toSongId('s1'));
    expect((await songRepository.loadSongs()).map(s => s.id)).toEqual(['s2']);
  });

  it('songRepository：顺序索引决定 loadSongs 顺序，索引漂移的记录兜底追加尾部', async () => {
    await songRepository.saveSong(song);
    await songRepository.saveSong({ ...song, id: toSongId('s2') });
    await songRepository.saveSongIds(songIds('s2', 's1'));

    expect((await songRepository.loadSongs()).map(s => s.id)).toEqual(['s2', 's1']);

    // 索引指向不存在的记录：命中者按索引序，未命中者不丢
    await songRepository.saveSongIds(songIds('s2', 'ghost'));
    expect((await songRepository.loadSongs()).map(s => s.id)).toEqual(['s2', 's1']);
  });

  it('songRepository：flushChanges 单事务原子落库（删除 + 脏歌曲 + 顺序索引）', async () => {
    await songRepository.saveSong(song);
    await songRepository.saveSong({ ...song, id: toSongId('s2') });

    await songRepository.flushChanges({
      removedIds: songIds('s2'),
      dirtySongs: [{ ...song, title: 'Renamed' }],
      orderIds: songIds('s1'),
    });

    const loaded = await songRepository.loadSongs();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.title).toBe('Renamed');
    expect((await songRepository.listSongIds()).sort()).toEqual(['s1']);
  });
});
