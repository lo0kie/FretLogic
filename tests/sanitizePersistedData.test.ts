import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sanitizePersistedData } from '@/app/services/validation/persistedData';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { buildGroupVariant, toChordId, toGroupId } from '@/domains/chord/theory/entityFactories';
import { Tuning } from '@/domains/chord/theory/theory';
import { GroupSortRule } from '@/domains/chord/types';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { toSongId } from '@/domains/score/model/scoreModel';
import { idb } from '@/platform/services/storage/idb';
import { serializeForStorage } from '@/platform/utils/common';

import type { Chord, Group } from '@/domains/chord/types';
import type { LineId, Song } from '@/domains/score/types';

// 存储已迁移为 IDB 唯一权威：store 启动数据链路 = idb.getAll → repository.load（清洗+去重）→ store.hydrate。
// 清洗责任在 repository.load 内部（sanitizeChordLibrary / sanitizeSongList），因此本文件
// mock 的必须是 **IDB 层** 而非 repository——mock repository 会把清洗层一并 mock 掉，
// 喂进去的脏数据原样穿过 store（此前两版都栽在这里：先「mock 里调 sanitize」同义反复，
// 后「mock load 直吐脏数据」绕过清洗）。mock IDB 后走的是与生产完全相同的真实链路。
vi.mock('@/platform/services/storage/idb', async importOriginal => {
  const actual = await importOriginal<typeof import('@/platform/services/storage/idb')>();
  return {
    ...actual,
    idb: {
      ...actual.idb,
      getAll: vi.fn(async () => []),
      get: vi.fn(async () => undefined),
      getAllKeys: vi.fn(async () => []),
      put: vi.fn(async () => 0),
      delete: vi.fn(async () => undefined),
      clear: vi.fn(async () => undefined),
      runTx: vi.fn(async (_names: string[], fn: (get: (n: string) => unknown) => void) => {
        fn(() => ({}));
      }),
    },
  };
});

/** 分组夹具走 src 工厂：GroupId 品牌化与 ROOT_PITCH 判别分支由 buildGroupVariant 保证 */
const group = buildGroupVariant({ id: 'group-1', name: 'C' }, GroupSortRule.ROOT_PITCH);
const validChord: Chord = {
  id: toChordId('chord-1'),
  nameSegments: { root: ['C', 0] },
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
  groupId: toGroupId('group-1'),
  tuning: Tuning.STANDARD,
  rootStringIndex: 4,
  // 0 = 仓库既有的「时间戳缺失」哨兵值（见 buildGroupVariant），由清洗层识别并递增补全
  createdAt: 0,
  updatedAt: 0,
};

/** 故意构造的落盘脏数据（琴弦写成字符串）：经 as unknown as Chord 才能进 IDB mock 的记录类型 */
const brokenStoredChord = { ...validChord, id: 'bad', strings: 'broken' } as unknown as Chord;

