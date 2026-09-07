// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { syncLocalStorageToIdb } from '@/app/services/data/bootstrap';
import { chordRepository, songRepository } from '@/app/services/data/repositories';

import type { Song } from '@/domains/score/types';

const song: Song = {
  id: 's1',
  title: 'Song',
  lyrics: 'la',
  lineIds: ['l1'],
  playKey: 'C',
  capo: 0,
  chordMap: new Map(),
  version: 1,
  createdAt: 1,
  updatedAt: 1,
};

describe('syncLocalStorageToIdb 备份写入守卫', () => {
  beforeEach(async () => {
    localStorage.clear();
    await idbClearAll();
  });

  it('localStorage 为空时不得清空 IDB 里已有的备份', async () => {
    await songRepository.saveSongs([song]);
    expect(await songRepository.loadSongs()).toHaveLength(1);

    // localStorage 无任何数据（例如被用户清空或读取失败）
    await syncLocalStorageToIdb(localStorage);

    expect(await songRepository.loadSongs()).toHaveLength(1);
  });

  it('localStorage 有数据时正常覆盖备份', async () => {
    localStorage.setItem('CHORD_LAB_SONGS_INDEX_V1', JSON.stringify([song.id]));
    localStorage.setItem(`CHORD_LAB_SONG_ENTRY_V1:${song.id}`, JSON.stringify({ ...song, chordMap: {} }));

    await syncLocalStorageToIdb(localStorage);

    expect(await songRepository.loadSongs()).toHaveLength(1);
  });
});

async function idbClearAll() {
  await songRepository.saveSongs([]);
  await chordRepository.saveGroups([]);
  await chordRepository.saveChords([]);
}
