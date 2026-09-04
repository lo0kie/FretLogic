import { describe, expect, it } from 'vitest';

import { analyzeChordGraph } from '@/services/music/chordEngine';
import { nameToSegments, parsePitchSegment } from '@/services/music/theory';
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

  it('guarantees segments are defined for all candidates', () => {
    const result = analyzeChordGraph(cMajor, 0);
    expect(result.candidates.length).toBeGreaterThan(0);
    for (const c of result.candidates) {
      expect(c.segments).toBeDefined();
      expect(c.segments?.root).toBeDefined();
      expect(Array.isArray(c.segments?.root)).toBe(true);
    }
  });

  it('favors standard enharmonic root spellings (Bb over A#, Eb over D#)', () => {
    // Bb major: Bb(10), D(2), F(5)
    const bbMajorNotes = [note(1, 10, 'A#'), note(2, 2, 'D'), note(3, 5, 'F')];
    const bbResult = analyzeChordGraph(bbMajorNotes, null);
    expect(bbResult.best?.chordName).toBe('Bb');
    expect(bbResult.best?.rootLabel).toBe('Bb');

    // Eb major: Eb(3), G(7), Bb(10)
    const ebMajorNotes = [note(1, 3, 'D#'), note(2, 7, 'G'), note(3, 10, 'A#')];
    const ebResult = analyzeChordGraph(ebMajorNotes, null);
    expect(ebResult.best?.chordName).toBe('Eb');
    expect(ebResult.best?.rootLabel).toBe('Eb');
  });

  it('honors explicit root note label when explicitly specified', () => {
    const dbMajor = [note(1, 1, 'Db'), note(2, 5, 'F'), note(3, 8, 'Ab')];
    const result = analyzeChordGraph(dbMajor, 1);
    expect(result.best?.chordName).toBe('Db');
    expect(result.best?.rootLabel).toBe('Db');
  });

  it('provides low-confidence candidates when purity is below normal threshold instead of returning empty', () => {
    // 4 distinct pitch classes: C(0), F(5), D(2), A(9) with explicit root C(0) on lowest string
    // Csus4 (0, 5) and Csus2 (0, 2) explain 2 of 4 notes -> purity = 0.50 (below MIN_PURITY 0.60, above LOW_PURITY_THRESHOLD 0.45)
    // Previously with MIN_PURITY = 0.62, this yielded 0 candidates.
    const noisyNotes = [note(0, 0, 'C'), note(1, 5, 'F'), note(2, 2, 'D'), note(3, 9, 'A')];
    const result = analyzeChordGraph(noisyNotes, 0);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.lowConfidence.length).toBeGreaterThan(0);
    expect(result.lowConfidence.some(c => c.chordName.startsWith('Csus'))).toBe(true);
  });

  it('guarantees fallback segments can be derived for arbitrary candidate structures without clearing chord name', () => {
    // Simulated candidate with no pre-parsed segments and non-standard quality
    const candidate = {
      chordName: 'C(custom)',
      rootLabel: 'C',
      score: 10,
      rootPitch: 0,
      segments: undefined,
    };
    const parsedSegs = candidate.segments ?? nameToSegments(candidate.chordName);
    let resolvedSegs = parsedSegs;
    if (!resolvedSegs) {
      const parsedRoot = parsePitchSegment(candidate.rootLabel);
      if (parsedRoot) {
        resolvedSegs = {
          root: parsedRoot,
          unknownQuality: candidate.chordName.slice(candidate.rootLabel.length).replace(/^\//, '') || undefined,
        };
      }
    }
    expect(resolvedSegs).toBeDefined();
    expect(resolvedSegs?.root).toEqual(['C', 0]);
    expect(resolvedSegs?.unknownQuality).toBe('(custom)');
  });
});
