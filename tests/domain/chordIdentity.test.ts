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

/**
 * 基准输入的指纹**字面量**（未改写时）。
 *
 * 独立期望值：不再只断言「改写后与改写前不同」—— 那种写法的两侧都由被测函数算出，
 * 抓不到「指纹不稳定」（掺了随机量或调用计数器时，before 与 after 必然不同，用例照样绿），
 * 也看不出指纹究竟该长什么样。手写签名串读一眼就能核：改哪个字段、串里哪一段该变。
 */
const BASE_FINGERPRINT = 'Cmaj7:0:4:STANDARD:1:null:0_0|3_0|2_0|0_0|0_0|0_0';

/** 签名覆盖哪些字段：每条用例给出改写后的**字面量**期望值 */
const mutationCases = [
  {
    label: '就地改写琴弦品位后指纹跟着变 —— 签名覆盖 strSig，不会被缓存钉死',
    mutate: (chord: FingerprintInput) => {
      chord.strings[1]!.fret = 4;
    },
    expected: 'Cmaj7:0:4:STANDARD:1:null:0_0|4_0|2_0|0_0|0_0|0_0',
  },
  {
    label: '就地改写根音标记后指纹跟着变 —— 签名覆盖 rootStringIndex',
    mutate: (chord: FingerprintInput) => {
      chord.rootStringIndex = 1;
    },
    expected: 'Cmaj7:0:4:STANDARD:1:1:0_0|3_0|2_0|0_0|0_0|0_0',
  },
  {
    label: '对象被就地改写后指纹跟着变 —— 缓存按输入签名核对，不钉死旧值',
    mutate: (chord: FingerprintInput) => {
      chord.fretOffset = 5;
    },
    expected: 'Cmaj7:5:4:STANDARD:1:null:0_0|3_0|2_0|0_0|0_0|0_0',
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
  it.each(mutationCases)('$label', ({ mutate, expected }) => {
    const chord = makeChord();
    // 改写前先钉住基准值：这样「改写后」的断言不会因为基准值本身被改坏而一起漂
    expect(computeChordFingerprint(chord)).toBe(BASE_FINGERPRINT);
    mutate(chord);
    expect(computeChordFingerprint(chord)).toBe(expected);
  });

  it('指纹幂等：同一输入重复计算得到同一值，且不掺调用次序', () => {
    // 「该变的要变」之外还得有「不该变的不变」——原用例只覆盖前者。
    // 掺了随机量 / 计数器 / 调用序号的实现会让下面任一条失败。
    const first = computeChordFingerprint(makeChord());
    const other = computeChordFingerprint({ ...makeChord(), chordName: 'C7' });
    expect(computeChordFingerprint(makeChord())).toBe(first);
    expect(other).not.toBe(first);
    // 交错再来一轮：次序不该影响结果
    expect(computeChordFingerprint(makeChord())).toBe(first);
    expect(computeChordFingerprint({ ...makeChord(), chordName: 'C7' })).toBe(other);
  });

  it.each(nameKeyCases)('$label', ({ value, expected }) => {
    expect(nameKeyOf(value)).toBe(expected);
  });
});
