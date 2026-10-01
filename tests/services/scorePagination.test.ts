import { describe, expect, it } from 'vitest';

import { SCORE_EXPORT_CONFIG } from '@/domains/score/constants';
import { packA4Pages } from '@/domains/score/preview/workers/scoreExportWorker/scoreExportPages';

import type { RenderSegment } from '@/domains/score/preview/workers/scoreExportWorker/scoreExportTypes';

/**
 * A4 分页装箱：`keepLineIntact` 这个开关的两种取向。
 *
 * 关掉它（缺省）时长行按段填充当前页、可以跨页 —— 上一页不会因为「差一点装下」就整段留白；
 * 打开它则整句歌词一定留在同一页。两者只在「整句放不进当前页剩余、却放得进一整页」时才分道，
 * 用例正是照这个区间构造的：高度全部由间距常量推出，**不写死间距数值**（那两档一改，
 * 构造出来的场景会跟着失效，而用例自己看不出来）。
 *
 * `packA4Pages` 只读 `lineIdx` / `contentHeight` / `isContinuation` / `isLastSubLine` / `chars`
 * 与两个边和弦数组，其余量给中性值即可。
 */
const { LINE_ROW_GAP, WRAPPED_LINE_ROW_GAP } = SCORE_EXPORT_CONFIG;

/** 页内容高：任取一个够大的值，下面的高度都相对它推 */
const PAGE_H = 200;
/** 首行高度：只要大于「整句比页高矮的那一点」，两种取向才会一个留、一个走 */
const FIRST_LINE_H = 60;
/** 长行每段的高度：让整句恰好比一整页矮一点（那 10px 就是「差一点装下」的差额） */
const SUB_H = (PAGE_H - LINE_ROW_GAP - WRAPPED_LINE_ROW_GAP - 10) / 2;

const seg = (lineIdx: number, height: number, opts: { continuation?: boolean; last?: boolean } = {}): RenderSegment =>
  ({
    lineIdx,
    chars: [{ char: '字' }],
    isContinuation: opts.continuation ?? false,
    isLastSubLine: opts.last ?? true,
    contentHeight: height,
    width: 10,
    justifyGap: 0,
  }) as RenderSegment;

/** 首行 + 一条折成两段的长行：整句放不进当前页剩余，但放得进一整页 */
const longLineSegments = () => [
  seg(0, FIRST_LINE_H),
  seg(1, SUB_H, { last: false }),
  seg(1, SUB_H, { continuation: true }),
];

describe('A4 分页装箱：长行是否整句同页', () => {
  it('关掉整句保护时按段填充当前页：长行首段与上一行同页', () => {
    const pages = packA4Pages(longLineSegments(), PAGE_H, 0, false);
    expect(pages.map(page => page.map(s => s.lineIdx))).toEqual([[0, 1], [1]]);
  });

  it('打开整句保护时整句移到下一页：上一页只剩首行', () => {
    const pages = packA4Pages(longLineSegments(), PAGE_H, 0, true);
    expect(pages.map(page => page.map(s => s.lineIdx))).toEqual([[0], [1, 1]]);
  });
});