describe('sanitizePersistedData', () => {
  it('removes invalid persisted chords and prunes orphan song references', () => {
    const invalidChord = { ...validChord, id: 'chord-2', strings: 'broken' } as unknown as Chord;
    const song: Song = {
      id: 'song-1',
      title: 'Song',
      lyrics: '',
      lineIds: ['line-1'],
      playKey: 'C',
      capo: 0,
      // 旧扁平槽位对象：载入清洗层归一为嵌套结构后按行剪枝孤儿引用
      chordMap: { 'line_line-1_char_0': 'chord-1', 'line_line-1_char_1': 'missing' },
      version: 1,
    } as unknown as Song;

    const result = sanitizePersistedData({
      groups: [group, null],
      chords: [validChord, invalidChord],
      songs: [song],
    });

    expect(result.groups).toHaveLength(1);
    expect(result.chords).toHaveLength(1);
    expect(result.chords[0]!.id).toBe('chord-1');
    expect(result.chords[0]!.strings).toEqual(validChord.strings);
    expect(result.songs[0]?.chordMap.size).toBe(1);
    expect(result.songs[0]?.chordMap.get('line-1' as LineId)).toEqual({
      char: new Map([[0, 'chord-1']]),
      start: [],
      end: [],
    });
  });

  it('deduplicates identical fingerprints within one group', () => {
    // 指纹以 groupId 打头、不含 id：同组同指法即使 id 不同也应合并，且保留先出现的那条
    const sameShapeOtherId: Chord = { ...validChord, id: toChordId('chord-2') };
    const result = sanitizePersistedData({ groups: [group], chords: [validChord, sameShapeOtherId] });
    expect(result.chords).toHaveLength(1);
    expect(result.chords[0]?.id).toBe(validChord.id);
  });

  it('does not merge identical shapes across different groups', () => {
    const group2 = buildGroupVariant({ id: 'group-2', name: 'G' }, GroupSortRule.ROOT_PITCH);
    const otherGroupChord: Chord = { ...validChord, id: toChordId('chord-2'), groupId: toGroupId('group-2') };
    const result = sanitizePersistedData({ groups: [group, group2], chords: [validChord, otherGroupChord] });
    // 指纹打头是 groupId：跨组同指法互不判重
    expect(result.chords).toHaveLength(2);
  });

  it('preserves score chord bindings when loading a song without a chord library snapshot', () => {
    const song: Song = {
      id: 'song-1',
      title: 'Song',
      lyrics: 'Hello',
      lineIds: ['line-1'],
      playKey: 'C',
      capo: 0,
      chordMap: { 'line_line-1_char_0': 'chord-1' },
      version: 1,
    } as unknown as Song;

    const result = sanitizePersistedData({ groups: [], chords: null, songs: [song] });

    expect(result.songs[0]?.chordMap.size).toBe(1);
    expect(result.songs[0]?.chordMap.get('line-1' as LineId)).toEqual({
      char: new Map([[0, 'chord-1']]),
      start: [],
      end: [],
    });
  });

  it('分组缺失时间戳时按数组顺序递增补全', () => {
    const before = Date.now();
    const result = sanitizePersistedData({
      groups: [
        { id: 'g1', name: 'C' },
        { id: 'g2', name: 'D' },
        { id: 'g3', name: 'E' },
      ],
      chords: [],
      songs: [],
    });

    const created = result.groups.map(g => g.createdAt);
    expect(created.every(ts => typeof ts === 'number' && Number.isFinite(ts))).toBe(true);
    expect(created[0]!).toBeGreaterThanOrEqual(before);
    expect(created[0]!).toBeLessThan(created[1]!);
    expect(created[1]!).toBeLessThan(created[2]!);
  });

  it('和弦缺失时间戳时按数组顺序递增补全', () => {
    const secondChord = {
      ...validChord,
      id: 'chord-2',
      strings: [
        { fret: -1, preferFlat: false },
        { fret: 0, preferFlat: false },
        { fret: 2, preferFlat: false },
        { fret: 0, preferFlat: false },
        { fret: 1, preferFlat: false },
        { fret: 0, preferFlat: false },
      ],
    } as unknown as Chord;

    const result = sanitizePersistedData({ groups: [group], chords: [validChord, secondChord] });

    expect(result.chords).toHaveLength(2);
    expect(result.chords[0]!.createdAt!).toBeLessThan(result.chords[1]!.createdAt!);
  });

  it('乐谱缺失时间戳时按数组顺序递增补全', () => {
    const buildSong = (id: string): Song => ({
      id: toSongId(id),
      title: `Song-${id}`,
      singer: '',
      originalKey: '',
      timeSignature: '',
      lyrics: '',
      lineIds: [],
      playKey: 'C',
      capo: 0,
      chordMap: new Map(),
      version: 1,
      // 同上：0 表示时间戳缺失，交给清洗层递增补全
      createdAt: 0,
      updatedAt: 0,
    });

    const result = sanitizePersistedData({ groups: [], chords: [], songs: [buildSong('s1'), buildSong('s2')] });

    expect(result.songs).toHaveLength(2);
    expect(result.songs[0]!.createdAt!).toBeLessThan(result.songs[1]!.createdAt!);
  });

  it('已有时间戳保持不变，updatedAt 缺失时回退为 createdAt', () => {
    const result = sanitizePersistedData({
      groups: [
        { id: 'g1', name: 'C' },
        { id: 'g2', name: 'D', createdAt: 1000, updatedAt: 2000 },
      ],
      chords: [],
      songs: [],
    });

    // 补出来的必须是真实时间戳：只比「两者相等」在两个值都是 undefined 时也成立（同义反复）
    expect(result.groups[0]?.createdAt).toBeGreaterThan(0);
    expect(result.groups[0]?.updatedAt).toBe(result.groups[0]?.createdAt);
    expect(result.groups[1]?.createdAt).toBe(1000);
    expect(result.groups[1]?.updatedAt).toBe(2000);
  });

  it('非法时间戳视为缺失并参与递增补全', () => {
    const rawGroups = [
      { id: 'g1', name: 'C', createdAt: 'not-a-number' },
      { id: 'g2', name: 'D', createdAt: Number.NaN },
    ] as unknown as Group[];

    const result = sanitizePersistedData({ groups: rawGroups, chords: [], songs: [] });

    expect(result.groups).toHaveLength(2);
    expect(Number.isFinite(result.groups[0]!.createdAt)).toBe(true);
    expect(result.groups[1]!.createdAt).toBeGreaterThan(result.groups[0]!.createdAt);
  });

  it('chordMap 序列化往返：嵌套 Map 落盘为对象，读回还原为嵌套 Map', () => {
    const song: Song = {
      id: 'song-1',
      title: 'Song',
      lyrics: 'Hello',
      lineIds: ['line-1'],
      playKey: 'C',
      capo: 0,
      chordMap: new Map([['line-1', { char: new Map([[0, 'chord-1']]), start: [], end: [] }]]),
      version: 1,
    } as unknown as Song;

    // 落盘：嵌套 Map 必须序列化为普通对象（直接 stringify Map 会得到 {}）
    const stored = JSON.parse(serializeForStorage(song));
    expect(stored.chordMap).toEqual({ 'line-1': { char: { '0': 'chord-1' }, start: [], end: [] } });

    // 读回：普通对象还原为嵌套 Map
    const result = sanitizePersistedData({ songs: [stored] });
    expect(result.songs[0]?.chordMap).toBeInstanceOf(Map);
    expect(result.songs[0]?.chordMap.get('line-1' as LineId)?.char.get(0)).toBe('chord-1');
  });

  it('迁移旧版和弦顶层 capo -> fretOffset：合法旧值 2 保留为 fretOffset 2 且不再含 capo 字段', () => {
    const legacyChord = {
      id: 'chord-legacy',
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
      capo: 2,
      groupId: 'group-1',
      tuning: Tuning.STANDARD,
      rootStringIndex: 4,
    };

    const result = sanitizePersistedData({ groups: [group], chords: [legacyChord], songs: [] });

    expect(result.chords[0]?.fretOffset).toBe(2);
    expect(result.chords[0]).not.toHaveProperty('capo');
  });
});

