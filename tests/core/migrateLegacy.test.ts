// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chordRepository, songRepository } from '@/app/services/data';
import { transcribeLegacyLocalStorage } from '@/app/services/data/migrateLegacy';
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

describe('localStorage 退役转录（transcribeLegacyLocalStorage）', () => {
  beforeEach(async () => {
    localStorage.clear();
    await idb.clear('chords');
    await idb.clear('groups');
    await idb.clear('songs');
    await idb.clear('syncMeta');
    await idb.clear('kv');
    // 重置 kv 内存镜像（转录经 kvSet/kvGet 读写标记与偏好键）
    await hydrateIdbKv();
  });

  it('空旧数据：转录为空结果，清空 localStorage 并写入完成标记', async () => {
    localStorage.setItem('some-preference', 'value');

    const result = await transcribeLegacyLocalStorage();

    expect(result).toEqual({ groups: 0, chords: 0, songs: 0, kvKeys: 1 });
    expect(localStorage.getItem('some-preference')).toBeNull();
    expect(kvGet(RETIRED_FLAG_KEY)).toBe('1');
  });

  it('实体数据转录进 IDB（分组/和弦/歌曲与顺序索引），完成后清空 localStorage', async () => {
    localStorage.setItem(STORAGE_KEYS.GROUPS, JSON.stringify([group]));
    localStorage.setItem(STORAGE_KEYS.CHORD_LIST, JSON.stringify([chord]));
    localStorage.setItem(`${STORAGE_KEYS.SONG_ENTRY}:${song.id}`, JSON.stringify(song));
    localStorage.setItem(STORAGE_KEYS.SONGS_INDEX, JSON.stringify([song.id]));

    const result = await transcribeLegacyLocalStorage();

    expect(result).toEqual({ groups: 1, chords: 1, songs: 1, kvKeys: 0 });
    const snapshot = await chordRepository.load();
    expect(snapshot.groups).toHaveLength(1);
    expect(snapshot.chords).toHaveLength(1);
    const loadedSongs = await songRepository.loadSongs();
    expect(loadedSongs).toHaveLength(1);
    expect(loadedSongs[0]?.id).toBe('s1');
    expect(loadedSongs[0]?.chordMap).toEqual(new Map([['line_l1_char_0', 'c1']]));
    // 顺序索引按旧索引恢复
    expect(loadedSongs.map(s => s.id)).toEqual(['s1']);
    expect(localStorage.length).toBe(0);
  });

  it('单曲损坏时宽容清洗：跳过坏记录，保留其余歌曲', async () => {
    localStorage.setItem(`${STORAGE_KEYS.SONG_ENTRY}:bad`, '{broken');
    localStorage.setItem(`${STORAGE_KEYS.SONG_ENTRY}:s1`, JSON.stringify(song));

    const result = await transcribeLegacyLocalStorage();

    expect(result?.songs).toBe(1);
    const loadedSongs = await songRepository.loadSongs();
    expect(loadedSongs.map(s => s.id)).toEqual(['s1']);
  });

  it('重复转录是幂等的（第二次直接跳过，返回 null）', async () => {
    localStorage.setItem(STORAGE_KEYS.GROUPS, JSON.stringify([group]));
    const first = await transcribeLegacyLocalStorage();
    expect(first?.groups).toBe(1);

    const second = await transcribeLegacyLocalStorage();
    expect(second).toBeNull();
    expect(await chordRepository.load()).toMatchObject({ groups: [group], chords: [] });
  });

  it('根结构损坏时校验失败：保留 localStorage 现场以便重试，不写完成标记', async () => {
    // groups 非数组属于根结构损坏，lenient 模式也拒绝
    localStorage.setItem(STORAGE_KEYS.GROUPS, JSON.stringify('corrupt-not-array'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await transcribeLegacyLocalStorage();

    expect(result).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.GROUPS)).not.toBeNull();
    expect(kvGet(RETIRED_FLAG_KEY)).toBeNull();
    errorSpy.mockRestore();
  });

  it('偏好/UI 态键原样转录进 kv 镜像', async () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_TARGET, 'gitee');
    localStorage.setItem(STORAGE_KEYS.GH_OWNER, 'someone');

    const result = await transcribeLegacyLocalStorage();

    expect(result?.kvKeys).toBe(2);
    expect(kvGet(STORAGE_KEYS.SYNC_TARGET)).toBe('gitee');
    expect(kvGet(STORAGE_KEYS.GH_OWNER)).toBe('someone');
  });

  it('敏感键（WebDAV 密码）不转录、直接丢弃', async () => {
    localStorage.setItem(STORAGE_KEYS.WEBDAV_PASSWORD, 'old_plaintext_password');
    localStorage.setItem(STORAGE_KEYS.SYNC_TARGET, 'webdav');

    const result = await transcribeLegacyLocalStorage();

    expect(result?.kvKeys).toBe(1);
    expect(kvGet(STORAGE_KEYS.WEBDAV_PASSWORD)).toBeNull();
    expect(kvGet(STORAGE_KEYS.SYNC_TARGET)).toBe('webdav');
  });
});
