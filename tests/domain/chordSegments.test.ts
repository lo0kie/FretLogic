import { describe, expect, it } from 'vitest';

import { analyzeChordGraph } from '@/domains/chord/theory/chordEngine';
import {
  nameToSegments,
  parsePitchSegment,
  pitchSegmentToString,
  segmentsToString,
} from '@/domains/chord/theory/theory';

import type { Tuning } from '@/domains/chord/theory/theory';
import type {
  AccidentalType,
  ChordNameSegments,
  ExtensionSegment,
  NaturalPitchLetter,
  NoteInput,
  RootSegment,
} from '@/domains/chord/types';
import type { GuitarStringsModel } from '@/domains/fretboard/types';

describe('Chord Name Segmentation (AST/Tokenization)', () => {
  describe('parsePitchSegment', () => {
    // 同一条规则「^([A-G])([#b♯♭])?$ 正则 + 升降号三元链」的全部取值：
    // 自然音 / ascii 与 unicode 升号 / ascii 与 unicode 降号 / 大小写。
    // F♯ 与 B♭ 两行是 unicode 入口在全仓几乎唯一的覆盖点，不可省。
    const pitchCases: Array<{ label: string; input: string; expected: RootSegment }> = [
      { label: 'C（自然音，大写）', input: 'C', expected: ['C', 0] },
      { label: 'G（自然音，大写）', input: 'G', expected: ['G', 0] },
      { label: 'b（自然音，小写 → 归一是 B）', input: 'b', expected: ['B', 0] },
      { label: 'C#（ascii 升号）', input: 'C#', expected: ['C', 1] },
      { label: 'F♯（unicode 升号）', input: 'F♯', expected: ['F', 1] },
      { label: 'g#（小写字母 + ascii 升号）', input: 'g#', expected: ['G', 1] },
      { label: 'Db（ascii 降号）', input: 'Db', expected: ['D', -1] },
      { label: 'B♭（unicode 降号）', input: 'B♭', expected: ['B', -1] },
      { label: 'eb（小写字母 + ascii 降号）', input: 'eb', expected: ['E', -1] },
    ];

    it.each(pitchCases)('$label', ({ input, expected }) => {
      expect(parsePitchSegment(input)).toEqual(expected);
    });

    // 负向拒绝契约（唯一一条 null 契约），不并入上表：表内行断言的是「解析结果」而非「拒绝」
    it('should return null for invalid pitches', () => {
      expect(parsePitchSegment('')).toBeNull();
      expect(parsePitchSegment('H')).toBeNull();
      expect(parsePitchSegment('123')).toBeNull();
    });
  });

  describe('pitchSegmentToString', () => {
    // 同一条规则「formatAccidental 按 useUnicode 选 #/♯、b/♭」的全部取值（ascii 与 unicode 两档 × 升降还原）
    const serializeCases: Array<{ label: string; seg: RootSegment; useUnicode: boolean; expected: string }> = [
      { label: 'C#（ascii 档升号）', seg: ['C', 1], useUnicode: false, expected: 'C#' },
      { label: 'Db（ascii 档降号）', seg: ['D', -1], useUnicode: false, expected: 'Db' },
      { label: 'A（ascii 档还原音）', seg: ['A', 0], useUnicode: false, expected: 'A' },
      { label: 'C♯（unicode 档升号）', seg: ['C', 1], useUnicode: true, expected: 'C♯' },
      { label: 'D♭（unicode 档降号）', seg: ['D', -1], useUnicode: true, expected: 'D♭' },
      { label: 'A（unicode 档还原音，无升降号可替换）', seg: ['A', 0], useUnicode: true, expected: 'A' },
    ];

    it.each(serializeCases)('$label', ({ seg, useUnicode, expected }) => {
      expect(pitchSegmentToString(seg, useUnicode)).toBe(expected);
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

    // name → segments → string（ascii / unicode 两档）的往返契约，升降号根音的全部取值
    const roundtripCases: Array<{
      label: string;
      name: string;
      segments: ChordNameSegments;
      ascii: string;
      unicode: string;
    }> = [
      {
        label: 'C#m7：升号根音 + 小七',
        name: 'C#m7',
        segments: { root: ['C', 1], quality: 'm7', extensions: undefined, bass: undefined },
        ascii: 'C#m7',
        unicode: 'C♯m7',
      },
      {
        label: 'Bbmaj7：降号根音 + 大七',
        name: 'Bbmaj7',
        segments: { root: ['B', -1], quality: 'maj7', extensions: undefined, bass: undefined },
        ascii: 'Bbmaj7',
        unicode: 'B♭maj7',
      },
      {
        label: 'G#m7：升号根音（G# 与 Ab 的等音拼写取 #）',
        name: 'G#m7',
        segments: { root: ['G', 1], quality: 'm7', extensions: undefined, bass: undefined },
        ascii: 'G#m7',
        unicode: 'G♯m7',
      },
      {
        label: 'GM9/G#：还原根音 + 升号低音（unicode 只落在低音上）',
        name: 'GM9/G#',
        segments: { root: ['G', 0], quality: 'M9', extensions: undefined, bass: ['G', 1] },
        ascii: 'GM9/G#',
        unicode: 'GM9/G♯',
      },
      {
        label: 'G#/C：升号根音 + 还原低音（低音不带升降号）',
        name: 'G#/C',
        segments: { root: ['G', 1], quality: undefined, extensions: undefined, bass: ['C', 0] },
        ascii: 'G#/C',
        unicode: 'G♯/C',
      },
    ];

    it.each(roundtripCases)('$label', ({ name, segments, ascii, unicode }) => {
      const parsed = nameToSegments(name);
      expect(parsed).toEqual(segments);
      expect(segmentsToString(parsed!)).toBe(ascii);
      expect(segmentsToString(parsed!, true)).toBe(unicode);
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

    it('should parse tension alterations (#9, b9) as whole-word token qualities', () => {
      // D10-A：7#9 / 7b9 在 token 表里是完整配方，quality 取整词，张力音不再散落进 extensions
      const altered = nameToSegments('Eb7#9');
      expect(altered).toEqual({
        root: ['E', -1],
        quality: '7#9',
        extensions: undefined,
        bass: undefined,
      });
      expect(segmentsToString(altered!)).toBe('Eb7#9');
      expect(segmentsToString(altered!, true)).toBe('E♭7♯9');

      // 括号写法收敛到无括号标准形态：C7(b9) → quality '7b9'
      const bracketed = nameToSegments('C7(b9)');
      expect(bracketed).toEqual({
        root: ['C', 0],
        quality: '7b9',
        extensions: undefined,
        bass: undefined,
      });
      expect(segmentsToString(bracketed!)).toBe('C7b9');
    });
  });

  describe('ChordEngine candidate segments generation', () => {
    // 同一条契约「候选结果必须带上可序列化的 nameSegments」：开放和弦与升号横按两种取值
    const candidateCases: Array<{
      label: string;
      notes: NoteInput[];
      capo: number | null;
      chordName: string;
      segments: ChordNameSegments;
    }> = [
      {
        // C standard open chord: x 3 2 0 1 0
        label: 'C 开放和弦（无 capo）：还原根音',
        notes: [
          { stringIndex: 1, pitchIndex: 0, label: 'C' },
          { stringIndex: 2, pitchIndex: 4, label: 'E' },
          { stringIndex: 3, pitchIndex: 7, label: 'G' },
          { stringIndex: 4, pitchIndex: 0, label: 'C' },
          { stringIndex: 5, pitchIndex: 4, label: 'E' },
        ],
        capo: null,
        chordName: 'C',
        segments: { root: ['C', 0], quality: undefined, extensions: undefined, bass: undefined },
      },
      {
        // F# major barre chord: 2 4 4 3 2 2
        label: 'F# 横按和弦（capo 6）：升号根音',
        notes: [
          { stringIndex: 0, pitchIndex: 6, label: 'F#' },
          { stringIndex: 1, pitchIndex: 1, label: 'C#' },
          { stringIndex: 2, pitchIndex: 6, label: 'F#' },
          { stringIndex: 3, pitchIndex: 10, label: 'A#' },
          { stringIndex: 4, pitchIndex: 1, label: 'C#' },
          { stringIndex: 5, pitchIndex: 6, label: 'F#' },
        ],
        capo: 6,
        chordName: 'F#',
        segments: { root: ['F', 1], quality: undefined, extensions: undefined, bass: undefined },
      },
    ];

    it.each(candidateCases)('$label', ({ notes, capo, chordName, segments }) => {
      const result = analyzeChordGraph(notes, capo);
      expect(result.candidates.length).toBeGreaterThan(0);
      const best = result.best;
      expect(best).toBeDefined();
      expect(best?.chordName).toBe(chordName);
      expect(best?.segments).toEqual(segments);
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
              { fret: -1, preferFlat: false },
              { fret: 4, preferFlat: false },
              { fret: 6, preferFlat: false },
              { fret: 6, preferFlat: false },
              { fret: 5, preferFlat: false },
              { fret: 4, preferFlat: false },
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

    it('should synthesize half-diminished as a real m7b5 quality instead of m7 + b5 extension', async () => {
      const { nameToSegments } = await import('@/domains/chord/theory/theory');

      // b5 与张力音语法同形，若被剥进 extensions，quality 会退化成 'm7'，
      // 使 CHORD_QUALITIES 里的 'm7b5' 成为自动解析永远产不出的死枚举（下游只能各自对 suffix 补正则）
      expect(nameToSegments('Am7b5')).toEqual({
        root: ['A', 0],
        quality: 'm7b5',
        extensions: undefined,
        bass: undefined,
      });
      expect(nameToSegments('Cm7(b5)')!.quality).toBe('m7b5');
      expect(nameToSegments('F#m7♭5')!.quality).toBe('m7b5');

      // 属七降五（7b5）与 m(b5) 在 token 表里各有专属整词配方（7b5 / mb5），
      // 都不是半减七，但 quality 同样取整词、张力音不再散落进 extensions（D10-A）
      expect(nameToSegments('C7b5')!.quality).toBe('7b5');
      expect(nameToSegments('C7b5')!.extensions).toBeUndefined();
      expect(nameToSegments('Amb5')!.quality).toBe('mb5');
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
          { fret: -1, preferFlat: false },
          { fret: 0, preferFlat: false },
          { fret: 2, preferFlat: false },
          { fret: 2, preferFlat: false },
          { fret: 2, preferFlat: false },
          { fret: 0, preferFlat: false },
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
