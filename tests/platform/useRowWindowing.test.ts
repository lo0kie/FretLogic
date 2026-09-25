/**
 * useRowWindowing：行窗口几何、窗口引用替换（等值守卫）、缓冲量按帧现读。
 *
 * 用假元素而非真 DOM：本模块只读滚动容器的 rect 与各分区网格元素的 `getBoundingClientRect().top`，
 * 拉一套 jsdom 布局既慢又给不出可判定的几何（jsdom 的 rect 恒为 0），假元素才是能钉住边界的输入。
 */
import { describe, expect, it } from 'vitest';

import { buildRowPlans, useRowWindowing } from '@/platform/composables/useRowWindowing';

import type { VirtualSectionPlan } from '@/platform/composables/useRowWindowing';

/** 假滚动容器：rect 可变，用来在同一实例上模拟「滚动了」 */
const makeScroller = (top: number, height: number) => {
  const rect = { top, height };
  const el = {
    getBoundingClientRect: () => ({ top: rect.top, bottom: rect.top + rect.height }),
  } as unknown as HTMLElement;
  return { el, rect };
};

/** 假分区网格元素：只提供屏幕 y */
const fakeGrid = (top: number) => ({ getBoundingClientRect: () => ({ top, bottom: top }) }) as unknown as HTMLElement;

/**
 * 单分区、10 行、行高 100、行距 0 ⇒ 各行局部 top = 0 / 100 / … / 900；
 * 网格元素屏幕顶钉在 0，故「视口 250~450」等价于「行局部 250~450」。
 */
const makePlan = (): VirtualSectionPlan<number>[] => buildRowPlans([[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]], 1, 0, () => 100);

const setup = (overscanPx: number | (() => number), scroller = makeScroller(250, 200)) => {
  const plan = makePlan();
  const windowing = useRowWindowing<number>({
    getScroller: () => scroller.el,
    getList: () => fakeGrid(0),
    getPlans: () => plan,
    gridSelector: '.grid',
    getGridEls: () => [fakeGrid(0)],
    overscanPx,
  });
  return { ...windowing, scroller };
};

describe('useRowWindowing - 行窗口几何', () => {
  it('缓冲为 0 时只挂与视口相交的行，给足缓冲后向两侧扩到边界', () => {
    const tight = setup(0);
    tight.updateWindow();
    // 视口 250~450：相交的是行 2(200~300) / 3(300~400) / 4(400~500)
    expect(tight.visibleRows(0).map(r => r.top)).toEqual([200, 300, 400]);

    const loose = setup(260);
    loose.updateWindow();
    // 视口扩到 -10~710：首行到行 7(700) 全进窗口
    expect(loose.visibleRows(0).map(r => r.top)).toEqual([0, 100, 200, 300, 400, 500, 600, 700]);
  });

  it('分区行规划为空时该分区窗口为空（不误取相邻分区）', () => {
    const plan: VirtualSectionPlan<number>[] = [...makePlan(), { rows: [], gridHeight: 0 }];
    const windowing = useRowWindowing<number>({
      getScroller: () => makeScroller(250, 200).el,
      getList: () => fakeGrid(0),
      getPlans: () => plan,
      gridSelector: '.grid',
      getGridEls: () => [fakeGrid(0), fakeGrid(0)],
      overscanPx: 0,
    });
    windowing.updateWindow();
    expect(windowing.visibleRows(0)).toHaveLength(3);
    expect(windowing.visibleRows(1)).toEqual([]);
  });
});

describe('useRowWindowing - 缓冲量按帧现读', () => {
  it('overscanPx 传函数时每次算窗口都重读：同一容器上收缩与恢复都要立即生效', () => {
    let overscan = 0;
    const { updateWindow, visibleRows } = setup(() => overscan);

    updateWindow();
    expect(visibleRows(0)).toHaveLength(3);

    // 大位移帧：调用方把缓冲收成 0 → 窗口必须只剩视口本身（构造期读一次的实现会停在上一个值）
    overscan = 260;
    updateWindow();
    expect(visibleRows(0)).toHaveLength(8);

    overscan = 0;
    updateWindow();
    expect(visibleRows(0)).toHaveLength(3);
  });
});

describe('useRowWindowing - 窗口引用替换（等值守卫）', () => {
  it('区间未变时不替换引用，真变了才替换', () => {
    const { windowRanges, updateWindow, scroller } = setup(0);

    updateWindow();
    const first = windowRanges.value;
    expect(first[0]).toEqual({ first: 2, last: 4 });

    // 同一帧内被多处调用（滚动合帧 / 分区变化）：区间没动就不能换引用，
    // 否则下游整屏重渲染会在每滚动帧白付一次
    updateWindow();
    expect(windowRanges.value).toBe(first);

    // 位置真变了（视口 500~700 → 相交行 5 / 6）：必须换引用，否则窗口永远停在旧位置
    scroller.rect.top = 500;
    updateWindow();
    expect(windowRanges.value).not.toBe(first);
    expect(windowRanges.value[0]).toEqual({ first: 5, last: 6 });
  });
});
