// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chordRepository, songRepository } from '@/app/services/data';
import { toChordId, toGroupId } from '@/domains/chord/theory/entityFactories';
import { nameToSegments, Tuning } from '@/domains/chord/theory/theory';
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
    // 从 chordName 派生 nameSegments 是本文件头声明的清洗职责之一，此前只断了长度 ——
    // 派生出来是个空分片也照样绿。期望值由**同一个派生器**给出，不写死字面量。
    expect(result.chords[0]!.nameSegments).toEqual(nameToSegments('C'));
    expect(result.chords[0]!.fretOffset).toBe(0);
  });

  /**
   * 指纹去重的多重复场景（三条同内容同分组）—— 此前只有两条的用例，去重表在「第三条」上的
   * 行为没有任何断言：只保留首条、其余两条都要进 mergedIds（乐谱槽位引用据它重定向），
   * 少一条映射就等于有一个槽位指向了被丢弃的 id。
   */
  it('chordRepository：三条指纹相同的记录只保留一条，其余全部进重定向映射', async () => {
    const dup = (id: string) => ({ ...chord, id: toChordId(id) });
    await chordRepository.save({ groups: [group], chords: [dup('c1'), dup('c2'), dup('c3')] });

    const result = await chordRepository.load();
    expect(result.chords.map(c => c.id)).toEqual(['c1']);
    // mergedIds 在类型上是可选的（无去重发生时缺省）；此用例刻意构造重复，缺失即失败
    expect([...result.mergedIds!.entries()].sort()).toEqual([
      ['c2', 'c1'],
      ['c3', 'c1'],
    ]);
  });

  /**
   * 分组拖拽顺序的持久化锚点。
   *
   * IDB 的 getAll 按**主键序**返回，而分组主键是随机 id；实体 put 又只按 id 覆盖、不带顺序 ——
   * 顺序信息全部压在那条 syncMeta 索引记录上（与 songs 的 'song-order' 同源）。
   * 夹具刻意取「索引序 ≠ 主键序」的两个 id（ga / gz）：索引没写或 load 没读时拿到的是主键序
   * ga, gz，断言立刻红；若取一对顺序恰好一致的 id，这条用例就测不出任何东西。
   */
  it('chordRepository：分组顺序经 syncMeta 索引往返（不回落到主键序）', async () => {
    const ga = { ...group, id: toGroupId('ga'), name: 'A' } as Group;
    const gz = { ...group, id: toGroupId('gz'), name: 'Z' } as Group;

    await chordRepository.save({ groups: [gz, ga], chords: [] });

    const loaded = await chordRepository.load();
    expect(loaded.groups.map(g => g.id)).toEqual(['gz', 'ga']);
  });

  it('chordRepository：groups 与 chords 单事务同生共死（含失败注入）', async () => {
    await chordRepository.save({ groups: [group], chords: [chord] });

    // ① 机制：三个 store 必须在同一次事务里一起传入——这才是「同生共死」的实现依据。
    // 除 groups / chords 两个实体库外还有 syncMeta：分组顺序（拖拽排序）只有那一条索引记录承载
    // （实体 put 按 id 覆盖、不带顺序，IDB 的 getAll 又按主键序返回），顺序索引必须与实体同事务。
    // （事务模式不再经实参传入：runTx 只服务写入型事务，readwrite 在内部固定，见其签名注释）
    const txSpy = vi.spyOn(idb, 'runTx');
    await chordRepository.save({ groups: [], chords: [] });
    expect(txSpy).toHaveBeenCalledWith(['groups', 'chords', 'syncMeta'], expect.any(Function));
    txSpy.mockRestore();
    expect((await chordRepository.load()).groups).toEqual([]);

    // ② 原子性（原用例完全缺失的失败注入）
    await chordRepository.save({ groups: [group], chords: [chord] });

    // ②-a 真实事务中途失败：先**真的写入**、再抛错 → 已写入的部分必须被 IDB 回滚。
    //      原写法 `mockRejectedValueOnce` 只是让 runTx 立刻 reject，事务回调根本不执行 ——
    //      全程没有任何写入发生，「失败即整体回滚、不留半提交态」就成了恒真的空断言。
    await expect(
      idb.runTx(['groups', 'chords'], get => {
        const request = get('groups').delete(group.id);
        // idb 把 put/delete 包成了 Promise（不是原生 IDBRequest），而事务随后会被 abort ⇒ 这个
        // promise 必然 reject。fn 是同步签名、没法 await，必须就地吞掉：放任不管在 fake-indexeddb
        // 下就是一条未处理拒绝，整个测试文件会被判失败，把真正的断言结果一起盖掉。
        if (request instanceof Promise) void request.catch(() => {});
        throw new Error('tx aborted');
      })
      // 业务错误被 guard 归一成存储错误后抛出（见 idb.runTx 的错误包装）；此处只锁「必须抛」，
      // 回滚与否由下一行断言 —— 那才是本用例的靶子
    ).rejects.toThrow('事务失败');
    expect((await idb.getAll('groups')).some(g => g.id === group.id)).toBe(true);

    // ②-b 仓储层的失败注入：事务失败时**镜像不得更新**。它的可观测后果是「下一次 save 仍按旧镜像
    //      发出删除」—— 若失败时镜像被错误地改成空，下一次 save 会以为磁盘上已无记录、不发 delete，
    //      记录就永久残留（这正是镜像存在的意义）。
    const failSpy = vi.spyOn(idb, 'runTx').mockRejectedValueOnce(new Error('tx aborted'));
    await expect(chordRepository.save({ groups: [], chords: [] })).rejects.toThrow('tx aborted');
    failSpy.mockRestore();

    await chordRepository.save({ groups: [], chords: [] });
    expect((await chordRepository.load()).groups).toEqual([]);
  });

  // 落库后的「读回全部 / 读回索引」分别由下面两条覆盖，此处只留 removeSong 自身的契约：
  // 删除后该记录不再出现在落库结果里
  it('songRepository：removeSong 后落库不再出现该记录', async () => {
    await songRepository.saveSong(song);
    await songRepository.saveSong({ ...song, id: toSongId('s2') });

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
