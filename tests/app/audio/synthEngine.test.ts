import { describe, expect, it } from 'vitest';

import { buildStrumOrder } from '@/app/services/audio/synthEngine';

// 全部形态收在一张表里：同一个「按方向生成弦序」规则的不同取值（含边界），
// 合并后每行的断言与原先逐条成例时完全一致，检测能力不变。
// 「未收录方向回退 low」原在 synthEngineNative.test.ts，随本表一并收拢——纯函数归纯函数文件。
describe('buildStrumOrder（扫弦弦序）', () => {
  it.each([
    { label: 'low 下扫：低音弦 → 高音弦（0 → 5）', count: 6, direction: 'low', order: [0, 1, 2, 3, 4, 5] },
    { label: 'high 上扫：高音弦 → 低音弦（5 → 0）', count: 6, direction: 'high', order: [5, 4, 3, 2, 1, 0] },
    // 6 弦 mid=2：2 → 3 → 1 → 4 → 0 → 5
    {
      label: 'inside-out 由内向外：从中音弦向两侧交替展开',
      count: 6,
      direction: 'inside-out',
      order: [2, 3, 1, 4, 0, 5],
    },
    // 奇数弦数同样取 mid=2：2 → 3 → 1 → 4 → 0
    {
      label: 'inside-out 对奇数弦数从中音弦展开（5 弦 mid=2）',
      count: 5,
      direction: 'inside-out',
      order: [2, 3, 1, 4, 0],
    },
    { label: '边界：0 弦返回空数组（low）', count: 0, direction: 'low', order: [] as number[] },
    { label: '边界：0 弦返回空数组（inside-out 早退分支）', count: 0, direction: 'inside-out', order: [] as number[] },
    {
      label: '未收录的方向回退为 low 顺序（不抛、不返回 undefined）',
      count: 3,
      direction: 'unknown',
      order: [0, 1, 2],
    },
  ] as const)('$label', ({ count, direction, order }) => {
    expect(buildStrumOrder(count, direction as Parameters<typeof buildStrumOrder>[1])).toEqual(order);
  });
});
