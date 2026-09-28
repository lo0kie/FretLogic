import { describe, expect, it } from 'vitest';

import { resolveSnapOptions } from '@/platform/directives/vScrollbar/scrollbarCore';
import { snapScrollPos, stepScrollPos } from '@/platform/directives/vScrollbar/scrollbarGeometry';

/**
 * 分段吸附的量化与步进（v-scrollbar 的 snap 选项）。
 *
 * 锁的是「一屏一段」布局下滚动位置的合法值集合：宿主按页排内容时，停靠点必须与页边界逐点重合，
 * 且拖拽 / 轨道点击都只能落在停靠点上。这里错了不会报错，只会静默停在两页中间 ——
 * 内容停在半页上、页码读数没有唯一答案，故按几何关系钉住。
 */
describe('v-scrollbar 分段吸附几何', () => {
  it('停靠点与「一屏一段」的页边界逐点重合', () => {
    // 5 页、每页 400px 宽：最大可滚动量 = 4 × 400
    const maxScroll = 1600;
    expect(snapScrollPos(0, maxScroll, 5)).toBe(0);
    expect(snapScrollPos(390, maxScroll, 5)).toBe(400);
    expect(snapScrollPos(1210, maxScroll, 5)).toBe(1200);
    expect(snapScrollPos(1600, maxScroll, 5)).toBe(1600);
  });

  it('量化取最近停靠点，半步为界', () => {
    const maxScroll = 1600;
    expect(snapScrollPos(190, maxScroll, 5)).toBe(0);
    expect(snapScrollPos(210, maxScroll, 5)).toBe(400);
  });

  it('两端恒定不越界（首末停靠点即滚动的两端）', () => {
    const maxScroll = 1600;
    expect(snapScrollPos(-30, maxScroll, 5)).toBe(0);
    expect(snapScrollPos(maxScroll + 50, maxScroll, 5)).toBe(maxScroll);
  });

  it('段数不足或无可滚量时原样返回（不吸附）', () => {
    expect(snapScrollPos(137, 1600, 1)).toBe(137);
    expect(snapScrollPos(137, 1600, 0)).toBe(137);
    expect(snapScrollPos(137, 0, 5)).toBe(137);
  });

  it('步进只走相邻一段：段中出发不跨段，两端不越界', () => {
    const maxScroll = 1600;
    expect(stepScrollPos(400, maxScroll, 5, 1)).toBe(800);
    expect(stepScrollPos(400, maxScroll, 5, -1)).toBe(0);
    // 停在两段之间（如宿主尚未吸附到位）时也只走到相邻那一段
    expect(stepScrollPos(1500, maxScroll, 5, 1)).toBe(1600);
    expect(stepScrollPos(1500, maxScroll, 5, -1)).toBe(1200);
    expect(stepScrollPos(0, maxScroll, 5, -1)).toBe(0);
    expect(stepScrollPos(1600, maxScroll, 5, 1)).toBe(1600);
  });

  it('吸附轴默认取启用轴中的 x，只有纵向滚动条时回落 y', () => {
    expect(resolveSnapOptions({ count: 12 }, ['x', 'y'])).toEqual({ count: 12, axis: 'x' });
    expect(resolveSnapOptions({ count: 12 }, ['y'])).toEqual({ count: 12, axis: 'y' });
    expect(resolveSnapOptions({ count: 12, axis: 'y' }, ['x', 'y'])).toEqual({ count: 12, axis: 'y' });
    // 只有一个位置可停时不算吸附
    expect(resolveSnapOptions({ count: 1 }, ['x'])).toBeNull();
    expect(resolveSnapOptions(undefined, ['x'])).toBeNull();
  });
});
