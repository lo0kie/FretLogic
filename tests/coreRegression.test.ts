import { describe, expect, it } from 'vitest';
import { validateImportExportPayload } from '@/services/validation/payload';
import { analyzeChordGraph } from '@/services/music/chordEngine';
import { computeSongKey } from '@/utils/music/musicTheory';

const legacyPayload = {
  chords: [
    {
      id: 1,
      chordName: ' C ',
      strings: [
        { fret: -1, preferFlat: false },
        { fret: 3, preferFlat: false },
        { fret: 2, preferFlat: false },
        { fret: 0, preferFlat: false },
        { fret: 1, preferFlat: false },
        { fret: 0, preferFlat: false },
      ],
      fretCount: 3,
      capo: 0,
      groupId: 'g1',
      tuning: 'STANDARD',
    },
  ],
  songs: [{ id: 's1', title: 'Legacy', key: 'G', lyrics: '', capo: 2, chordMap: {}, lineIds: [] }],
};

describe('backup payload migration', () => {
  it('migrates legacy string objects and song keys', () => {
    const result = validateImportExportPayload({
      version: 2,
      groups: [{ id: 'g1', name: 'C', sortRule: 'ROOT_PITCH' }],
      ...legacyPayload,
    });

    expect(result.isValid).toBe(true);
    expect(result.payload?.version).toBe(5);
    expect(result.payload?.chords[0].id).toBe('1');
    expect(result.payload?.chords[0].strings[0]).toEqual([-1, false]);
    expect(result.payload?.songs[0].playKey).toBe('G');
    expect(result.payload?.songs[0]).not.toHaveProperty('key');
  });

  it('syncSettings 随备份往返：合法字段保留，非法字段丢弃', () => {
    const base = {
      version: 5,
      groups: [],
      chords: [],
      songs: [],
    };
    const result = validateImportExportPayload({
      ...base,
      syncSettings: {
        syncTarget: 'webdav',
        webdavServerUrl: 'https://dav.jianguoyun.com/dav/',
        webdavPassword: 123 as unknown as string, // 非字符串 → 丢弃
        evilField: 'x', // 未知字段 → 丢弃
      },
    });
    expect(result.isValid).toBe(true);
    expect(result.payload?.syncSettings).toEqual({
      syncTarget: 'webdav',
      webdavServerUrl: 'https://dav.jianguoyun.com/dav/',
    });

    // 完全损坏的 syncSettings → 整体丢弃，不影响导入
    const bad = validateImportExportPayload({ ...base, syncSettings: 'garbage' });
    expect(bad.isValid).toBe(true);
    expect(bad.payload?.syncSettings).toBeUndefined();

    // 无 syncSettings 的旧包 → 字段缺省
    const legacy = validateImportExportPayload({ version: 4, groups: [], chords: [], songs: [] });
    expect(legacy.isValid).toBe(true);
    expect(legacy.payload?.syncSettings).toBeUndefined();
  });
});

describe('chord engine', () => {
  it('identifies an explicit C major triad and derives song keys', () => {
    const analysis = analyzeChordGraph(
      [
        { stringIndex: 3, pitchIndex: 0, label: 'C' },
        { stringIndex: 4, pitchIndex: 4, label: 'E' },
        { stringIndex: 5, pitchIndex: 7, label: 'G' },
      ],
      0
    );

    expect(analysis.best?.chordName).toBe('C');
    expect(analysis.bestRootPitch).toBe(0);
    expect(computeSongKey('G', 2)).toBe('A');
  });
});
