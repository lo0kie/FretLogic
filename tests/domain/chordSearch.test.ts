import { describe, expect, it } from 'vitest';

import { createChord } from '@/domains/chord/theory/entityFactories';
import { matchChordSearch, nameToSegments, Tuning } from '@/domains/chord/theory/theory';

import type { Chord } from '@/domains/chord/types';

/** 夹具：六根空弦按真实 GuitarStringEntity 形状构造（matchChordSearch 只读 nameSegments，弦模型仅占位） */
const openStrings = (): Chord['strings'] => [0, 0, 0, 0, 0, 0].map(fret => ({ fret, preferFlat: false }));

const createMockChord = (chordName: string): Chord =>
  createChord({
    id: `chord-${chordName}`,
    nameSegments: nameToSegments(chordName),
    strings: openStrings(),
    fretCount: 4,
    groupId: 'group-1',
    tuning: Tuning.STANDARD,
    rootStringIndex: null,
  });

describe('matchChordSearch - 智能和弦缩写与模糊匹配', () => {
  it('matches standard and shorthand major 7th chord names', () => {
    const cmaj7 = createMockChord('Cmaj7');

    // 全称搜索
    expect(matchChordSearch(cmaj7, 'Cmaj7')).toBe(true);
    expect(matchChordSearch(cmaj7, 'cmaj7')).toBe(true);

    // 缩写搜索 (CM7, CΔ7, Cδ7)
    expect(matchChordSearch(cmaj7, 'CM7')).toBe(true);
    expect(matchChordSearch(cmaj7, 'cm7')).toBe(true);
    expect(matchChordSearch(cmaj7, 'CΔ7')).toBe(true);
    expect(matchChordSearch(cmaj7, 'cδ7')).toBe(true);
  });

  it('matches augmented chord with + shorthand', () => {
    const caug = createMockChord('Caug');

    expect(matchChordSearch(caug, 'Caug')).toBe(true);
    expect(matchChordSearch(caug, 'C+')).toBe(true);
    expect(matchChordSearch(caug, 'c+')).toBe(true);
  });

  it('matches diminished chord with ° shorthand', () => {
    const cdim = createMockChord('Cdim');

    expect(matchChordSearch(cdim, 'Cdim')).toBe(true);
    expect(matchChordSearch(cdim, 'C°')).toBe(true);
    expect(matchChordSearch(cdim, 'c°')).toBe(true);
  });

  it('matches half-diminished m7b5 with ø7 shorthand', () => {
    const cm7b5 = createMockChord('Cm7b5');

    expect(matchChordSearch(cm7b5, 'Cm7b5')).toBe(true);
    expect(matchChordSearch(cm7b5, 'Cø7')).toBe(true);
    expect(matchChordSearch(cm7b5, 'Cø')).toBe(true);
  });

  it('interchanges unicode accidentals (# vs ♯, b vs ♭)', () => {
    const fSharp = createMockChord('F#m7');
    const bFlat = createMockChord('Bbmaj7');

    // # 匹配 ♯
    expect(matchChordSearch(fSharp, 'F#m7')).toBe(true);
    expect(matchChordSearch(fSharp, 'F♯m7')).toBe(true);

    // b 匹配 ♭
    expect(matchChordSearch(bFlat, 'Bbmaj7')).toBe(true);
    expect(matchChordSearch(bFlat, 'B♭maj7')).toBe(true);
    expect(matchChordSearch(bFlat, 'B♭M7')).toBe(true);
  });

  it('returns false for non-matching queries', () => {
    const cmaj7 = createMockChord('Cmaj7');

    expect(matchChordSearch(cmaj7, 'Dm7')).toBe(false);
    expect(matchChordSearch(cmaj7, 'Caug')).toBe(false);
  });
});
