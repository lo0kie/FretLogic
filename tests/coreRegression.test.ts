import { describe, expect, it } from 'vitest';

import { validateImportExportPayload } from '@/app/services/validation/payload';
import { analyzeChordGraph } from '@/domains/chord/theory/chordEngine';
import { computeSongKey } from '@/domains/chord/theory/theory';

// 原先此处有 legacyPayload 夹具与 'migrates legacy string objects and song keys' 用例，一并删除：
// 该用例与 payloadValidation.test.ts 的两条同源用例重复且更弱——
//   · v2 迁移（对象数组 strings + 数字 id → 字符串 id）：payloadValidation.test.ts:92-118
//   · v3 迁移（song.key → playKey）：payloadValidation.test.ts:152-162
// 两者走同一个 validateImportExportPayload，重复覆盖无新增保障

describe('backup payload migration', () => {
  it('syncSettings 随备份往返：判别联合结构，合法字段保留，非法字段丢弃', () => {
    const base = {
      version: 5,
      groups: [],
      chords: [],
      songs: [],
    };
    // 新结构（v7 起）：判别联合按 kind 分组
    const result = validateImportExportPayload({
      ...base,
      syncSettings: {
        kind: 'webdav',
        serverUrl: 'https://dav.jianguoyun.com/dav/',
        password: 123 as unknown as string, // 非字符串 → 丢弃
        evilField: 'x', // 未知字段 → 丢弃
      },
    });
    expect(result.isValid).toBe(true);
    expect(result.payload?.syncSettings).toEqual({
      kind: 'webdav',
      serverUrl: 'https://dav.jianguoyun.com/dav/',
    });

    // 旧扁平形态（v7 前）：{ syncTarget, webdavServerUrl, ... } → 归一化为判别联合
    const legacyNormalized = validateImportExportPayload({
      ...base,
      syncSettings: {
        syncTarget: 'webdav',
        webdavServerUrl: 'https://dav.jianguoyun.com/dav/',
        webdavUseProxy: true, // 旧字段名 → 折叠到 useDefaultProxy
      },
    });
    expect(legacyNormalized.isValid).toBe(true);
    expect(legacyNormalized.payload?.syncSettings).toEqual({
      kind: 'webdav',
      serverUrl: 'https://dav.jianguoyun.com/dav/',
      useDefaultProxy: true,
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
