import { describe, expect, it } from 'vitest';

import { parseAndValidatePayload, validateImportExportPayload } from '@/app/services/validation/payload';
import { CURRENT_PAYLOAD_VERSION } from '@/app/services/validation/payloadMigrations';
import { sanitizePersistedData } from '@/app/services/validation/persistedData';

import type { LineId } from '@/domains/score/types';

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
    expect(result.payload?.version).toBe(CURRENT_PAYLOAD_VERSION);
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

  it('v6->v7 迁移：二维元组琴弦转为对象型；v2 数字 id 归一为字符串', () => {
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
    expect(result.payload?.version).toBe(CURRENT_PAYLOAD_VERSION);
    expect(result.payload?.chords[0]?.strings).toEqual([
      { fret: -1, preferFlat: false },
      { fret: 3, preferFlat: true },
      { fret: 0, preferFlat: false },
    ]);

    // v2 旧包的数字 id 归一化为字符串（song.chordMap 的引用一律是字符串 id，不归一即引用永久失配）。
    // 对象形态 strings 的解析已由上式覆盖，此处只保留 id 归一化这一条独立判据
    const numericId = validateImportExportPayload({
      version: 2,
      groups: [group],
      chords: [
        {
          id: 7,
          chordName: 'C',
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

    expect(numericId.isValid).toBe(true);
    expect(numericId.payload?.chords[0]?.id).toBe('7');
  });

  it('migrates legacy song key to playKey at v3', () => {
    const result = validateImportExportPayload({
      version: 3,
      groups: [group],
      chords: [],
      songs: [{ id: 's1', title: 'Legacy', key: 'G', lyrics: '', capo: 2, chordMap: {}, lineIds: [] }],
    });

    expect(result.payload?.songs[0]?.playKey).toBe('G');
    expect(result.payload?.songs[0]).not.toHaveProperty('key');
  });

  it('rejects structurally damaged string arrays and repairs out-of-range position values', () => {
    const base = { version: 4, groups: [group], songs: [] };
    const baseChord = { id: 'bad', chordName: 'C', fretCount: 3, groupId: 'g1', tuning: 'STANDARD' };

    // 结构门禁：strings 不是弦数组 → 整包拒绝。issue 必须能定位到具体那一条，
    // 否则「isValid === false」无法归因到哪个缺陷（原先两条缺陷塞进同一输入，正是丢了这个信息）
    const badStrings = validateImportExportPayload({
      ...base,
      chords: [{ ...baseChord, strings: 'broken', fretOffset: 0 }],
    });
    expect(badStrings.isValid).toBe(false);
    expect(badStrings.issues.join('\n')).toContain('chords[0] (bad) 琴弦数组损坏');

    // 值域越界不走结构门禁（见 payload.ts「门禁只做结构判断…清理在 sanitize*Entity 内核」）：
    // 实体内核按 repair 口径钳制后照常放行。上界闭区间端点 12 原样保留
    const atUpperBound = validateImportExportPayload({
      ...base,
      chords: [{ ...baseChord, strings, fretOffset: 12 }],
    });
    expect(atUpperBound.isValid).toBe(true);
    expect(atUpperBound.payload?.chords[0]?.fretOffset).toBe(12);

    // 上界外一格：13 被钳回 0 —— 与上一例配对，证明这是区间守卫，而非「越界即一律清零」
    const oversizedOffset = validateImportExportPayload({
      ...base,
      chords: [{ ...baseChord, strings, fretOffset: 13 }],
    });
    expect(oversizedOffset.isValid).toBe(true);
    expect(oversizedOffset.payload?.chords[0]?.fretOffset).toBe(0);

    // IDB 启动清洗链路与导入链路共用同一套 repair 内核（sanitizeChordEntity / songRepository）：
    // 和弦 fretOffset 与歌曲 capo 的越界值同样被钳回 0，而不是让整份数据落不下来
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

    expect(sanitized.chords[0]?.fretOffset).toBe(0);
    expect(sanitized.songs[0]?.capo).toBe(0);
  });

  it('deduplicates fingerprints and drops unusable song chord refs on import (malformed key / orphan id)', () => {
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
    // ⚠️ 这个空 Map 是**迁移阶段丢弃畸形键**的结果（'slot' 不是 v7 的 line_*_char_* 形态），
    // 与「剪枝孤儿引用」无关 —— 把 pruneOrphanChordRefs 整个删掉，本式照样绿。
    // 剪枝的真覆盖是下方 v6 那段（孤儿 id 'missing' 被剪 + 必须留 warning）。
    expect(result.payload?.songs[0]?.chordMap).toEqual(new Map());

    // 剪除孤儿 chordMap 引用时**必须留下 warning**：滑稽丢数据是「导入后谱面少了一半和弦」
    // 这类最难归因的回归形态，只有 warnings 能把它从静默里拉出来。
    // （剪枝本身已被上式 toEqual(new Map()) 覆盖，此处不再重复断言 size）
    const orphanRef = validateImportExportPayload({
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

    expect(orphanRef.isValid).toBe(true);
    expect(orphanRef.warnings?.some(w => w.includes('引用'))).toBe(true);
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

  // lenient 模式的损坏和弦：四条结构门禁各取一例（整体非数组 / 非对象 / 缺基础属性 / 节点形状非法），
  // 契约完全一致——坏条目跳过记 warning、好条目照常落库、整包不阻断。strict 下有单独一条用例守着
  // 「同一条结构门禁在 strict 下改走 issues」这半边，但只举了「分组缺 id」一例，**不是**和弦侧的同源覆盖。
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
  const lenientChordCases: readonly {
    label: string;
    badChord: Record<string, unknown> | string;
    /** 必须**同时出现在同一条 warning**里判据片段 */
    markers: readonly string[];
  }[] = [
    {
      label: '琴弦整体非数组',
      badChord: {
        id: 'bad_c',
        chordName: 'Dm',
        strings: 'broken-strings-not-array',
        fretCount: 3,
        fretOffset: 0,
        groupId: 'g1',
        tuning: 'STANDARD',
      },
      markers: ['损坏', '已跳过'],
    },
    { label: '条目不是对象', badChord: 'not-an-object', markers: ['不是有效的对象'] },
    {
      label: '缺失基础识别属性（无和弦名）',
      badChord: { id: 'c_no_name', groupId: 'g1', strings },
      markers: ['缺失基础识别属性'],
    },
    {
      label: '琴弦节点形状非法（fret 非数字）',
      badChord: {
        id: 'c_bad_shape',
        chordName: 'C',
        groupId: 'g1',
        strings: [
          { fret: 'x', preferFlat: false },
          { fret: 1, preferFlat: false },
          { fret: 0, preferFlat: false },
        ],
      },
      markers: ['损坏的琴弦节点'],
    },
  ];

  it.each(lenientChordCases)(
    'lenient 模式：$label 的单条损坏和弦被跳过并记 warning，同包完好条目照常落库',
    ({ badChord, markers }) => {
      const result = validateImportExportPayload(
        { version: 7, groups: [group], chords: [badChord, validChord], songs: [] },
        { mode: 'lenient' }
      );

      // 避免一条脏数据拖垮全部：坏条目不进库，整包仍然可用
      expect(result.isValid).toBe(true);
      expect(result.payload?.chords.map(c => c.id)).toEqual(['c1']);
      expect(
        result.warnings?.some(w => markers.every(m => w.includes(m))),
        `warnings 里缺少同时命中 ${markers.join(' + ')} 的一条`
      ).toBe(true);
    }
  );

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

  it('缺 songs 分区时留下 absentSections 标记（「包里没有」≠「云端为空」）', () => {
    // 这是不可逆丢失的最后一道守卫：校验层会把缺失分区兜底成 []，若不额外留下标记，消费侧
    // （syncActions.applyOverwriteWithCloud）就只能看到「空的 songs 数组」，把「旧版本云端包
    // 压根没有 songs 字段」误判成「云端确实没有乐谱」，拉取时清掉本地全部乐谱。
    // 两半必须同时成立：真缺失要标记，显式空数组**不能**标记（后者才是真·清空语义）。
    const missingSongs = validateImportExportPayload({ version: 4, groups: [group], chords: [] });
    expect(missingSongs.isValid).toBe(true);
    expect(missingSongs.payload?.absentSections).toEqual(['songs']);

    const explicitEmptySongs = validateImportExportPayload({ version: 4, groups: [group], chords: [], songs: [] });
    expect(explicitEmptySongs.isValid).toBe(true);
    expect(explicitEmptySongs.payload?.absentSections).toBeUndefined();
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
    const slots = result.payload?.songs[0]?.chordMap.get('l1' as LineId);
    expect(slots?.char.get(0)).toBe('c1');
    expect(slots?.start).toEqual(['c2', 'c1']);
    expect(slots?.end).toEqual(['c2']);
  });

  // `mode` 开关的同一契约：同一份「含损坏分组 / 歌曲」的输入，strict 记 issues 整包拒绝、
  // lenient 记 warnings 跳过后续跑。两条用例原先各写各的 setup，唯一的变量就是 mode。
  // 损坏样本取「缺 id」而非「缺和弦名」是有意的——缺 id 同时命中分组、歌曲两侧的门禁，
  // 一组样本即可同时驱动两条分支，不必为每侧各写一份。
  const damagedEntryCases: readonly {
    mode: 'strict' | 'lenient';
    isValid: boolean;
    /** 阻塞项（strict 侧）：整包被拒的判据 */
    expectIssues?: readonly string[];
    /** 幸存条目数（lenient 侧）：坏条目不进库、好条目照常落库 */
    expectGroups?: number;
    expectSongs?: number;
    /** 必须出现的非阻断告警片段（lenient 侧） */
    expectWarnings?: readonly string[];
  }[] = [
    {
      mode: 'strict',
      isValid: false,
      expectIssues: ['结构损坏'],
    },
    {
      mode: 'lenient',
      isValid: true,
      expectGroups: 1,
      expectSongs: 1,
      expectWarnings: ['groups[', 'songs['],
    },
  ];

  it.each(damagedEntryCases)('$mode 模式下损坏的分组/歌曲：$isValid 与 issues/warnings 各走各的分支', c => {
    const result = validateImportExportPayload(
      {
        version: 7,
        groups: [group, { name: '缺 id 的分组' }, { id: 'g2' }],
        // 歌曲坏了照样整包可用：避免一条脏数据拖垮全部
        chords: [],
        songs: [{ title: '缺 id 的歌曲' }, { id: 's1', title: 'S' }],
      },
      { mode: c.mode }
    );

    expect(result.isValid).toBe(c.isValid);
    if (c.expectIssues) expect(result.issues.some(i => c.expectIssues!.some(m => i.includes(m)))).toBe(true);
    if (c.expectGroups !== undefined) expect(result.payload?.groups).toHaveLength(c.expectGroups);
    if (c.expectSongs !== undefined) expect(result.payload?.songs).toHaveLength(c.expectSongs);
    if (c.expectWarnings) expect(c.expectWarnings.every(m => result.warnings?.some(w => w.includes(m)))).toBe(true);
  });

  // 旧平铺形态（v7 前的 { syncTarget, xxxTarget } 同层字段）→ 判别联合：同一条归一化规则的两个分支。
  // webdav 半段不在此重复：coreRegression.test.ts:39-52 的同源用例用 toEqual 严格断言
  // （连「无多余字段」一并校验），强于本处的 toMatchObject 子集匹配。
  const flatSyncSettingsCases: readonly {
    label: string;
    syncSettings: Record<string, unknown>;
    expected: Record<string, unknown>;
    /** 归一化后必须消失的字段（路径段逃逸 / 平铺残留） */
    escaped?: string;
  }[] = [
    {
      label: 'github 平铺配置 → kind: github，含 .. 的 path 被剔除',
      syncSettings: {
        syncTarget: 'github',
        githubToken: 'tok',
        githubOwner: 'me',
        githubRepo: 'repo',
        githubBranch: 'main',
        // 含 .. 路径段：该字段会被拼进 GitHub API 路径，必须就地剔除（语义与旧实现一致）
        githubPath: '../../etc/passwd',
      },
      expected: { kind: 'github', owner: 'me', repo: 'repo', branch: 'main' },
      escaped: 'path',
    },
    {
      label: 'server 平铺配置 → kind: server',
      syncSettings: { syncTarget: 'server', serverUrl: 'https://sync.example.com', serverToken: 'tok' },
      expected: { kind: 'server', serverUrl: 'https://sync.example.com' },
    },
  ];

  it.each(flatSyncSettingsCases)(
    '旧平铺 syncSettings 归一化为判别联合：$label',
    ({ syncSettings, expected, escaped }) => {
      const result = validateImportExportPayload({ version: 7, groups: [group], chords: [], songs: [], syncSettings });

      expect(result.isValid).toBe(true);
      expect(result.payload?.syncSettings).toMatchObject(expected);
      if (escaped) expect(result.payload?.syncSettings).not.toHaveProperty(escaped);
    }
  );

  it('非对象输入与非法 JSON 走各自的失败分支', () => {
    const notObject = validateImportExportPayload('a string');
    expect(notObject.isValid).toBe(false);
    expect(notObject.issues[0]).toContain('有效对象');

    expect(parseAndValidatePayload('{ not json')).toEqual({ error: 'INVALID_JSON' });
  });
});
