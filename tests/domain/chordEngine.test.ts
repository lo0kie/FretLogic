import { describe, expect, it } from 'vitest';
import { analyzeChordGraph } from '@/services/music/chordEngine';
import type { NoteInput } from '@/types';

const note = (stringIndex: number, pitchIndex: number, label: string): NoteInput => ({
  stringIndex,
  pitchIndex,
  label,
});

const cMajor = [note(3, 0, 'C'), note(4, 4, 'E'), note(5, 7, 'G')];
const aMinor = [note(3, 9, 'A'), note(4, 0, 'C'), note(5, 4, 'E')];
const gSeven = [note(3, 7, 'G'), note(4, 11, 'B'), note(5, 10, 'F'), note(6, 2, 'D')];

describe('chord engine boundary', () => {
  it('identifies explicit major, minor and dominant seventh chords', () => {
    expect(analyzeChordGraph(cMajor, 0).best?.chordName).toBe('C');
    expect(analyzeChordGraph(aMinor, 9).best?.chordName).toBe('Am');
    expect(analyzeChordGraph(gSeven, null).best?.chordName).toBe('BmMaj7/G');
  });

  it('keeps slash bass in the chord name', () => {
    const result = analyzeChordGraph([note(2, 4, 'E'), note(3, 0, 'C'), note(4, 4, 'E'), note(5, 7, 'G')], 0);
    expect(result.best?.chordName).toBe('C/E');
    expect(result.bestRootPitch).toBe(0);
  });

  it('returns an empty analysis for no notes', () => {
    const result = analyzeChordGraph([], null);
    expect(result.candidates).toEqual([]);
    expect(result.best).toBeUndefined();
    expect(result.bestRootPitch).toBe(0);
  });

  it('caches identical note sets by reference stability', () => {
    const first = analyzeChordGraph(cMajor, null);
    const second = analyzeChordGraph(cMajor, null);
    expect(second).toBe(first);
  });
});
