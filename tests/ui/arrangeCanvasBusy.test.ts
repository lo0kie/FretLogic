/**
 * 排列区「正在构建」标志的状态机：登记即置位、两帧 + 最短可见时长后收口、连续登记顺延。
 *
 * 为什么要钉「顺延」：重排口径在连续操作下会连着变（改字号、拖窗口宽、连续换歌），若第二笔
 * 登记不把上一笔的收口计时清掉，指示条会在第一笔到点时提前关掉 —— 表现为「一段连续的构建里
 * 指示条闪断一次」，而这是纯时序问题，改坏了不会有任何报错。
 *
 * 断言用假时钟推进，不依赖真实帧：`requestAnimationFrame` 在 jsdom 里由定时器实现，
 * 与 `advanceTimersByTime` 同一套时钟。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { isArrangeCanvasBuilding, markArrangeCanvasBuilding } from '@/domains/score/editor/arrangeCanvasBusy';

/** 两帧 rAF（各 16ms）走完、进入最短可见时长窗口所需的时间 */
const TWO_FRAMES_MS = 16 * 3;
/** 最短可见时长（见 arrangeCanvasBusy 的 MIN_VISIBLE_MS）之上再加一点余量 */
const AFTER_MIN_VISIBLE_MS = 500;

describe('排列区构建标志', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('登记后立即置位，两帧 + 最短可见时长之后收口', () => {
    vi.useFakeTimers();

    markArrangeCanvasBuilding();
    expect(isArrangeCanvasBuilding.value).toBe(true);

    vi.advanceTimersByTime(TWO_FRAMES_MS + AFTER_MIN_VISIBLE_MS);
    expect(isArrangeCanvasBuilding.value).toBe(false);
  });

  it('连续登记顺延收口：第一笔的计时不会提前关掉第二笔', () => {
    vi.useFakeTimers();

    markArrangeCanvasBuilding();
    // 第一笔已走完两帧、正在最短可见时长窗口里
    vi.advanceTimersByTime(TWO_FRAMES_MS);

    markArrangeCanvasBuilding();
    // 越过第一笔原本的收口点（若没清掉它的计时，这里就会读到 false）
    vi.advanceTimersByTime(TWO_FRAMES_MS + 100);
    expect(isArrangeCanvasBuilding.value).toBe(true);

    vi.advanceTimersByTime(AFTER_MIN_VISIBLE_MS);
    expect(isArrangeCanvasBuilding.value).toBe(false);
  });
});
