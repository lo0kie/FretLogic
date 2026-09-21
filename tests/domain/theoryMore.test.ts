import { describe, expect, it } from 'vitest';

import { createChord } from '@/domains/chord/theory/entityFactories';
import {
  computeChordFingerprint,
  getActiveBaseStrings,
  getChordName,
  getKeySemitones,
  nameToSegments,
  sortChordsByRule,
  Tuning,
} from '@/domains/chord/theory/theory';
import { GroupSortRule } from '@/domains/chord/types';

describe('theory: 调内级数排序 (KEY_DEGREE)', () => {
  // 级数排序只由和弦名（根音音高 + 三和弦性质）决定，指法与调弦不参与前两级比较键，
  // 故夹具留空弦即可让断言聚焦在调内判定与级数顺序上。
  const sortedNames = (names: string[], key: string): string[] =>
    sortChordsByRule(
      names.map(name =>
        createChord({
          nameSegments: nameToSegments(name)!,
          strings: [],
          fretCount: 4,
          groupId: 'g_sort_key_degree',
          tuning: Tuning.STANDARD,
          rootStringIndex: null,
        })
      ),
      GroupSortRule.KEY_DEGREE,
      key
    ).map(chord => getChordName(chord));

  it('大调：自然七级按 I~vii° 排列，调外根音（E）殿后', () => {
    expect(sortedNames(['E', 'Bdim', 'Am', 'G', 'F', 'Em', 'Dm', 'C'], 'C')).toEqual([
      'C',
      'Dm',
      'Em',
      'F',
      'G',
      'Am',
      'Bdim',
      'E',
    ]);
  });

  it('自然小调：III/VI/VII 级（C/F/G 之于 Am）属于调内，不得排在借用到的小三和弦之后', () => {
    // E 是自然小调 v 级的大调性质借用（和声小调 V），G# 是升七级导音 → 两者均判调外，按级数殿后
    expect(sortedNames(['G#dim', 'G', 'F', 'Em', 'Dm', 'C', 'Bdim', 'Am', 'E'], 'Am')).toEqual([
      'Am',
      'Bdim',
      'C',
      'Dm',
      'Em',
      'F',
      'G',
      'E',
      'G#dim',
    ]);
  });
});

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

  it('低于 -5 半音会向上折回 12 半音（边界不折）', () => {
    // G(7) → C(0)：差值 -7 低于 -5 阈值，折回 -7 + 12 = 5（不折回则会是 -7）
    expect(getKeySemitones('G', 'C')).toBe(5);
    // 边界：恰为 -5 不折回
    expect(getKeySemitones('G', 'D')).toBe(-5);
    // 恰为 -6 折回为 6
    expect(getKeySemitones('G', 'C#')).toBe(6);
  });

  it('未知调返回 0', () => {
    expect(getKeySemitones('X', 'C')).toBe(0);
  });
});

describe('theory: 和弦指纹', () => {
  const baseChord = {
    chordName: 'C',
    fretOffset: 0,
    fretCount: 3,
    tuning: 'STANDARD' as const,
    strings: [
      { fret: -1, preferFlat: false },
      { fret: 3, preferFlat: false },
      { fret: 2, preferFlat: false },
      { fret: 0, preferFlat: false },
      { fret: 1, preferFlat: false },
      { fret: 0, preferFlat: false },
    ],
    rootStringIndex: 2,
  };

  it('指纹按值派生：两个等值但互相独立的实例得到同一指纹', () => {
    // 刻意不复用同一个对象引用——同引用比同引用只会命中 WeakMap 缓存，测不到派生规则
    expect(computeChordFingerprint({ ...baseChord })).toBe(computeChordFingerprint({ ...baseChord }));
  });

  it('不同 capo 产生不同指纹', () => {
    expect(computeChordFingerprint({ ...baseChord })).not.toBe(
      computeChordFingerprint({ ...baseChord, fretOffset: 2 })
    );
  });
});

describe('theory: 调弦预设', () => {
  it('按弦数裁剪/延伸基弦：同弦数取预设、少于取低音侧、超出按纯四度向下补', () => {
    // 弦数与预设一致：直接取标准调弦映射（1 弦空弦 = 高音 E = MIDI 64）
    const standard = getActiveBaseStrings(Tuning.STANDARD);
    expect(standard).toHaveLength(6);
    expect(standard[5]).toBe(64);

    // 少于预设：取低音侧 EADG，而非从高音侧截取
    expect([...getActiveBaseStrings(Tuning.STANDARD, 4)]).toEqual([40, 45, 50, 55]);

    // 多于预设：按纯四度（-5 半音）向下延伸，低音侧在前、原预设整体后移
    const extended = getActiveBaseStrings(Tuning.STANDARD, 8);
    expect(extended).toHaveLength(8);
    expect(extended[0]).toBe(30);
    expect([...extended.slice(2)]).toEqual([40, 45, 50, 55, 59, 64]);
  });

  // 原先此处还有一条「未知调弦回退到默认」用例，已删——tuning.ts:93 定义
  // DEFAULT_TUNING_MAPPING = TUNING_PRESETS[Tuning.STANDARD].mapping，即默认表就是标准调弦的
  // 映射本身；未知调弦回退后与上一用例返回的是同一引用，「回退」在输出上不可观测。
  // 原断言（6 弦 / mapping[5]=64）与上一用例逐字相同，保留只会是一条恒真用例
});
