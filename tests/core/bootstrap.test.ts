// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { chordRepository, songRepository } from '@/app/services/data';
import { bootstrapDataLayer } from '@/app/services/data/bootstrap';
import { idb } from '@/platform/services/storage';
import { hydrateIdbKv, kvGet } from '@/platform/services/storage/idbKv';
import { STORAGE_KEYS } from '@/platform/utils/constants';

import type { Song } from '@/domains/score/types';

/** 转录完成标记（存于 kv 镜像）—— 与 migrateLegacy.ts 保持一致 */
const RETIRED_FLAG_KEY = 'localStorage-retired';

const group = { id: 'g1', name: 'C', sortRule: 'ROOT_PITCH' };
const chord = {
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
    expect(snapshot.groups).toHaveLength(1);
    expect(snapshot.chords).toHaveLength(1);
    expect(await songRepository.loadSongs()).toHaveLength(1);
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
