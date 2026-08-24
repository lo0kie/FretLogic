import { describe, expect, it } from 'vitest';
import { calcPitchIndex, formatStringLabel, isAccidentalNote } from '@/services/music/theory';

describe('theory: 音高计算', () => {
  it('标准调弦下 6 弦空弦为 E (pitch 4)', () => {
    // 低 E 弦：标准调弦 base = 4
    expect(calcPitchIndex(5, 0, 0)).toBe(4);
  });

  it('1 弦 3 品为 G (pitch 7)', () => {
    // 高 E 弦 base = 4，+3 品 = 7
    expect(calcPitchIndex(0, 3, 0)).toBe(7);
  });

  it('变调夹影响按品音高但不影响空弦', () => {
    // 空弦不随 capo 偏移
    expect(calcPitchIndex(5, 0, 2)).toBe(4);
    // 按品随 capo 偏移：6 弦 1 品 + capo2 = 4+1+2 = 7
    expect(calcPitchIndex(5, 1, 2)).toBe(7);
  });

  it('音高结果归一化到 12 平均律', () => {
    // 1 弦 13 品（高一个八度的 F）= 4+13 = 17 % 12 = 5
    expect(calcPitchIndex(0, 13, 0)).toBe(5);
  });
});

describe('theory: 音名格式化', () => {
  it('空弦显示自然音名', () => {
    expect(formatStringLabel(5, 0, false, 0)).toBe('E');
  });

  it('静音弦显示 ✕', () => {
    expect(formatStringLabel(3, -1, false, 0)).toBe('✕');
  });

  it('升降号偏好影响显示', () => {
    // 1 弦 1 品 = F（pitch 5，非变化音）应显示 F
    expect(formatStringLabel(0, 1, false, 0)).toBe('F');
  });
});

describe('theory: 变化音', () => {
  it('升降号音（C#/Eb 等）被识别为变化音', () => {
    expect(isAccidentalNote(1)).toBe(true); // C#
    expect(isAccidentalNote(3)).toBe(true); // Eb
  });

  it('自然音不是变化音', () => {
    expect(isAccidentalNote(0)).toBe(false); // C
    expect(isAccidentalNote(7)).toBe(false); // G
  });
});
