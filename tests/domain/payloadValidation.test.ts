import { describe, expect, it } from 'vitest';

import { parseAndValidatePayload, validateImportExportPayload } from '@/app/services/validation/payload';
import { sanitizePersistedData } from '@/app/services/validation/persistedData';

const group = { id: 'g1', name: 'C', sortRule: 'ROOT_PITCH' };
const strings = [
  { fret: -1, preferFlat: false },
  { fret: 3, preferFlat: false },
  { fret: 2, preferFlat: false },
  { fret: 0, preferFlat: false },
  { fret: 1, preferFlat: false },
  { fret: 0, preferFlat: false },
];

describe('payload validation migration matrix', () => {
  it('migrates v1 through current without derived fields', () => {
    const result = validateImportExportPayload({
      groups: [{ ...group, collapsed: true }],
      chords: [
        {
          id: 'c1',
          chordName: 'C',
          strings,
          fretCount: 3,
          fretOffset: 0,
          groupId: 'g1',
          tuning: 'STANDARD',
          isInverted: false,
          fingerprint: 'old',
        },
      ],
      songs: [],
    });

    expect(result.isValid).toBe(true);
    expect(result.payload?.version).toBe(7);
    expect(result.payload?.groups[0]).not.toHaveProperty('collapsed');
    expect(result.payload?.chords[0]).not.toHaveProperty('isInverted');
    expect(result.payload?.chords[0]).not.toHaveProperty('fingerprint');
  });

  it('preserves rootStringIndex for both v7 object strings and legacy tuple strings', () => {
    // 回归:导入链路先把旧元组琴弦迁移为对象(migratePayloadVersion v6→v7),而根音标记推导
    // 曾只认元组形态——两条载入路径(导入 / IDB 载入)的 rootStringIndex 都会被清成 null,
    // 表现为「导入旧数据后根音标记丢失」。
    const legacyTuples = [
      [-1, 0],
      [3, 0],
      [2, 0],
      [0, 0],
      [1, 0],
      [0, 0],
    ];
    const result = validateImportExportPayload({
      version: 6,
      groups: [group],
      chords: [
        {
          id: 'c1',
          chordName: 'C',
          strings: legacyTuples,
          fretCount: 3,
          fretOffset: 0,
          groupId: 'g1',
          tuning: 'STANDARD',
          rootStringIndex: 1,
        },
        {
          id: 'c2',
          chordName: 'C',
          // 改一个品位避免与 c1 指纹相同(同组重复指纹会被去重器丢弃,与本测试无关)
          strings: strings.map((s, i) => ({ ...s, fret: i === 5 ? 3 : s.fret })),
          fretCount: 3,
          fretOffset: 0,
          groupId: 'g1',
          tuning: 'STANDARD',
          rootStringIndex: 1,
        },
      ],
      songs: [],
    });

    expect(result.isValid).toBe(true);
    expect(result.payload?.chords[0]?.rootStringIndex).toBe(1); // 旧元组形态
    expect(result.payload?.chords[1]?.rootStringIndex).toBe(1); // v7 对象形态
  });

  it('migrates v2 object strings and numeric ids', () => {
    const result = validateImportExportPayload({
      version: 2,
      groups: [group],
      chords: [
        {
          id: 7,
          chordName: 'C',
          // v2 格式：对象数组 [{fret, preferFlat}]
          strings: [
            { fret: -1, preferFlat: false },
            { fret: 1, preferFlat: true },
            { fret: 0, preferFlat: false },
          ],
          fretCount: 3,
          fretOffset: 0,
          groupId: 'g1',
          tuning: 'STANDARD',
        },
      ],
      songs: [],
    });

    expect(result.isValid).toBe(true);
    expect(result.payload?.chords[0].id).toBe('7');
    expect(result.payload?.chords[0].strings[0]).toEqual({ fret: -1, preferFlat: false });
  });

  it('v6->v7 迁移：二维元组琴弦转为对象型', () => {
    const result = validateImportExportPayload({
      version: 6,
      groups: [group],
      chords: [
        {
          id: 'c1',
          chordName: 'C',
          // v6 旧格式：二维元组 [[fret, preferFlat]]
          strings: [
            [-1, false],
            [3, true],
            [0, false],
          ],
          fretCount: 3,
          fretOffset: 0,
          groupId: 'g1',
          tuning: 'STANDARD',
        },
      ],
      songs: [],
    });

    expect(result.isValid).toBe(true);
    expect(result.payload?.version).toBe(7);
    expect(result.payload?.chords[0].strings).toEqual([
      { fret: -1, preferFlat: false },
      { fret: 3, preferFlat: true },
      { fret: 0, preferFlat: false },
    ]);
  });

  it('migrates legacy song key to playKey at v3', () => {
    const result = validateImportExportPayload({
      version: 3,
      groups: [group],
      chords: [],
      songs: [{ id: 's1', title: 'Legacy', key: 'G', lyrics: '', capo: 2, chordMap: {}, lineIds: [] }],
    });

    expect(result.payload?.songs[0].playKey).toBe('G');
    expect(result.payload?.songs[0]).not.toHaveProperty('key');
  });

  it('rejects invalid string arrays and oversized capo values', () => {
    const invalid = validateImportExportPayload({
      version: 4,
      groups: [group],
      chords: [
        {
          id: 'bad',
          chordName: 'C',
          strings: 'broken',
          fretCount: 3,
          fretOffset: 99,
          groupId: 'g1',
          tuning: 'STANDARD',
        },
      ],
      songs: [],
    });
    expect(invalid.isValid).toBe(false);

    const sanitized = sanitizePersistedData({
      groups: [group],
      chords: [
        {
          id: 'c1',
          chordName: 'C',
          strings,
          fretCount: 3,
          fretOffset: 99,
          groupId: 'g1',
          tuning: 'STANDARD',
          rootStringIndex: null,
        },
      ],
      songs: [{ id: 's1', title: 'S', lyrics: '', lineIds: [], playKey: 'C', capo: 99, chordMap: {} }],
    });

    expect(sanitized.chords[0].fretOffset).toBe(0);
    expect(sanitized.songs[0].capo).toBe(0);
  });

  it('deduplicates fingerprints and prunes orphan song references on import', () => {
    const chord = {
      id: 'c1',
      chordName: 'C',
      strings,
      fretCount: 3,
      fretOffset: 0,
      groupId: 'g1',
      tuning: 'STANDARD',
      rootStringIndex: null,
    };
    const sanitized = sanitizePersistedData({
      groups: [group],
      chords: [chord, { ...chord, id: 'c2' }],
    });
    expect(sanitized.chords).toHaveLength(1);

    const result = validateImportExportPayload({
      version: 4,
      groups: [group],
      chords: [chord],
      songs: [{ id: 's1', title: 'S', lyrics: '', lineIds: [], playKey: 'C', capo: 0, chordMap: { slot: 'missing' } }],
    });

    expect(result.isValid).toBe(true);
    expect(result.payload?.songs[0].chordMap).toEqual(new Map());
  });

  it('清除失效引用时记录 warnings，避免静默丢数据', () => {
    const result = validateImportExportPayload({
      version: 6,
      groups: [group],
      chords: [{ id: 'c1', chordName: 'C', strings, fretCount: 3, fretOffset: 0, groupId: 'g1', tuning: 'STANDARD' }],
      songs: [
        {
          id: 's1',
          title: 'S',
          lyrics: '',
          lineIds: ['l1'],
          playKey: 'C',
          capo: 0,
          // 旧扁平槽位：v7 迁移归一为嵌套后，'missing' 作为孤儿引用被剪除
          chordMap: { line_l1_char_0: 'missing', line_l1_char_1: 'c1' },
        },
      ],
    });

    expect(result.isValid).toBe(true);
    expect(result.payload?.songs[0].chordMap.size).toBe(1);
    expect(result.warnings?.some(w => w.includes('引用'))).toBe(true);
  });

  it('keeps valid preferences and drops corrupt ones without rejecting the payload (v6)', () => {
    const base = {
      groups: [group],
      chords: [],
      songs: [],
    };

    const valid = validateImportExportPayload({
      ...base,
      preferences: {
        workbenchChordShorthand: true,
        scoreChordShorthand: false,
      },
    });
    expect(valid.isValid).toBe(true);
    expect(valid.payload?.preferences).toEqual({
      workbenchChordShorthand: true,
      scoreChordShorthand: false,
    });

    // 非法值逐字段剔除，未提及字段不出现
    const partial = validateImportExportPayload({
      ...base,
      preferences: { workbenchChordShorthand: 'yes', scoreChordShorthand: false } as Record<string, unknown>,
    });
    expect(partial.isValid).toBe(true);
    expect(partial.payload?.preferences).toEqual({ scoreChordShorthand: false });

    // 整个 preferences 损坏（数组/标量）→ 丢弃字段，不影响整包
    const corrupt = validateImportExportPayload({ ...base, preferences: ['broken'] });
    expect(corrupt.isValid).toBe(true);
    expect(corrupt.payload?.preferences).toBeUndefined();
  });

  it('lenient 模式下丢弃单条损坏和弦并记录 warning，不阻断整包（避免一条脏数据拖垮全部）', () => {
    const validChord = {
      id: 'c1',
      chordName: 'C',
      strings,
      fretCount: 3,
      fretOffset: 0,
      groupId: 'g1',
      tuning: 'STANDARD',
      rootStringIndex: null,
    };
    const brokenChord = {
      id: 'bad_c',
      chordName: 'Dm',
      strings: 'broken-strings-not-array',
      fretCount: 3,
      fretOffset: 0,
      groupId: 'g1',
      tuning: 'STANDARD',
    };

    // strict 模式（默认）：单条损坏和弦阻断整体
    const strictResult = validateImportExportPayload({
      groups: [group],
      chords: [validChord, brokenChord],
      songs: [],
    });
    expect(strictResult.isValid).toBe(false);
    expect(strictResult.issues.length).toBeGreaterThan(0);

    // lenient 模式：跳过损坏和弦，保留有效和弦，不阻断整包
    const lenientResult = validateImportExportPayload(
      {
        groups: [group],
        chords: [validChord, brokenChord],
        songs: [],
      },
      { mode: 'lenient' }
    );
    expect(lenientResult.isValid).toBe(true);
    expect(lenientResult.payload?.chords).toHaveLength(1);
    expect(lenientResult.payload?.chords[0]?.id).toBe('c1');
    expect(lenientResult.warnings?.some(w => w.includes('损坏') && w.includes('已跳过'))).toBe(true);
  });

  it('孤儿和弦（groupId 不存在）被清理并生成 warning，保持警告可见性', () => {
    const validChord = {
      id: 'c1',
      chordName: 'C',
      strings,
      fretCount: 3,
      fretOffset: 0,
      groupId: 'g1',
      tuning: 'STANDARD',
      rootStringIndex: null,
    };
    const orphanChord = {
      id: 'orphan_c',
      chordName: 'G',
      strings,
      fretCount: 3,
      fretOffset: 0,
      groupId: 'non_existent_group',
      tuning: 'STANDARD',
      rootStringIndex: null,
    };

    const result = validateImportExportPayload({
      groups: [group],
      chords: [validChord, orphanChord],
      songs: [],
    });

    expect(result.isValid).toBe(true);
    expect(result.payload?.chords).toHaveLength(1);
    expect(result.payload?.chords[0]?.id).toBe('c1');
    expect(result.warnings?.some(w => w.includes('孤儿和弦'))).toBe(true);
  });

  it('拉取时透传云端 dataMd5 / dataUpdatedAt 校验元数据，供启动比对使用', () => {
    const result = validateImportExportPayload({
      groups: [group],
      chords: [],
      songs: [],
      dataMd5: 'abc123checksum',
      dataUpdatedAt: 1700000000000,
    });
    expect(result.isValid).toBe(true);
    expect(result.payload?.dataMd5).toBe('abc123checksum');
    expect(result.payload?.dataUpdatedAt).toBe(1700000000000);
  });

  it('v6->v7 迁移：扁平 chordMap 的边和弦按 index 排序落位，畸形键跳过', () => {
    const baseChord = { chordName: 'C', fretCount: 3, fretOffset: 0, groupId: 'g1', tuning: 'STANDARD' };
    const result = validateImportExportPayload({
      version: 6,
      groups: [group],
      chords: [
        { ...baseChord, id: 'c1', strings },
        // 改一个品位避免与 c1 同指纹（同组重复指纹会被去重器丢弃，与本测试无关）
        { ...baseChord, id: 'c2', strings: strings.map((s, i) => (i === 5 ? { ...s, fret: 3 } : s)) },
      ],
      songs: [
        {
          id: 's1',
          title: 'S',
          lyrics: '',
          lineIds: ['l1'],
          playKey: 'C',
          capo: 0,
          chordMap: {
            line_l1_char_0: 'c1',
            // 边和弦故意乱序：index 1 先出现，迁移后必须按 index 排回 [c2, c1]
            line_l1_start_1: 'c1',
            line_l1_start_0: 'c2',
            line_l1_end_0: 'c2',
            // 类型段非 char/start/end：parseSlotKey 解析不出，必须跳过而非污染嵌套结构
            line_l1_middle_0: 'c1',
          },
        },
      ],
    });

    expect(result.isValid).toBe(true);
    const slots = result.payload?.songs[0].chordMap.get('l1');
    expect(slots?.char.get(0)).toBe('c1');
    expect(slots?.start).toEqual(['c2', 'c1']);
    expect(slots?.end).toEqual(['c2']);
  });

  it('lenient 模式跳过损坏的分组/歌曲并记录 warning', () => {
    const result = validateImportExportPayload(
      {
        version: 7,
        groups: [group, { name: '缺 id 的分组' }, { id: 'g2' }],
        chords: [],
        songs: [{ title: '缺 id 的歌曲' }, { id: 's1', title: 'S' }],
      },
      { mode: 'lenient' }
    );

    expect(result.isValid).toBe(true);
    expect(result.payload?.groups).toHaveLength(1);
    expect(result.payload?.songs).toHaveLength(1);
    expect(result.warnings?.some(w => w.includes('groups['))).toBe(true);
    expect(result.warnings?.some(w => w.includes('songs['))).toBe(true);
  });

  it('strict 模式下损坏的分组直接阻断整包', () => {
    const result = validateImportExportPayload({
      version: 7,
      groups: [{ name: '缺 id 的分组' }],
      chords: [],
      songs: [],
    });

    expect(result.isValid).toBe(false);
    expect(result.issues.some(i => i.includes('结构损坏'))).toBe(true);
  });

  it('lenient 模式逐条跳过各类损坏和弦（非对象 / 缺名称 / 琴弦节点形状非法）', () => {
    const validChord = {
      id: 'c1',
      chordName: 'C',
      strings,
      fretCount: 3,
      fretOffset: 0,
      groupId: 'g1',
      tuning: 'STANDARD',
    };

    const result = validateImportExportPayload(
      {
        version: 7,
        groups: [group],
        chords: [
          'not-an-object',
          { id: 'c_no_name', groupId: 'g1', strings },
          {
            id: 'c_bad_shape',
            chordName: 'C',
            groupId: 'g1',
            strings: [
              { fret: 'x', preferFlat: false },
              { fret: 1, preferFlat: false },
              { fret: 0, preferFlat: false },
            ],
          },
          validChord,
        ],
        songs: [],
      },
      { mode: 'lenient' }
    );

    expect(result.isValid).toBe(true);
    expect(result.payload?.chords.map(c => c.id)).toEqual(['c1']);
    expect(result.warnings?.some(w => w.includes('不是有效的对象'))).toBe(true);
    expect(result.warnings?.some(w => w.includes('缺失基础识别属性'))).toBe(true);
    expect(result.warnings?.some(w => w.includes('损坏的琴弦节点'))).toBe(true);
  });

  it('旧平铺 syncSettings 归一化为判别联合，路径逃逸字段被剔除', () => {
    const result = validateImportExportPayload({
      version: 7,
      groups: [group],
      chords: [],
      songs: [],
      syncSettings: {
        syncTarget: 'github',
        githubToken: 'tok',
        githubOwner: 'me',
        githubRepo: 'repo',
        githubBranch: 'main',
        // 含 .. 路径段：该字段会被拼进 GitHub API 路径，必须就地剔除（语义与旧实现一致）
        githubPath: '../../etc/passwd',
      },
    });

    expect(result.isValid).toBe(true);
    expect(result.payload?.syncSettings).toMatchObject({ kind: 'github', owner: 'me', repo: 'repo', branch: 'main' });
    expect(result.payload?.syncSettings).not.toHaveProperty('path');
  });

  it('旧平铺 webdav / server 同步配置归一化，兼容旧字段名 webdavUseProxy', () => {
    const webdav = validateImportExportPayload({
      version: 7,
      groups: [group],
      chords: [],
      songs: [],
      syncSettings: {
        syncTarget: 'webdav',
        webdavServerUrl: 'https://dav.example.com',
        webdavUsername: 'u',
        webdavPassword: 'p',
        // 旧字段名：新字段 webdavUseDefaultProxy 缺失时回退读取
        webdavUseProxy: true,
      },
    });
    expect(webdav.payload?.syncSettings).toMatchObject({
      kind: 'webdav',
      serverUrl: 'https://dav.example.com',
      useDefaultProxy: true,
    });

    const server = validateImportExportPayload({
      version: 7,
      groups: [group],
      chords: [],
      songs: [],
      syncSettings: { syncTarget: 'server', serverUrl: 'https://sync.example.com', serverToken: 'tok' },
    });
    expect(server.payload?.syncSettings).toMatchObject({ kind: 'server', serverUrl: 'https://sync.example.com' });
  });

  it('非对象输入与非法 JSON 走各自的失败分支', () => {
    const notObject = validateImportExportPayload('a string');
    expect(notObject.isValid).toBe(false);
    expect(notObject.issues[0]).toContain('有效对象');

    expect(parseAndValidatePayload('{ not json')).toEqual({ error: 'INVALID_JSON' });
  });
});
