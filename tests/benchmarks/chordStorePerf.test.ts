import { describe, expect, it } from 'vitest';

import { createChord, toGroupId } from '@/domains/chord/theory/entityFactories';
import { normalizeChord } from '@/domains/chord/theory/normalizeChord';
import { computeChordFingerprint, nameToSegments, Tuning } from '@/domains/chord/theory/theory';
import { areBarresEqual, computeBarresSignature } from '@/domains/fretboard/model/coordinates';

import type { Chord } from '@/domains/chord/types';
import type { BarreEntity, BarreFret, GuitarStringsModel, StringIndex } from '@/domains/fretboard/types';

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
              fret: ((i % 4) + 1) as BarreFret,
              fromString: 0 as StringIndex,
              toString: 5 as StringIndex,
            },
          ]
        : undefined;

    const strings: GuitarStringsModel = [
      { fret: i % 4, preferFlat: false },
      { fret: (i + 1) % 4, preferFlat: false },
      { fret: (i + 2) % 4, preferFlat: false },
      { fret: (i + 3) % 4, preferFlat: false },
      { fret: 0, preferFlat: false },
      { fret: -1, preferFlat: false },
    ];

    chords.push(
      createChord({
        id: `perf-chord-${i}`,
        nameSegments: nameToSegments(`${root}${type}`),
        strings,
        fretCount: 4,
        fretOffset: 0,
        groupId: toGroupId(`group-${i % 5}`),
        tuning: Tuning.STANDARD,
        rootStringIndex: null,
        barres,
      })
    );
  }
  return chords;
}

const allChords = generateTestChords(4000);
/** 预切两档规模：切片若放在计时回调里，分配开销会混进测量 */
const CHORDS_X1 = allChords.slice(0, 1000);
const CHORDS_X4 = allChords.slice(0, 4000);

/** 预热一轮（排除 JIT 编译与 WeakMap 冷启动）后取多次运行的最短耗时——最小值是对噪声最稳的估计 */
const timeBest = (fn: () => void, runs = 5): number => {
  fn();
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    best = Math.min(best, performance.now() - start);
  }
  return best;
};

/**
 * 规模不变式：数据量 ×4 时耗时须落在 ×8 以内（线性实现约 ×4，二次实现约 ×16）。
 * 用缩放比而非绝对毫秒阈值——后者测的是 CI 机器的负载而不是被测代码，同机空载与满载
 * 能差一个数量级；本文件要守的从来是「别退化成整库遍历/序列化」这一复杂度量级。
 */
const expectNearLinearScaling = (work: (chords: Chord[]) => void): void => {
  const small = timeBest(() => work(CHORDS_X1));
  const large = timeBest(() => work(CHORDS_X4));
  expect(large).toBeLessThan(small * 8);
};

describe('和弦库规模性能基准', () => {
  // 各用例只保留规模比断言：原先每个用例开头的 typeof/toBeTruthy 前置恒真
  // （被测函数返回类型即 string / 非空），无区分度；「不抛错」已由 expectNearLinearScaling
  // 内部实际调用 work 保证，删掉不损失保障
  it('横按签名与比对随规模近似线性（防御整库 stringify 式退化）', () => {
    expectNearLinearScaling(chords => {
      for (let i = 0; i < chords.length; i++) {
        const c = chords[i]!;
        computeBarresSignature(c.barres);
        // 每条与其下一条比对（取模回绕，末项回到首项）
        areBarresEqual(c.barres, chords[(i + 1) % chords.length]!.barres);
      }
    });
  });

  it('和弦指纹计算与缓存命中随规模近似线性', () => {
    expectNearLinearScaling(chords => {
      for (const chord of chords) computeChordFingerprint(chord);
    });
  });

  it('normalizeChord 归一化清洗随规模近似线性', () => {
    expectNearLinearScaling(chords => {
      for (const chord of chords) normalizeChord(chord);
    });
  });
});
