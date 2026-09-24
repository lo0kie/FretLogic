import { describe, expect, it } from 'vitest';

import { computeChordFingerprint, nameKeyOf } from '@/domains/chord/theory/chordIdentity';
import { Tuning } from '@/domains/chord/theory/theory';

const strings = (frets: number[]) => frets.map(fret => ({ fret, preferFlat: false }));

const makeChord = () => ({
  chordName: 'Cmaj7',
  fretOffset: 0,
  fretCount: 4,
  tuning: Tuning.STANDARD,
  strings: strings([0, 3, 2, 0, 0, 0]),
  rootStringIndex: null,
});

describe('和弦身份判定', () => {
  it('同一对象重复求值命中缓存且结果一致', () => {
    const chord = makeChord();
    expect(computeChordFingerprint(chord)).toBe(computeChordFingerprint(chord));
  });

  it('对象被就地改写后指纹跟着变 —— 缓存按输入签名核对，不钉死旧值', () => {
    const chord = makeChord();
    const before = computeChordFingerprint(chord);
    chord.fretOffset = 5;
    expect(computeChordFingerprint(chord)).not.toBe(before);
  });

  it('换一根弦的品位即视为另一个和弦', () => {
    const a = makeChord();
    const b = makeChord();
    b.strings = strings([0, 3, 2, 0, 0, 1]);
    expect(computeChordFingerprint(a)).not.toBe(computeChordFingerprint(b));
  });

  it('名称键忽略大小写与首尾空白', () => {
    expect(nameKeyOf('  Cmaj7 ')).toBe(nameKeyOf('cmaj7'));
  });

  it('名称键对和弦对象与它的名字字符串给出同一结果', () => {
    expect(nameKeyOf(makeChord())).toBe(nameKeyOf('Cmaj7'));
  });
});
