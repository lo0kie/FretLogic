import { describe, expect, it } from 'vitest';
import { validateImportExportPayload } from '@/domain/validation/payload';
import { sanitizePersistedData } from '@/domain/validation/persistedData';

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
          capo: 0,
          groupId: 'g1',
          tuning: 'STANDARD',
          isInverted: false,
          fingerprint: 'old',
        },
      ],
      songs: [],
    });

    expect(result.isValid).toBe(true);
    expect(result.payload?.version).toBe(4);
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
          capo: 0,
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
          capo: 99,
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
          capo: 99,
          groupId: 'g1',
          tuning: 'STANDARD',
          rootStringIndex: null,
        },
      ],
      songs: [{ id: 's1', title: 'S', lyrics: '', lineIds: [], playKey: 'C', capo: 99, chordMap: {} }],
    });

    expect(sanitized.chords[0].capo).toBe(0);
    expect(sanitized.songs[0].capo).toBe(0);
  });

  it('deduplicates fingerprints and prunes orphan song references on import', () => {
    const chord = {
      id: 'c1',
      chordName: 'C',
      strings,
      fretCount: 3,
      capo: 0,
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
    expect(result.payload?.songs[0].chordMap).toEqual({});
  });
});
