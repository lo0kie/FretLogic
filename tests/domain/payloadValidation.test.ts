import { describe, expect, it } from 'vitest';

import { validateImportExportPayload } from '@/app/services/validation/payload';
import { sanitizePersistedData } from '@/app/services/validation/persistedData';

const group = { id: 'g1', name: 'C', sortRule: 'ROOT_PITCH' };
const strings = [
  [-1, false],
  [3, false],
  [2, false],
  [0, false],
  [1, false],
  [0, false],
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
    expect(result.payload?.version).toBe(6);
    expect(result.payload?.groups[0]).not.toHaveProperty('collapsed');
    expect(result.payload?.chords[0]).not.toHaveProperty('isInverted');
    expect(result.payload?.chords[0]).not.toHaveProperty('fingerprint');
  });

  it('migrates v2 object strings and numeric ids', () => {
    const result = validateImportExportPayload({
      version: 2,
      groups: [group],
      chords: [
        {
          id: 7,
          chordName: 'C',
          strings: strings.map(([fret, preferFlat]) => ({ fret, preferFlat })),
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
    expect(result.payload?.chords[0].strings[0]).toEqual([-1, false]);
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
          lineIds: [],
          playKey: 'C',
          capo: 0,
          chordMap: { slot: 'missing', slot2: 'c1' },
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
});
