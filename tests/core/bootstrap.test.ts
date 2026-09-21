// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { chordRepository, songRepository } from '@/app/services/data';
import { bootstrapDataLayer } from '@/app/services/data/bootstrap';
import { toChordId, toGroupId } from '@/domains/chord/theory/entityFactories';
import { nameToSegments, Tuning } from '@/domains/chord/theory/theory';
import { GroupSortRule } from '@/domains/chord/types';
import { idb } from '@/platform/services/storage';
import { hydrateIdbKv, kvGet } from '@/platform/services/storage/idbKv';
import { STORAGE_KEYS } from '@/platform/utils/constants';

import type { Group } from '@/domains/chord/types';
import type { Song } from '@/domains/score/types';

/** 转录完成标记（存于 kv 镜像）—— 与 migrateLegacy.ts 保持一致 */
const RETIRED_FLAG_KEY = 'localStorage-retired';

const group: Group = {
  id: toGroupId('g1'),
  name: 'C',
  sortRule: GroupSortRule.ROOT_PITCH,
  createdAt: 1,
  updatedAt: 1,
};
const chord = {
  id: toChordId('c1'),
  nameSegments: nameToSegments('C'),
  strings: [
    { fret: -1, preferFlat: false },
    { fret: 3, preferFlat: false },
    { fret: 2, preferFlat: false },
    { fret: 0, preferFlat: false },
    { fret: 1, preferFlat: false },
    { fret: 0, preferFlat: false },
  ],
  fretCount: 3 as const,
  fretOffset: 0 as const,
  groupId: toGroupId('g1'),
  tuning: Tuning.STANDARD,
  rootStringIndex: null,
  createdAt: 1,
  updatedAt: 1,
};
/** 刻意保持历史形态：chordMap 为裸对象、无时间戳（as unknown 绕过类型）。
 *  注意：bootstrapDataLayer 只做 kv 水合 + 旧 localStorage 转录（bootstrap.ts:19-26），
 *  不含任何 chordMap 清洗——本夹具的用途是「验证引导不改动 IDB 已有数据」，与清洗无关 */
const song = {
  id: 's1',
  title: 'Song',
  lyrics: 'C  G',
  lineIds: ['l1'],
  playKey: 'C',
  capo: 0,
  chordMap: { line_l1_char_0: 'c1' },
  version: 1,
} as unknown as Song;

describe('bootstrap 数据层引导', () => {
  beforeEach(async () => {
    localStorage.clear();
    await idb.clear('chords');
    await idb.clear('groups');
    await idb.clear('songs');
    await idb.clear('syncMeta');
    await idb.clear('kv');
    await hydrateIdbKv();
  });

  it('IDB 是唯一权威存储：引导后既有数据原样保留，localStorage 不参与回填', async () => {
    await chordRepository.save({ groups: [group], chords: [chord] });
    await songRepository.saveSong(song);

    await bootstrapDataLayer();

    const snapshot = await chordRepository.load();
    // 不只断条数：引导层若把数据搬走或改写，条数仍可能是 1；必须断内容原样保留
    expect(snapshot.groups).toHaveLength(1);
    expect(snapshot.groups[0]!.name).toBe(group.name);
    expect(snapshot.chords).toHaveLength(1);
    expect(snapshot.chords[0]!.id).toBe(chord.id);
    expect(snapshot.chords[0]!.nameSegments).toEqual(chord.nameSegments);
    const songs = await songRepository.loadSongs();
    expect(songs).toHaveLength(1);
    expect(songs[0]!.id).toBe(song.id);
    expect(songs[0]!.title).toBe(song.title);
  });

  it('localStorage 有旧数据时引导完成转录并清空', async () => {
    localStorage.setItem(STORAGE_KEYS.GROUPS, JSON.stringify([group]));
    localStorage.setItem(`${STORAGE_KEYS.SONG_ENTRY}:${song.id}`, JSON.stringify(song));

    await bootstrapDataLayer();

    const snapshot = await chordRepository.load();
    expect(snapshot.groups).toHaveLength(1);
    expect(await songRepository.loadSongs()).toHaveLength(1);
    expect(localStorage.length).toBe(0);
    expect(kvGet(RETIRED_FLAG_KEY)).toBe('1');
  });

  it('转录幂等：完成后再次出现旧键不会二次搬移或覆盖 IDB', async () => {
    localStorage.setItem(STORAGE_KEYS.GROUPS, JSON.stringify([group]));
    await bootstrapDataLayer();

    // 模拟旧键「复活」（如用户从旧备份恢复了浏览器数据）
    localStorage.setItem(STORAGE_KEYS.GROUPS, JSON.stringify([{ id: 'stale', name: 'X', sortRule: 'ROOT_PITCH' }]));

    await bootstrapDataLayer();

    const snapshot = await chordRepository.load();
    expect(snapshot.groups.map(g => g.id)).toEqual(['g1']);
  });
});
