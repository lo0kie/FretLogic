import { describe, expect, it } from 'vitest';

import { computeChordFingerprint, nameKeyOf } from '@/domains/chord/theory/chordIdentity';
import { Tuning } from '@/domains/chord/theory/theory';

const strings = (frets: number[]) => frets.map(fret => ({ fret, preferFlat: false }));

/** 显式标注返回类型：默认推断会把 rootStringIndex 定成 `null`，下面的就地改写用例就没法赋值 */
const makeChord = (): Parameters<typeof computeChordFingerprint>[0] => ({
  chordName: 'Cmaj7',
  fretOffset: 0,
  fretCount: 4,
  tuning: Tuning.STANDARD,
  strings: strings([0, 3, 2, 0, 0, 0]),
  rootStringIndex: null,
});

describe('和弦身份判定', () => {
  it('就地改写琴弦品位后指纹跟着变 —— 签名覆盖 strSig，不会被缓存钉死', () => {
    const chord = makeChord();
    const before = computeChordFingerprint(chord);
    chord.strings[1]!.fret = 4;
    expect(computeChordFingerprint(chord)).not.toBe(before);
  });

  it('就地改写根音标记后指纹跟着变 —— 签名覆盖 rootStringIndex', () => {
    const chord = makeChord();
    const before = computeChordFingerprint(chord);
    chord.rootStringIndex = 1;
    expect(computeChordFingerprint(chord)).not.toBe(before);
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
