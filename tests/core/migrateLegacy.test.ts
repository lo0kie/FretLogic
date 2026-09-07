import { beforeEach, describe, expect, it } from 'vitest';

import { chordRepository, songRepository } from '@/app/services/data';
import { isLegacyMigrationDone, migrateLegacyData } from '@/app/services/data/migrateLegacy';
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

describe('legacy localStorage migration', () => {
  let storage: MemoryStorage;

  beforeEach(async () => {
    storage = new MemoryStorage();
    await idb.clear('chords');
    await idb.clear('groups');
    await idb.clear('songs');
    await idb.clear('syncMeta');
  });

  it('空旧数据迁移后标记完成，结果为空', async () => {
    const result = await migrateLegacyData(storage);
    expect(result).toEqual({ groups: 0, chords: 0, songs: 0 });
    expect(await isLegacyMigrationDone()).toBe(true);
  });

  it('迁移旧键数据到 IDB', async () => {
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

    const result = await migrateLegacyData(storage);
    expect(result).toEqual({ groups: 1, chords: 1, songs: 1 });
    expect(await chordRepository.loadGroups()).toHaveLength(1);
    expect(await chordRepository.loadChords()).toHaveLength(1);
    const loadedSongs = await songRepository.loadSongs();
    expect(loadedSongs).toHaveLength(1);
    expect(loadedSongs[0]?.id).toBe('s1');
    expect(loadedSongs[0]?.chordMap).toEqual(new Map([['line_l1_char_0', 'c1']]));
  });

  it('重复迁移是幂等的（第二次直接跳过）', async () => {
    storage.setItem('CHORD_LAB_GROUPS', JSON.stringify([{ id: 'g1', name: 'C', sortRule: 'ROOT_PITCH' }]));
    await migrateLegacyData(storage);
    const second = await migrateLegacyData(storage);
    expect(second).toEqual({ groups: 0, chords: 0, songs: 0 });
    expect(await chordRepository.loadGroups()).toHaveLength(1);
  });

  it('旧数据校验失败时不标记完成，允许后续排查或重试', async () => {
    // 写入损坏的 groups（非数组或非法结构导致校验失败）
    storage.setItem('CHORD_LAB_GROUPS', JSON.stringify('corrupt-not-array'));
    const result = await migrateLegacyData(storage);
    expect(result).toEqual({ groups: 0, chords: 0, songs: 0 });
    expect(await isLegacyMigrationDone()).toBe(false);
  });
});