describe('store startup sanitization', () => {
  beforeEach(() => {
    vi.mocked(idb.getAll).mockClear();
    vi.mocked(idb.getAll).mockImplementation(async () => []);
    vi.mocked(idb.get).mockImplementation(async () => undefined);
  });

  it('cleans malformed chord data during hydrate before exposing it', async () => {
    // 脏数据从 IDB 层进入：真实链路 = idb.getAll → chordRepository.load（sanitizeChordLibrary
    // 清洗+去重）→ chordStore.hydrate。mock 掉 load 会连清洗层一起 mock 掉（见文件头说明）
    vi.mocked(idb.getAll).mockImplementation(async (store: string) =>
      store === 'groups' ? [group] : store === 'chords' ? [validChord, brokenStoredChord] : []
    );
    setActivePinia(createPinia());
    const chordStore = useChordStore();
    await chordStore.hydrate();

    // 幸存者必须是合法那条：脏记录（strings 写成字符串）被丢弃，而非数量对但内容错
    expect(chordStore.savedChordsList).toHaveLength(1);
    expect(chordStore.savedChordsList[0]?.id).toBe(validChord.id);
  });

  it('cleans malformed song data during hydrate before exposing it', async () => {
    // 同上：脏 Song 从 IDB 层进入，经 songRepository.loadSongs 内的 sanitizeSongList 清洗
    vi.mocked(idb.getAll).mockImplementation(async (store: string) =>
      store === 'songs'
        ? [
            {
              id: 'song-1',
              title: 'Song',
              lyrics: 'Hello',
              lineIds: ['line-1', 42],
              playKey: 'C',
              capo: 99,
              chordMap: { 'line_line-1_char_0': 'chord-1' },
            } as unknown as Song,
          ]
        : []
    );
    setActivePinia(createPinia());
    const songStore = useSongStore();
    await songStore.hydrate();

    expect(songStore.songs).toHaveLength(1);
    expect(songStore.songs[0]!.capo).toBe(0);
    expect(songStore.songs[0]!.lineIds).toEqual(['line-1']);
    expect(songStore.songs[0]!.chordMap.size).toBe(1);
    expect(songStore.songs[0]!.chordMap.get('line-1' as LineId)).toEqual({
      char: new Map([[0, 'chord-1']]),
      start: [],
      end: [],
    });
  });
});
