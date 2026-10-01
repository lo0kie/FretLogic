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
    // extensions 必须逐位原样保留（度数与变音标记都不随移调变化）——
    // transpose.ts:88-92 记录过 { ...e } 摊平元组的事故，退回旧实现时这条必须红
    expect(transposed.extensions).toEqual(segs.extensions);
  });

  it('transposeChordName: 和弦名文本整体移调', () => {
    expect(transposeChordName('C', 2)).toBe('D');
    expect(transposeChordName('Am7', 2)).toBe('Bm7');
    expect(transposeChordName('F#m', 1)).toBe('Gm');
    expect(transposeChordName('C/E', 2)).toBe('D/F#');
    expect(transposeChordName('G7sus4', -2)).toBe('F7sus4');

    // 拼写沿用原写法的升降号：原样移调不该改写音名（曾恒用升号表，Eb → D#、Ab → G#）
    expect(transposeChordName('Eb', 0)).toBe('Eb');
    expect(transposeChordName('Ab', 0)).toBe('Ab');
    expect(transposeChordName('Bb7', 0)).toBe('Bb7');
    expect(transposeChordName('Eb', 2)).toBe('F');
    expect(transposeChordName('Dbm7', 1)).toBe('Dm7');

    // 原写法不带升降号时按记谱习惯定：3 / 8 / 10 用降号，1 / 6 用升号
    expect(transposeChordName('C', 3)).toBe('Eb');
    expect(transposeChordName('C', 8)).toBe('Ab');
    expect(transposeChordName('C', 10)).toBe('Bb');
    expect(transposeChordName('C', 1)).toBe('C#');
    expect(transposeChordName('C', 6)).toBe('F#');
  });

  it('transposeChordEntity: 实体移调保持指法或平移品位', () => {
    const originalChord: Chord = {
      id: toChordId('c_test'),
      groupId: toGroupId('g_test'),
      nameSegments: nameToSegments('Am')!,
      strings: [
        { fret: -1, preferFlat: false },
        { fret: 0, preferFlat: false },
        { fret: 2, preferFlat: false },
        { fret: 2, preferFlat: false },
        { fret: 1, preferFlat: false },
        { fret: 0, preferFlat: false },
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
    expect(transposedNameOnly.strings[2]!.fret).toBe(2);

    // shift_frets 模式：品位平移
    const transposedFretShift = transposeChordEntity(originalChord, 2, { mode: 'shift_frets' });
    expect(getChordName(transposedFretShift)).toBe('Bm');
    expect(transposedFretShift.strings[2]!.fret).toBe(4); // 2 + 2 = 4
    expect(transposedFretShift.strings[0]!.fret).toBe(-1); // 静音弦仍为 -1
  });

  it('shift_frets 移调超出 fretCount 的弦一律静音，不钳到 fretCount（钳完相对品号变了、绝对音高没变）', () => {
    const originalChord: Chord = {
      id: toChordId('c_test'),
      groupId: toGroupId('g_test'),
      nameSegments: nameToSegments('C')!,
      strings: [
        { fret: 3, preferFlat: false },
        { fret: 4, preferFlat: false },
      ],
      fretCount: 4,
      fretOffset: 0,
      tuning: Tuning.STANDARD,
      rootStringIndex: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    // +2 后：3 -> 5、4 -> 6，两根弦都越出 fretCount=4 ⇒ 一律静音 -1。
    // 旧实现钳到 4 会得到 [4, 4]：`strings[].fret` 是窗口内**相对**品位（绝对品位 = fretOffset + fret），
    // 钳制只压回了相对品号、绝对音高没跟着变 —— 和弦名已升两个半音而实际音高没升，
    // 且两个不同的音一起塌成同一品。
    const shifted = transposeChordEntity(originalChord, 2, { mode: 'shift_frets' });
    expect(shifted.strings[0]!.fret).toBe(-1);
    expect(shifted.strings[1]!.fret).toBe(-1);
  });

  it('shift_frets 只静音越界的那根弦，仍在窗口内的弦保留平移结果', () => {
    const originalChord: Chord = {
      id: toChordId('c_test'),
      groupId: toGroupId('g_test'),
      nameSegments: nameToSegments('C')!,
      strings: [
        { fret: 2, preferFlat: false },
        { fret: 4, preferFlat: false },
      ],
      fretCount: 4,
      fretOffset: 0,
      tuning: Tuning.STANDARD,
      rootStringIndex: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    // 2 + 2 = 4 仍在窗口内（保留），4 + 2 = 6 越界（静音）
    const shifted = transposeChordEntity(originalChord, 2, { mode: 'shift_frets' });
    expect(shifted.strings[0]!.fret).toBe(4);
    expect(shifted.strings[1]!.fret).toBe(-1);
  });

  it('shift_frets 负向移调：降到绝对 0 品的弦保留为空弦（0），仍在窗口内的弦保留', () => {
    const originalChord: Chord = {
      id: toChordId('c_test'),
      groupId: toGroupId('g_test'),
      nameSegments: nameToSegments('C')!,
      strings: [
        { fret: 1, preferFlat: false },
        { fret: 3, preferFlat: false },
      ],
      fretCount: 5,
      fretOffset: 0,
      tuning: Tuning.STANDARD,
      rootStringIndex: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    // -1 后：1 -> 0、3 -> 2。落在 0 的那根**保留为 0**，不能静音。
    // 窗口从 0 品起步（`fretOffset === 0`）时 `fret 0` 就是绝对 0 品（空弦），
    // 而它的音高（调弦音 base）恰好等于「原 1 品降一个半音」的目标值 —— `calcNoteMidi`
    // 只在 `fretVal > 0 && fretOffset > 0` 时叠加把位偏移，故 `fret 0` 与 `fret 1` 降 1 个
    // 半音同高。静音会留下「和弦名已降半音、指法却缺了这个音」的残缺和弦。
    // 与顶部 `if (s.fret <= 0) return s` 不矛盾：那条是「原本就是空弦的弦原样返回」，
    // 本条是「按着的品降到了弦枕」—— 后者要重新计算、可能落到 0。
    const shifted = transposeChordEntity(originalChord, -1, { mode: 'shift_frets' });
    expect(shifted.strings[0]!.fret).toBe(0);
    expect(shifted.strings[1]!.fret).toBe(2);
  });

  it('shift_frets 负向移调：窗口不从 0 品起步时，降到 0 的弦仍静音（fret 0 表达不了绝对 fretOffset 品）', () => {
    const originalChord: Chord = {
      id: toChordId('c_test'),
      groupId: toGroupId('g_test'),
      nameSegments: nameToSegments('C')!,
      strings: [
        { fret: 1, preferFlat: false },
        { fret: 3, preferFlat: false },
      ],
      fretCount: 5,
      fretOffset: 3,
      tuning: Tuning.STANDARD,
      rootStringIndex: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    // `fretOffset === 3` 时绝对品位 = 3 + fret：原 1 品（绝对 4）降 1 个半音的目标是绝对 3 品，
    // 但绝对 3 品只能用相对 `fret 0` 表达，而 `fret 0` 被 `calcNoteMidi` 特判为绝对空弦
    // （不吃 offset），音高会掉回调弦音、与目标不符 —— 故仍静音。原 3 品（绝对 6）的目标是
    // 绝对 5 品，用相对 `fret 2` 表达（3 + 2 = 5），保留。
    const shifted = transposeChordEntity(originalChord, -1, { mode: 'shift_frets' });
    expect(shifted.strings[0]!.fret).toBe(-1);
    expect(shifted.strings[1]!.fret).toBe(2);
  });

  it('极端半音数按双取模归一：不会因负下标静默回落成 C', () => {
    // -200 ≡ 4 (mod 12)：C 位移 -200 个半音仍是 E。旧实现用 `(pitch + semitones + 120) % 12`
    // （那个 +120 是 12 的倍数，只对 |semitones| < 120 成立），这里会算出 -8 这个负下标，
    // 拼名时的 `?? 'C'` 于是静默回落成 C —— 名字错了且没有任何信号。
    expect(transposeChordName('C', -200)).toBe('E');
    // 正方向本来就没问题（+120 不改变模 12 结果），留作对照；8 半音的默认拼写偏好降号，故是 Ab
    expect(transposeChordName('C', 200)).toBe('Ab');
  });
});
