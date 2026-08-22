import { beforeEach, describe, expect, it } from 'vitest';
import { idb } from '@/core/storage';
import { chordRepository, songRepository, settingsRepository } from '@/core/data';
import { createDefaultSettings, createDefaultSyncMeta } from '@/core/data';
import type { Chord, Group, Song } from '@/types';

const group: Group = { id: 'g1', name: 'C', sortRule: 'ROOT_PITCH' };
const chord: Chord = {
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
  capo: 0,
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
};

describe('v2 data repositories (IndexedDB)', () => {
  beforeEach(async () => {
    await idb.clear('chords');
    await idb.clear('groups');
    await idb.clear('songs');
    await idb.clear('settings');
    await idb.clear('syncMeta');
  });

  it('保存并读取和弦库', async () => {
    await chordRepository.saveGroups([group]);
    await chordRepository.saveChords([chord]);
    expect(await chordRepository.loadGroups()).toEqual([group]);
    expect(await chordRepository.loadChords()).toEqual([chord]);
  });

  it('saveGroups 为全量替换语义', async () => {
    await chordRepository.saveGroups([group]);
    await chordRepository.saveGroups([]);
    expect(await chordRepository.loadGroups()).toEqual([]);
  });

  it('保存、删除歌曲', async () => {
    await songRepository.saveSong(song);
    expect(await songRepository.loadSongs()).toEqual([song]);
    await songRepository.removeSong('s1');
    expect(await songRepository.loadSongs()).toEqual([]);
  });

  it('settings 未写入时返回默认值', async () => {
    const settings = await settingsRepository.loadSettings();
    expect(settings).toEqual(createDefaultSettings());
  });

  it('settings 可写可读', async () => {
    const settings = createDefaultSettings();
    settings.github.owner = 'me';
    settings.score.fontScale = 1.4;
    await settingsRepository.saveSettings(settings);
    expect(await settingsRepository.loadSettings()).toEqual(settings);
  });

  it('syncMeta 未写入时返回默认值', async () => {
    expect(await settingsRepository.loadSyncMeta()).toEqual(createDefaultSyncMeta());
  });

  it('syncMeta 可写可读', async () => {
    const meta = createDefaultSyncMeta();
    meta.lastSyncAt = '2026-08-22T00:00:00Z';
    await settingsRepository.saveSyncMeta(meta);
    expect(await settingsRepository.loadSyncMeta()).toEqual(meta);
  });
});
