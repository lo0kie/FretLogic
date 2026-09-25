// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chordRepository, songRepository } from '@/app/services/data';
import { transcribeLegacyLocalStorage } from '@/app/services/data/migrateLegacy';
import { idb } from '@/platform/services/storage';
import { hydrateIdbKv, kvGet } from '@/platform/services/storage/idbKv';
import { STORAGE_KEYS } from '@/platform/utils/constants';

import type { LineId, Song } from '@/domains/score/types';

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

  it('空旧数据：转录为空结果，只清除自家键并写入完成标记', async () => {
    localStorage.setItem(STORAGE_KEYS.EDITING_ID, 'value');
    // 同源共域可能部署了别的应用：无 CHORD_LAB_ 前缀的键既不转录进 kv、也不得被清除
    localStorage.setItem('other-app-preference', 'value');

    const result = await transcribeLegacyLocalStorage();

    expect(result).toEqual({ groups: 0, chords: 0, songs: 0, kvKeys: 1 });
    expect(kvGet(STORAGE_KEYS.EDITING_ID)).toBe('value');
    expect(localStorage.getItem(STORAGE_KEYS.EDITING_ID)).toBeNull();
    expect(localStorage.getItem('other-app-preference')).toBe('value');
    expect(kvGet(RETIRED_FLAG_KEY)).toBe('1');
  });

  it('实体数据转录进 IDB（分组/和弦/歌曲与顺序索引），完成后清空 localStorage', async () => {
    // SongId 是品牌类型，测试夹具按上方 song 的既有风格用双重断言构造
    const song2 = { ...song, id: 's2', title: 'Song2' } as unknown as Song;
    localStorage.setItem(STORAGE_KEYS.GROUPS, JSON.stringify([group]));
    localStorage.setItem(STORAGE_KEYS.CHORD_LIST, JSON.stringify([chord]));
    localStorage.setItem(`${STORAGE_KEYS.SONG_ENTRY}:${song.id}`, JSON.stringify(song));
    localStorage.setItem(`${STORAGE_KEYS.SONG_ENTRY}:${song2.id}`, JSON.stringify(song2));
    // 索引刻意与键写入顺序相反：只有真正读回旧 SONGS_INDEX 才会得到 s2 在前的顺序
    localStorage.setItem(STORAGE_KEYS.SONGS_INDEX, JSON.stringify(['s2', 's1']));

    const result = await transcribeLegacyLocalStorage();

    expect(result).toEqual({ groups: 1, chords: 1, songs: 2, kvKeys: 0 });
    const snapshot = await chordRepository.load();
    expect(snapshot.groups).toHaveLength(1);
    expect(snapshot.chords).toHaveLength(1);
    const loadedSongs = await songRepository.loadSongs();
    expect(loadedSongs).toHaveLength(2);
    // 顺序索引按旧索引恢复（而非键插入顺序 s1,s2）
    expect(loadedSongs.map(s => s.id)).toEqual(['s2', 's1']);
    // 旧扁平槽位经转录清洗归一为嵌套结构
    const s1 = loadedSongs.find(s => s.id === 's1');
    expect(s1?.chordMap.size).toBe(1);
    expect(s1?.chordMap.get('l1' as LineId)).toEqual({
      char: new Map([[0, 'c1']]),
      start: [],
      end: [],
    });
    expect(localStorage.length).toBe(0);
  });

  it('单曲损坏时宽容清洗：跳过坏记录，保留其余歌曲', async () => {
    localStorage.setItem(`${STORAGE_KEYS.SONG_ENTRY}:bad`, '{broken');
    localStorage.setItem(`${STORAGE_KEYS.SONG_ENTRY}:s1`, JSON.stringify(song));

    const result = await transcribeLegacyLocalStorage();

    expect(result?.songs).toBe(1);
    const loadedSongs = await songRepository.loadSongs();
    expect(loadedSongs.map(s => s.id)).toEqual(['s1']);
    // 源键判据（2026-09-24 定稿）：按「字节是否可用」分流，不按「是否转录成功」。
    //  :bad 是写坏的字节 —— 内容本就不可用，删掉不损失信息（日志会如实记名「不可恢复」）；
    //  :s1 已进 IDB —— 它的记录另有副本，源键可以清。
    // 对照：内容完好却没过校验的分片**不删**，见下一条用例。
    expect(localStorage.getItem(`${STORAGE_KEYS.SONG_ENTRY}:bad`)).toBeNull();
    expect(localStorage.getItem(`${STORAGE_KEYS.SONG_ENTRY}:s1`)).toBeNull();
  });

  it('仅有损坏分片时：照常退役并清除该分片（空快照下回读核验恒真，拦不住这一类）', async () => {
    localStorage.setItem(`${STORAGE_KEYS.SONG_ENTRY}:bad`, '{broken');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await transcribeLegacyLocalStorage();

    // 解析失败的分片进不了 rawSongs ⇒ hasEntityData 为假 ⇒ 期望计数全零，核验「0 < 0 为假 + 空数组 every 恒真」
    // 于是恒过 —— 核验拦不住这一类，故本用例守的从来不是核验，而是源码判据本身。
    // 此前它断言「坏分片必须留下」，那是退役前运行时**还会**回读 localStorage 时代的护栏；
    // 如今那条护栏保护的是一个再也读不到的字节串，故按新口径改为断言清除。
    // 记录在案：这是有意接受的不可逆（原守卫的唯一数据副本就此消失）。
    expect(result?.songs).toBe(0);
    expect(localStorage.getItem(`${STORAGE_KEYS.SONG_ENTRY}:bad`)).toBeNull();
    expect(kvGet(RETIRED_FLAG_KEY)).toBe('1');
    warnSpy.mockRestore();
  });

  it('内容完好但过不了校验的分片保留源键（丢弃后 expected 随之变小，总数核验察觉不到）', async () => {
    // 结构不合法（缺 title）⇒ 过不了 songGateSchema，被 lenient 模式静默跳过。
    // 但它的**字节是完好的**（parseJson 拿得到对象），只是缺字段 ⇒ 按新口径保留源键：
    // 回读核验看不见这一类（expected 随丢弃一起变小），故源键是唯一还留着这首歌内容的副本。
    localStorage.setItem(`${STORAGE_KEYS.SONG_ENTRY}:ghost`, JSON.stringify({ id: 'ghost' }));
    localStorage.setItem(`${STORAGE_KEYS.SONG_ENTRY}:s1`, JSON.stringify(song));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await transcribeLegacyLocalStorage();

    expect(result?.songs).toBe(1);
    expect(localStorage.getItem(`${STORAGE_KEYS.SONG_ENTRY}:ghost`)).not.toBeNull();
    // 已进 IDB 的那条仍随退役清掉（它的记录另有副本）
    expect(localStorage.getItem(`${STORAGE_KEYS.SONG_ENTRY}:s1`)).toBeNull();
    warnSpy.mockRestore();
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

  // 偏好/UI 态键原样转录进 kv 镜像（两个普通键同批转录，计数须如实反映两个）
  it('敏感键（WebDAV 密码）不转录、直接丢弃，普通偏好键全部原样进 kv', async () => {
    localStorage.setItem(STORAGE_KEYS.WEBDAV_PASSWORD, 'old_plaintext_password');
    localStorage.setItem(STORAGE_KEYS.SYNC_TARGET, 'webdav');
    localStorage.setItem(STORAGE_KEYS.GH_OWNER, 'someone');

    const result = await transcribeLegacyLocalStorage();

    expect(result?.kvKeys).toBe(2);
    expect(kvGet(STORAGE_KEYS.WEBDAV_PASSWORD)).toBeNull();
    expect(kvGet(STORAGE_KEYS.SYNC_TARGET)).toBe('webdav');
    expect(kvGet(STORAGE_KEYS.GH_OWNER)).toBe('someone');
  });
});
