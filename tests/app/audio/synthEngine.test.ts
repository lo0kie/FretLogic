import { describe, expect, it } from 'vitest';

import { buildStrumOrder } from '@/app/services/audio/synthEngine';

describe('buildStrumOrder（扫弦弦序）', () => {
  it('low 下扫：低音弦 → 高音弦（0 → 5）', () => {
    expect(buildStrumOrder(6, 'low')).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('high 上扫：高音弦 → 低音弦（5 → 0）', () => {
    expect(buildStrumOrder(6, 'high')).toEqual([5, 4, 3, 2, 1, 0]);
  });

  it('inside-out 由内向外：从中音弦向两侧交替展开', () => {
    // 6 弦 mid=2：2 → 3 → 1 → 4 → 0 → 5
    expect(buildStrumOrder(6, 'inside-out')).toEqual([2, 3, 1, 4, 0, 5]);
  });

  it('inside-out 对奇数弦数从中音弦展开（5 弦 mid=2）', () => {
    expect(buildStrumOrder(5, 'inside-out')).toEqual([2, 3, 1, 4, 0]);
  });

  it('边界：0 弦返回空数组', () => {
    expect(buildStrumOrder(0, 'low')).toEqual([]);
    expect(buildStrumOrder(0, 'inside-out')).toEqual([]);
  });
});
