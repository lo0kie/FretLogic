import { describe, expect, it } from 'vitest';
import { validateImportExportPayload } from '@/services/validation/payload';
import { analyzeChordGraph } from '@/services/music/chordEngine';
import { computeSongKey } from '@/utils/musicTheory';

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
    expect(result.payload?.version).toBe(4);
    expect(result.payload?.chords[0].id).toBe('1');
    expect(result.payload?.chords[0].strings[0]).toEqual([-1, false]);
    expect(result.payload?.songs[0].playKey).toBe('G');
    expect(result.payload?.songs[0]).not.toHaveProperty('key');
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
