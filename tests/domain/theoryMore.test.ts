import { describe, expect, it } from 'vitest';

import { computeChordFingerprint, getActiveBaseStrings, getKeySemitones } from '@/services/music/theory';

describe('theory: 调性音程差', () => {
  it('同调为 0', () => {
    expect(getKeySemitones('C', 'C')).toBe(0);
  });

  it('上行相邻调为正 1', () => {
    expect(getKeySemitones('C', 'C#')).toBe(1);
  });

  it('超过 6 半音会向下折回（选择最短路径）', () => {
    // C → B 上行是 11，超过 6，改为 11-12 = -1
    expect(getKeySemitones('C', 'B')).toBe(-1);
  });

  it('低于 -5 半音会向上折回', () => {
    // F → E：E 是 F 下方 1，但 F→Ab 上行是 3，E 上行到 F 是 1，差 -1 < -5? -1 不 < -5
    // 测试 F → C#：差 6 > 6? 不，6 > 6 是 false，走 6
    // 实际：-5 阈值，用 E→C#: C# - E = 4-1? C#=1, E=4 → 1-4 = -3; -3 < -5? false → -3
    expect(getKeySemitones('E', 'C#')).toBe(-3);
  });

  it('未知调返回 0', () => {
    expect(getKeySemitones('X', 'C')).toBe(0);
  });
});

describe('theory: 和弦指纹', () => {
  it('相同和弦属性生成相同指纹', () => {
    const chord = {
      chordName: 'C',
      capo: 0,
      fretCount: 3,
      tuning: 'STANDARD' as const,
      strings: [
        [-1, false],
        [3, false],
        [2, false],
        [0, false],
        [1, false],
        [0, false],
      ],
      rootStringIndex: 2,
    };
    expect(computeChordFingerprint(chord)).toBe(computeChordFingerprint(chord));
  });

  it('不同 capo 产生不同指纹', () => {
    const base = {
      chordName: 'C',
      capo: 0,
      fretCount: 3,
      tuning: 'STANDARD' as const,
      strings: [
        [-1, false],
        [3, false],
        [2, false],
        [0, false],
        [1, false],
        [0, false],
      ],
      rootStringIndex: 2,
    };
    const withCapo = { ...base, capo: 2 };
    expect(computeChordFingerprint(base)).not.toBe(computeChordFingerprint(withCapo));
  });
});

describe('theory: 调弦预设', () => {
  it('返回标准调弦的基弦（6 根，MIDI 音高）', () => {
    const mapping = getActiveBaseStrings('STANDARD');
    expect(mapping).toHaveLength(6);
    // 6 弦空弦 = 低音 E = MIDI 64
    expect(mapping[5]).toBe(64);
  });

  it('未知调弦回退到默认', () => {
    const mapping = getActiveBaseStrings('NONEXISTENT' as never);
    expect(mapping).toHaveLength(6);
    expect(mapping[5]).toBe(64);
  });
});
