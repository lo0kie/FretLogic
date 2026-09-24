import { describe, expect, it } from 'vitest';

import {
  areChordsEnharmonicallyEquivalent,
  calcPitchIndex,
  formatStringLabel,
  getDefaultPreferFlatForPitch,
  isAccidentalNote,
} from '@/domains/chord/theory/theory';

describe('theory: 音高计算', () => {
  it('标准调弦下 6 弦空弦为 E (pitch 4)', () => {
    // 低 E 弦：标准调弦 base = 4
    expect(calcPitchIndex(5, 0, 0)).toBe(4);
  });

  it('1 弦 3 品为 G (pitch 7)', () => {
    // 高 E 弦 base = 4，+3 品 = 7
    expect(calcPitchIndex(0, 3, 0)).toBe(7);
  });

  it('品位偏移影响按品音高但不影响空弦', () => {
    // 空弦不随 fretOffset 偏移
    expect(calcPitchIndex(5, 0, 2)).toBe(4);
    // 按品随 fretOffset 偏移：6 弦 1 品 + offset2 = 4+1+2 = 7
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
  it('升降号音（C#/Eb 等）被识别为变化音', () => {
    expect(isAccidentalNote(1)).toBe(true); // C#
    expect(isAccidentalNote(3)).toBe(true); // Eb
  });

  it('自然音不是变化音', () => {
    expect(isAccidentalNote(0)).toBe(false); // C
    expect(isAccidentalNote(7)).toBe(false); // G
  });
});

describe('theory: 和弦等音异名等价判定 (areChordsEnharmonicallyEquivalent)', () => {
  it('识别 Bbadd9/F# 与 A#add9/F# 等音异名完全等价', () => {
    expect(areChordsEnharmonicallyEquivalent('Bbadd9/F#', 'A#add9/F#')).toBe(true);
    expect(areChordsEnharmonicallyEquivalent('A#add9/F#', 'Bbadd9/F#')).toBe(true);
  });

  it('识别 C#m7 与 Dbm7 等音异名完全等价', () => {
    expect(areChordsEnharmonicallyEquivalent('C#m7', 'Dbm7')).toBe(true);
  });

  it('不同性质或低音和弦正确判定为不等价', () => {
    expect(areChordsEnharmonicallyEquivalent('C', 'Cm')).toBe(false);
    expect(areChordsEnharmonicallyEquivalent('C/E', 'C/Eb')).toBe(false);
    expect(areChordsEnharmonicallyEquivalent('G7', 'Gmaj7')).toBe(false);
  });
});

describe('theory: 乐理默认升降号偏好 (getDefaultPreferFlatForPitch)', () => {
  it('音高 3 (Eb)、8 (Ab)、10 (Bb) 默认偏好降记号', () => {
    expect(getDefaultPreferFlatForPitch(10)).toBe(true); // Bb
    expect(getDefaultPreferFlatForPitch(3)).toBe(true); // Eb
    // 音级 8 与 KEY_OPTIONS 的 'Ab'、getPreferredRootLabel 的非小调根音同侧（此前标成 G#，是全表唯一例外）
    expect(getDefaultPreferFlatForPitch(8)).toBe(true); // Ab
    // 跨八度取模验证
    expect(getDefaultPreferFlatForPitch(22)).toBe(true); // 22 % 12 = 10
    expect(getDefaultPreferFlatForPitch(58)).toBe(true); // 58 % 12 = 10 (G弦3品)
  });

  it('音高 1 (C#), 6 (F#) 默认偏好升记号', () => {
    expect(getDefaultPreferFlatForPitch(1)).toBe(false); // C#
    expect(getDefaultPreferFlatForPitch(6)).toBe(false); // F#
  });

  it('自然音级默认偏好升记号标志 false', () => {
    expect(getDefaultPreferFlatForPitch(0)).toBe(false); // C
    expect(getDefaultPreferFlatForPitch(2)).toBe(false); // D
    expect(getDefaultPreferFlatForPitch(4)).toBe(false); // E
    expect(getDefaultPreferFlatForPitch(5)).toBe(false); // F
    expect(getDefaultPreferFlatForPitch(7)).toBe(false); // G
    expect(getDefaultPreferFlatForPitch(9)).toBe(false); // A
    expect(getDefaultPreferFlatForPitch(11)).toBe(false); // B
  });
});
