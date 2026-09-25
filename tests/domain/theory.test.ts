import { describe, expect, it } from 'vitest';

import {
  areChordsEnharmonicallyEquivalent,
  calcPitchIndex,
  formatStringLabel,
  getDefaultPreferFlatForPitch,
  isAccidentalNote,
} from '@/domains/chord/theory/theory';

// 本文件的用例多为「同一条公式 / 同一条映射规则」的不同取值。原先一值一例，读起来像在测不同行为，
// 实则是同一判据的等价重复（输入不同 ≠ 价值不同）。故按**规则**收成参数表：表内每一行仍各自成断言，
// 任一行的取值被改都会红，检测能力与拆开时完全相同。

describe('theory: 音高计算', () => {
  // 一条公式「基音 + 品位 + 偏移 → 取模 12」的四类取值：空弦不受偏移影响、按品受偏移影响、
  // 高把位归一化。少任何一类，对应的公式分支就没人看。
  it.each([
    { label: '6 弦空弦 = 低 E（标准调弦 base 4）', stringIndex: 5, fret: 0, offset: 0, pitch: 4 },
    { label: '1 弦 3 品 = G（高 E 弦 base 4 + 3）', stringIndex: 0, fret: 3, offset: 0, pitch: 7 },
    { label: '空弦不随 fretOffset 偏移', stringIndex: 5, fret: 0, offset: 2, pitch: 4 },
    { label: '按品随 fretOffset 偏移（4+1+2）', stringIndex: 5, fret: 1, offset: 2, pitch: 7 },
    { label: '1 弦 13 品归一化到 12 平均律（17 % 12）', stringIndex: 0, fret: 13, offset: 0, pitch: 5 },
  ])('$label', ({ stringIndex, fret, offset, pitch }) => {
    expect(calcPitchIndex(stringIndex, fret, offset)).toBe(pitch);
  });
});

describe('theory: 音名格式化', () => {
  it.each([
    { label: '空弦显示自然音名', stringIndex: 5, fret: 0, preferFlat: false, offset: 0, expected: 'E' },
    { label: '静音弦显示 ✕', stringIndex: 3, fret: -1, preferFlat: false, offset: 0, expected: '✕' },
  ])('$label', ({ stringIndex, fret, preferFlat, offset, expected }) => {
    expect(formatStringLabel(stringIndex, fret, preferFlat, offset)).toBe(expected);
  });

  it('升降号偏好只影响变化音显示，自然音不受影响', () => {
    // 原用例传的是自然音 F（pitch 5）——preferFlat 在 composeNoteLabel 里只对变化音生效，
    // 该分支从未被触达。改为在变化音上验证：1 弦 9 品 = C#（pitch 1）
    const sharp = formatStringLabel(0, 9, false, 0);
    const flat = formatStringLabel(0, 9, true, 0);
    expect(sharp).not.toBe(flat); // 偏好确实改变了变化音的写法
    expect(sharp.endsWith('#')).toBe(true);
    expect(flat.endsWith('b')).toBe(true);
    // 自然音不受偏好影响（两条路径输出一致）
    expect(formatStringLabel(0, 1, false, 0)).toBe('F');
    expect(formatStringLabel(0, 1, true, 0)).toBe('F');
  });
});

describe('theory: 变化音', () => {
  it.each([
    { pitch: 1, expected: true, label: 'C# 是变化音' },
    { pitch: 3, expected: true, label: 'Eb 是变化音' },
    { pitch: 0, expected: false, label: 'C 是自然音' },
    { pitch: 7, expected: false, label: 'G 是自然音' },
  ])('$label', ({ pitch, expected }) => {
    expect(isAccidentalNote(pitch)).toBe(expected);
  });
});

describe('theory: 和弦等音异名等价判定 (areChordsEnharmonicallyEquivalent)', () => {
  it.each([
    { a: 'Bbadd9/F#', b: 'A#add9/F#', expected: true, label: 'Bbadd9/F# 与 A#add9/F# 等价' },
    { a: 'A#add9/F#', b: 'Bbadd9/F#', expected: true, label: '反向传入同样等价（对称性）' },
    { a: 'C#m7', b: 'Dbm7', expected: true, label: 'C#m7 与 Dbm7 等价' },
    { a: 'C', b: 'Cm', expected: false, label: '性质不同不等价' },
    { a: 'C/E', b: 'C/Eb', expected: false, label: '低音不同不等价' },
    { a: 'G7', b: 'Gmaj7', expected: false, label: '属七与大七不等价' },
  ])('$label', ({ a, b, expected }) => {
    expect(areChordsEnharmonicallyEquivalent(a, b)).toBe(expected);
  });
});

describe('theory: 乐理默认升降号偏好 (getDefaultPreferFlatForPitch)', () => {
  it.each([
    { pitch: 10, expected: true, label: 'Bb 偏好降记号' },
    { pitch: 3, expected: true, label: 'Eb 偏好降记号' },
    // 音级 8 与 KEY_OPTIONS 的 'Ab'、getPreferredRootLabel 的非小调根音同侧（此前标成 G#，是全表唯一例外）
    { pitch: 8, expected: true, label: 'Ab 偏好降记号（全表唯一例外，曾误标 G#）' },
    { pitch: 22, expected: true, label: '跨八度取模（22 % 12 = 10）' },
    { pitch: 58, expected: true, label: '跨八度取模（58 % 12 = 10，G 弦 3 品）' },
    { pitch: 1, expected: false, label: 'C# 偏好升记号' },
    { pitch: 6, expected: false, label: 'F# 偏好升记号' },
    { pitch: 0, expected: false, label: 'C 为自然音' },
    { pitch: 2, expected: false, label: 'D 为自然音' },
    { pitch: 4, expected: false, label: 'E 为自然音' },
    { pitch: 5, expected: false, label: 'F 为自然音' },
    { pitch: 7, expected: false, label: 'G 为自然音' },
    { pitch: 9, expected: false, label: 'A 为自然音' },
    { pitch: 11, expected: false, label: 'B 为自然音' },
  ])('$label', ({ pitch, expected }) => {
    expect(getDefaultPreferFlatForPitch(pitch)).toBe(expected);
  });
});
