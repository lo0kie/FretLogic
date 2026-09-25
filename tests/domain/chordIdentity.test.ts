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

/** 指纹的输入型；就地改写用例依赖它的可写字段 */
type FingerprintInput = Parameters<typeof computeChordFingerprint>[0];

/** 签名覆盖哪些字段：三种就地改写同属一条规则（指纹必须跟随签名字段变化，不能被缓存钉死） */
const mutationCases = [
  {
    label: '就地改写琴弦品位后指纹跟着变 —— 签名覆盖 strSig，不会被缓存钉死',
    mutate: (chord: FingerprintInput) => {
      chord.strings[1]!.fret = 4;
    },
  },
  {
    label: '就地改写根音标记后指纹跟着变 —— 签名覆盖 rootStringIndex',
    mutate: (chord: FingerprintInput) => {
      chord.rootStringIndex = 1;
    },
  },
  {
    label: '对象被就地改写后指纹跟着变 —— 缓存按输入签名核对，不钉死旧值',
    mutate: (chord: FingerprintInput) => {
      chord.fretOffset = 5;
    },
  },
];

/**
 * 名称键归一化：字符串与和弦对象两种入参给出同一个键。
 *
 * `expected` 必须是**归一化后的字面量**，不能再写成 `nameKeyOf(expected)` —— 那等于拿被测函数
 * 当自己的期望值：把 trim / toLowerCase 整段删掉，两侧一起变成原文，用例照样绿。
 */
const nameKeyCases: { label: string; value: Parameters<typeof nameKeyOf>[0]; expected: string }[] = [
  { label: '名称键忽略大小写与首尾空白', value: '  Cmaj7 ', expected: 'cmaj7' },
  { label: '和弦对象与它的名字字符串归一到同一个键', value: makeChord(), expected: 'cmaj7' },
];

describe('和弦身份判定', () => {
  it.each(mutationCases)('$label', ({ mutate }) => {
    const chord = makeChord();
    const before = computeChordFingerprint(chord);
    mutate(chord);
    expect(computeChordFingerprint(chord)).not.toBe(before);
  });

  it.each(nameKeyCases)('$label', ({ value, expected }) => {
    expect(nameKeyOf(value)).toBe(expected);
  });
});
