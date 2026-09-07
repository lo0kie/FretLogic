import { describe, expect, it } from 'vitest';

import { analyzeChordGraph } from '@/domains/chord/theory/chordEngine';
import {
  nameToSegments,
  parsePitchSegment,
  pitchSegmentToString,
  segmentsToString,
} from '@/domains/chord/theory/theory';

import type { Tuning } from '@/domains/chord/theory/theory';
import type { GuitarStringsModel } from '@/domains/fretboard/types';

describe('Chord Name Segmentation (AST/Tokenization)', () => {
  describe('parsePitchSegment', () => {
    it('should parse natural notes', () => {
      expect(parsePitchSegment('C')).toEqual(['C', 0]);
      expect(parsePitchSegment('G')).toEqual(['G', 0]);
      expect(parsePitchSegment('b')).toEqual(['B', 0]);
    });

    it('should parse sharp notes with ascii and unicode', () => {
      expect(parsePitchSegment('C#')).toEqual(['C', 1]);
      expect(parsePitchSegment('F♯')).toEqual(['F', 1]);
      expect(parsePitchSegment('g#')).toEqual(['G', 1]);
    });

    it('should parse flat notes with ascii and unicode', () => {
      expect(parsePitchSegment('Db')).toEqual(['D', -1]);
      expect(parsePitchSegment('B♭')).toEqual(['B', -1]);
      expect(parsePitchSegment('eb')).toEqual(['E', -1]);
    });

    it('should return null for invalid pitches', () => {
      expect(parsePitchSegment('')).toBeNull();
      expect(parsePitchSegment('H')).toBeNull();
      expect(parsePitchSegment('123')).toBeNull();
    });
  });

  describe('pitchSegmentToString', () => {
    it('should serialize with ascii symbols', () => {
      expect(pitchSegmentToString(['C', 1])).toBe('C#');
      expect(pitchSegmentToString(['D', -1])).toBe('Db');
      expect(pitchSegmentToString(['A', 0])).toBe('A');
    });

    it('should serialize with unicode symbols when requested', () => {
      expect(pitchSegmentToString(['C', 1], true)).toBe('C♯');
      expect(pitchSegmentToString(['D', -1], true)).toBe('D♭');
      expect(pitchSegmentToString(['A', 0], true)).toBe('A');
    });
  });

  describe('nameToSegments and segmentsToString', () => {
    it('should parse and serialize standard triads', () => {
      const cMajor = nameToSegments('C');
      expect(cMajor).toEqual({
        root: ['C', 0],
        quality: undefined,
        extensions: undefined,
        bass: undefined,
      });
      expect(segmentsToString(cMajor!)).toBe('C');

      const aMinor = nameToSegments('Am');
      expect(aMinor).toEqual({
        root: ['A', 0],
        quality: 'm',
        extensions: undefined,
        bass: undefined,
      });
      expect(segmentsToString(aMinor!)).toBe('Am');
    });

    it('should parse and serialize sharp & flat roots', () => {
      const cSharpMinor = nameToSegments('C#m7');
      expect(cSharpMinor).toEqual({
        root: ['C', 1],
        quality: 'm7',
        extensions: undefined,
        bass: undefined,
      });
      expect(segmentsToString(cSharpMinor!)).toBe('C#m7');
      expect(segmentsToString(cSharpMinor!, true)).toBe('C♯m7');

      const bFlatMajor7 = nameToSegments('Bbmaj7');
      expect(bFlatMajor7).toEqual({
        root: ['B', -1],
        quality: 'maj7',
        extensions: undefined,
        bass: undefined,
      });
      expect(segmentsToString(bFlatMajor7!)).toBe('Bbmaj7');
      expect(segmentsToString(bFlatMajor7!, true)).toBe('B♭maj7');
    });

    it('should parse and serialize slash chords', () => {
      const slashChord = nameToSegments('F#m7/C#');
      expect(slashChord).toEqual({
        root: ['F', 1],
        quality: 'm7',
        extensions: undefined,
        bass: ['C', 1],
      });
      expect(segmentsToString(slashChord!)).toBe('F#m7/C#');
      expect(segmentsToString(slashChord!, true)).toBe('F♯m7/C♯');

      const sixNineSlash = nameToSegments('A6/9/F#');
      expect(sixNineSlash).toEqual({
        root: ['A', 0],
        quality: '6/9',
        extensions: undefined,
        bass: ['F', 1],
      });
      expect(segmentsToString(sixNineSlash!)).toBe('A6/9/F#');

      const sixNinePlain = nameToSegments('C6/9');
      expect(sixNinePlain).toEqual({
        root: ['C', 0],
        quality: '6/9',
        extensions: undefined,
        bass: undefined,
      });
      expect(segmentsToString(sixNinePlain!)).toBe('C6/9');
    });

    it('should parse and extract tension alterations like #9, b5', () => {
      const altered = nameToSegments('Eb7#9');
      expect(altered).toEqual({
        root: ['E', -1],
        quality: '7',
        extensions: [[9, 1]],
        bass: undefined,
      });
      expect(segmentsToString(altered!)).toBe('Eb7#9');
      expect(segmentsToString(altered!, true)).toBe('E♭7♯9');

      const bracketed = nameToSegments('C7(b9)');
      expect(bracketed).toEqual({
        root: ['C', 0],
        quality: '7',
        extensions: [[9, -1]],
        bass: undefined,
      });
      expect(segmentsToString(bracketed!)).toBe('C7b9');
    });

    it('should correctly parse G#m7, GM9/G#, and G#/C chords', () => {
      const gSharpM7 = nameToSegments('G#m7');
      expect(gSharpM7).toEqual({
        root: ['G', 1],
        quality: 'm7',
        extensions: undefined,
        bass: undefined,
      });
      expect(segmentsToString(gSharpM7!)).toBe('G#m7');
      expect(segmentsToString(gSharpM7!, true)).toBe('G♯m7');

      const gM9SlashGSharp = nameToSegments('GM9/G#');
      expect(gM9SlashGSharp).toEqual({
        root: ['G', 0],
        quality: 'M9',
        extensions: undefined,
        bass: ['G', 1],
      });
      expect(segmentsToString(gM9SlashGSharp!)).toBe('GM9/G#');
      expect(segmentsToString(gM9SlashGSharp!, true)).toBe('GM9/G♯');

      const gSharpSlashC = nameToSegments('G#/C');
      expect(gSharpSlashC).toEqual({
        root: ['G', 1],
        quality: undefined,
        extensions: undefined,
        bass: ['C', 0],
      });
      expect(segmentsToString(gSharpSlashC!)).toBe('G#/C');
      expect(segmentsToString(gSharpSlashC!, true)).toBe('G♯/C');
    });
  });

  describe('ChordEngine candidate segments generation', () => {
    it('should populate segments on candidate results', () => {
      // C standard open chord: x 3 2 0 1 0
      const notes = [
        { stringIndex: 1, pitchIndex: 0, label: 'C' },
        { stringIndex: 2, pitchIndex: 4, label: 'E' },
        { stringIndex: 3, pitchIndex: 7, label: 'G' },
        { stringIndex: 4, pitchIndex: 0, label: 'C' },
        { stringIndex: 5, pitchIndex: 4, label: 'E' },
      ];

      const result = analyzeChordGraph(notes, null);
      expect(result.candidates.length).toBeGreaterThan(0);
      const best = result.best;
      expect(best).toBeDefined();
      expect(best?.chordName).toBe('C');
      expect(best?.segments).toEqual({
        root: ['C', 0],
        quality: undefined,
        extensions: undefined,
        bass: undefined,
      });
    });

    it('should populate segments on sharp chord candidates', () => {
      // F# major barre chord: 2 4 4 3 2 2
      const notes = [
        { stringIndex: 0, pitchIndex: 6, label: 'F#' },
        { stringIndex: 1, pitchIndex: 1, label: 'C#' },
        { stringIndex: 2, pitchIndex: 6, label: 'F#' },
        { stringIndex: 3, pitchIndex: 10, label: 'A#' },
        { stringIndex: 4, pitchIndex: 1, label: 'C#' },
        { stringIndex: 5, pitchIndex: 6, label: 'F#' },
      ];

      const result = analyzeChordGraph(notes, 6);
      const best = result.best;
      expect(best).toBeDefined();
      expect(best?.chordName).toBe('F#');
      expect(best?.segments?.root).toEqual(['F', 1]);
    });
  });

  describe('Export payload nameSegments preservation & migration', () => {
    it('should populate nameSegments in exported payload chords if missing', async () => {
      const { validateImportExportPayload } = await import('@/app/services/validation/payload');
      const rawPayload = {
        version: 4,
        groups: [{ id: 'g1', name: '常用', sortRule: 'ROOT_PITCH' }],
        chords: [
          {
            id: 'c1',
            chordName: 'C#m7',
            strings: [
              [-1, false],
              [4, false],
              [6, false],
              [6, false],
              [5, false],
              [4, false],
            ],
            fretCount: 3,
            capo: 0,
            groupId: 'g1',
            tuning: 'STANDARD',
          },
        ],
        songs: [],
      };

      const result = validateImportExportPayload(rawPayload);
      expect(result.isValid).toBe(true);
      expect(result.payload?.chords[0]?.nameSegments).toEqual({
        root: ['C', 1],
        quality: 'm7',
        extensions: undefined,
        bass: undefined,
      });
    });
  });

  describe('Chord quality shorthand formatting', () => {
    it('should format chord qualities into shorthand symbols when requested', async () => {
      const { formatChordQuality, segmentsToString, nameToSegments } = await import('@/domains/chord/theory/theory');

      expect(formatChordQuality('maj7', true)).toBe('M7');
      expect(formatChordQuality('Maj7', true)).toBe('M7');
      expect(formatChordQuality('maj', true)).toBe('M');
      expect(formatChordQuality('Maj', true)).toBe('M');
      expect(formatChordQuality('dim', true)).toBe('°');
      expect(formatChordQuality('dim7', true)).toBe('°7');
      expect(formatChordQuality('m7b5', true)).toBe('ø7');
      expect(formatChordQuality('aug', true)).toBe('+');
      expect(formatChordQuality('m7', true)).toBe('m7');
      expect(formatChordQuality('sus4', true)).toBe('sus');
      expect(formatChordQuality('7sus4', true)).toBe('7sus');

      // segmentsToString with shorthand
      const cMaj7 = nameToSegments('Cmaj7');
      expect(segmentsToString(cMaj7!, { shorthand: true })).toBe('CM7');

      const cSus4 = nameToSegments('Csus4');
      expect(segmentsToString(cSus4!, { shorthand: true })).toBe('Csus');

      const c7Sus4 = nameToSegments('C7sus4');
      expect(segmentsToString(c7Sus4!, { shorthand: true })).toBe('C7sus');

      const cMaj = nameToSegments('Cmaj');
      expect(segmentsToString(cMaj!, { shorthand: true })).toBe('CM');

      const bDim7 = nameToSegments('Bdim7');
      expect(segmentsToString(bDim7!, { shorthand: true })).toBe('B°7');

      const fSharpHalfDim = nameToSegments('F#m7b5');
      expect(segmentsToString(fSharpHalfDim!, { shorthand: true, useUnicode: true })).toBe('F♯ø7');

      const cSharpDimMaj7 = nameToSegments('C#dimMaj7/F#');
      expect(cSharpDimMaj7).toEqual({
        root: ['C', 1],
        quality: 'dimMaj7',
        extensions: undefined,
        bass: ['F', 1],
      });
      expect(segmentsToString(cSharpDimMaj7!, { shorthand: true })).toBe('C#°M7/F#');
      expect(segmentsToString(cSharpDimMaj7!, { shorthand: true, useUnicode: true })).toBe('C♯°M7/F♯');
    });

    it('should accurately distinguish valid chord names from invalid ones', async () => {
      const { isValidChordName } = await import('@/domains/chord/theory/theory');

      // Valid chords
      expect(isValidChordName('C')).toBe(true);
      expect(isValidChordName('Am')).toBe(true);
      expect(isValidChordName('F#m7')).toBe(true);
      expect(isValidChordName('Bbmaj7')).toBe(true);
      expect(isValidChordName('G7/B')).toBe(true);
      expect(isValidChordName('C#dimMaj7/F#')).toBe(true);
      expect(isValidChordName('Em7b5')).toBe(true);
      expect(isValidChordName('Dsus4')).toBe(true);
      expect(isValidChordName('Aadd9')).toBe(true);
      expect(isValidChordName('E7#9')).toBe(true);
      expect(isValidChordName('C(no3)')).toBe(true);

      // Invalid chords
      expect(isValidChordName('')).toBe(false);
      expect(isValidChordName('   ')).toBe(false);
      expect(isValidChordName('Hello')).toBe(false);
      expect(isValidChordName('123')).toBe(false);
      expect(isValidChordName('H7')).toBe(false);
      expect(isValidChordName('C/')).toBe(false);
      expect(isValidChordName('Cxyz')).toBe(false);
      expect(isValidChordName('C#?%')).toBe(false);
    });

    it('should derive chord name dynamically via getChordName SSOT without chordName string', async () => {
      const { getChordName } = await import('@/domains/chord/theory/theory');

      const chordWithoutName = {
        id: 'test-1',
        nameSegments: {
          root: ['F', 1] as [NaturalPitchLetter, AccidentalType],
          quality: 'm7',
          extensions: [[5, -1]] as ExtensionSegment[],
          bass: ['A', 0] as [NaturalPitchLetter, AccidentalType],
        },
        strings: [
          [-1, false],
          [0, false],
          [2, false],
          [2, false],
          [2, false],
          [0, false],
        ] as GuitarStringsModel,
        fretCount: 3 as const,
        capo: 0,
        groupId: 'g1',
        tuning: 'STANDARD' as Tuning,
        rootStringIndex: null,
      };

      // Standard derivation
      expect(getChordName(chordWithoutName)).toBe('F#m7b5/A');
      // Shorthand derivation
      expect(getChordName(chordWithoutName, { shorthand: true })).toBe('F#ø7/A');
      // Unicode derivation
      expect(getChordName(chordWithoutName, { shorthand: true, useUnicode: true })).toBe('F♯ø7/A');
    });

    it('should derive chord name and shorthand for string-only chord objects', async () => {
      const { getChordName } = await import('@/domains/chord/theory/theory');

      const chordWithNameOnly = {
        name: 'Cmaj7',
      };
      expect(getChordName(chordWithNameOnly)).toBe('Cmaj7');
      expect(getChordName(chordWithNameOnly, { shorthand: true })).toBe('CM7');

      const chordWithChordName = {
        chordName: 'Am7b5',
      };
      expect(getChordName(chordWithChordName)).toBe('Am7b5');
      expect(getChordName(chordWithChordName, { shorthand: true })).toBe('Aø7');
    });
  });
});
