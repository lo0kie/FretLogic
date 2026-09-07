import { beforeEach, describe, expect, it } from 'vitest';

import { chordRepository, songRepository } from '@/app/services/data';
import { bootstrapDataLayer, syncLocalStorageToIdb } from '@/app/services/data/bootstrap';
import { idb } from '@/platform/services/storage';

import type { Song } from '@/domains/score/types';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
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

const song: Song = {
  id: 's1',
  title: 'Song',
  lyrics: 'C  G',
  lineIds: ['l1'],
  playKey: 'C',
  capo: 0,
  chordMap: { line_l1_char_0: 'c1' },
  version: 1,
};

describe('bootstrap 数据层引导', () => {
  let storage: MemoryStorage;

  beforeEach(async () => {
    storage = new MemoryStorage();
    await idb.clear('chords');
    await idb.clear('groups');
    await idb.clear('songs');
    await idb.clear('syncMeta');
    await idb.put('syncMeta', { name: 'legacy-migration-done', done: true });
  });

  it('IndexedDB 仅作备份，启动时不再回填 localStorage（清空后数据不会"复活"）', async () => {
    // 预置 IDB 数据（模拟已有备份）
    await chordRepository.saveGroups([{ id: 'g1', name: 'C', sortRule: 'ROOT_PITCH' }]);
    await chordRepository.saveChords([
      {
        id: 'c1',
        chordName: 'C',
        strings: [
          [-1, false],
          [3, false],
          [2, false],
          [0, false],
          [1, false],
          [0, false],
        ],
        fretCount: 3,
        fretOffset: 0,
        groupId: 'g1',
        tuning: 'STANDARD',
        rootStringIndex: null,
      },
    ]);
    await songRepository.saveSong(song);

    await bootstrapDataLayer(storage);

    // IDB 纯备份不回填：localStorage 保持为空，清空后数据不会"复活"
    expect(storage.getItem('CHORD_LAB_GROUPS')).toBeNull();
    expect(storage.getItem('CHORD_LAB_LIST_V4')).toBeNull();
    expect(storage.getItem('CHORD_LAB_SONGS_INDEX_V1')).toBeNull();
    expect(storage.getItem('CHORD_LAB_SONG_ENTRY_V1:s1')).toBeNull();
  });

  it('localStorage 有数据时同步到 IDB（权威备份）', async () => {
    storage.setItem('CHORD_LAB_GROUPS', JSON.stringify([{ id: 'g1', name: 'C', sortRule: 'ROOT_PITCH' }]));
    storage.setItem(
      'CHORD_LAB_LIST_V4',
      JSON.stringify([
        {
          id: 'c1',
          chordName: 'C',
          strings: [
            [-1, false],
            [3, false],
            [2, false],
            [0, false],
            [1, false],
            [0, false],
          ],
          fretCount: 3,
          fretOffset: 0,
          groupId: 'g1',
          tuning: 'STANDARD',
          rootStringIndex: null,
        },
      ])
    );
    storage.setItem(`CHORD_LAB_SONG_ENTRY_V1:${song.id}`, JSON.stringify(song));

    await syncLocalStorageToIdb(storage);

    expect(await chordRepository.loadGroups()).toHaveLength(1);
    expect(await chordRepository.loadChords()).toHaveLength(1);
    expect(await songRepository.loadSongs()).toEqual([song]);
  });

  it('IDB 曲库为空时保留 localStorage 歌曲（localStorage 是实时权威源）', async () => {
    await chordRepository.saveGroups([{ id: 'g1', name: 'C', sortRule: 'ROOT_PITCH' }]);
    storage.setItem('CHORD_LAB_SONGS_INDEX_V1', JSON.stringify(['stale']));
    storage.setItem('CHORD_LAB_SONG_ENTRY_V1:stale', JSON.stringify({ ...song, id: 'stale' }));

    await bootstrapDataLayer(storage);

    // IDB 为空只代表备份尚未同步，不得据此清空 localStorage 的实时数据（避免刷新竞态丢数据）
    expect(storage.getItem('CHORD_LAB_SONGS_INDEX_V1')).toContain('stale');
    expect(storage.getItem('CHORD_LAB_SONG_ENTRY_V1:stale')).toBeTruthy();
  });
});
