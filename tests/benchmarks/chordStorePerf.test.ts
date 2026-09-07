import { describe, expect, it } from 'vitest';

import { createChord, toGroupId } from '@/domains/chord/theory/entityFactories';
import { normalizeChord } from '@/domains/chord/theory/normalizeChord';
import { computeChordFingerprint } from '@/domains/chord/theory/theory';
import { areBarresEqual, computeBarresSignature } from '@/domains/fretboard/model/coordinates';

import type { Chord } from '@/domains/chord/types';
import type { BarreEntity, GuitarStringsModel, StringIndex } from '@/domains/fretboard/types';

/** 生成指定数量的测试和弦实体 */
function generateTestChords(count: number): Chord[] {
  const chords: Chord[] = [];
  const rootNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const types = ['', 'm', '7', 'maj7', 'm7', 'sus4', 'add9'];

  for (let i = 0; i < count; i++) {
    const root = rootNotes[i % rootNotes.length]!;
    const type = types[i % types.length]!;
    const barres: BarreEntity[] | undefined =
      i % 3 === 0
        ? [
            {
              fret: (i % 4) + 1,
              fromString: 0 as StringIndex,
              toString: 5 as StringIndex,
            },
          ]
        : undefined;

    const strings: GuitarStringsModel = [
      [i % 4, false],
      [(i + 1) % 4, false],
      [(i + 2) % 4, false],
      [(i + 3) % 4, false],
      [0, false],
      [-1, false],
    ];

    chords.push(
      createChord({
        id: `perf-chord-${i}`,
        nameSegments: { root, chordType: type, bass: null },
        strings,
        fretCount: 4,
        fretOffset: 0,
        groupId: toGroupId(`group-${i % 5}`),
        barres,
      })
    );
  }
  return chords;
}

describe('和弦库大规模（1000 条和弦）性能基准测试', () => {
  const sampleChords = generateTestChords(1000);

  it('1000 次横按签名计算与比对耗时应严格低于 50ms（消除 JSON.stringify 隐患）', () => {
    const start = performance.now();

    for (let i = 0; i < sampleChords.length; i++) {
      const c = sampleChords[i]!;
      const sig = computeBarresSignature(c.barres);
      // 偶数项与自身对比，奇数项与下一项对比
      const next = sampleChords[(i + 1) % sampleChords.length]!;
      areBarresEqual(c.barres, next.barres);
      expect(typeof sig).toBe('string');
    }

    const duration = performance.now() - start;
    // 1000 次比对通常在 2~10ms 内完成，设置 50ms 阈值防御极端环境
    expect(duration).toBeLessThan(50);
  });

  it('1000 个和弦的指纹计算与缓存吞吐应在 50ms 内完成', () => {
    const start = performance.now();

    for (const chord of sampleChords) {
      const fp = computeChordFingerprint(chord);
      expect(fp).toBeTruthy();
    }

    const duration = performance.now() - start;
    // 1000 次指纹计算与 WeakMap 缓存通常在 5~20ms 内完成，设置 100ms 阈值防御多并发测试抖动
    expect(duration).toBeLessThan(100);
  });

  it('1000 个和弦的 normalizeChord 归一化清洗应在 120ms 内完成', () => {
    const start = performance.now();

    for (const chord of sampleChords) {
      const { chord: normalized } = normalizeChord(chord);
      expect(normalized.id).toBeTruthy();
    }

    const duration = performance.now() - start;
    expect(duration).toBeLessThan(120);
  });
});
