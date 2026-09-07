import { describe, expect, it } from 'vitest';

import { toChordId, toGroupId } from '@/domains/chord/theory/entityFactories';
import {
  getChordName,
  nameToSegments,
  transposeChordEntity,
  transposeChordName,
  transposeChordSegments,
  transposePitch,
  transposeRootSegment,
  Tuning,
} from '@/domains/chord/theory/theory';

import type { Chord, RootSegment } from '@/domains/chord/types';

describe('乐理移调核心算法', () => {
  it('transposePitch: 半音位移模 12 循环', () => {
    expect(transposePitch(0, 2)).toBe(2); // C -> D
    expect(transposePitch(11, 1)).toBe(0); // B -> C
    expect(transposePitch(0, -1)).toBe(11); // C -> B
    expect(transposePitch(4, -5)).toBe(11); // E -> B
  });

  it('transposeRootSegment: 根音分片移调与升降号偏好', () => {
    const cRoot: RootSegment = ['C', 0];
    expect(transposeRootSegment(cRoot, 2)).toEqual(['D', 0]);
    expect(transposeRootSegment(cRoot, 1, false)).toEqual(['C', 1]); // C#
    expect(transposeRootSegment(cRoot, 1, true)).toEqual(['D', -1]); // Db

    const fSharp: RootSegment = ['F', 1];
    expect(transposeRootSegment(fSharp, 1)).toEqual(['G', 0]); // F# + 1 -> G
  });

  it('transposeChordSegments: 完整分片结构移调且保留性质与扩展', () => {
    const segs = nameToSegments('Cmaj7(#9)/E')!;
    expect(segs).toBeDefined();

    const transposed = transposeChordSegments(segs, 2); // +2 半音: Dmaj7(#9)/F#
    expect(transposed.root).toEqual(['D', 0]);
    expect(transposed.quality).toBe('maj7');
    expect(transposed.bass).toEqual(['F', 1]); // E + 2 -> F#
  });

  it('transposeChordName: 和弦名文本整体移调', () => {
    expect(transposeChordName('C', 2)).toBe('D');
    expect(transposeChordName('Am7', 2)).toBe('Bm7');
    expect(transposeChordName('F#m', 1)).toBe('Gm');
    expect(transposeChordName('C/E', 2)).toBe('D/F#');
    expect(transposeChordName('G7sus4', -2)).toBe('F7sus4');
  });

  it('transposeChordEntity: 实体移调保持指法或平移品位', () => {
    const originalChord: Chord = {
      id: toChordId('c_test'),
      groupId: toGroupId('g_test'),
      nameSegments: nameToSegments('Am')!,
      strings: [
        [-1, false],
        [0, false],
        [2, false],
        [2, false],
        [1, false],
        [0, false],
      ],
      fretCount: 4,
      fretOffset: 0,
      tuning: Tuning.STANDARD,
      rootStringIndex: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    // 默认模式 update_name：指法品位不变，仅和弦名与元数据更新
    const transposedNameOnly = transposeChordEntity(originalChord, 2);
    expect(getChordName(transposedNameOnly)).toBe('Bm');
    expect(transposedNameOnly.strings[2]![0]).toBe(2);

    // shift_frets 模式：品位平移
    const transposedFretShift = transposeChordEntity(originalChord, 2, { mode: 'shift_frets' });
    expect(getChordName(transposedFretShift)).toBe('Bm');
    expect(transposedFretShift.strings[2]![0]).toBe(4); // 2 + 2 = 4
    expect(transposedFretShift.strings[0]![0]).toBe(-1); // 静音弦仍为 -1
  });
});
