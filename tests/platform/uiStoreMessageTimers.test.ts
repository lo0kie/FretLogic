// @vitest-environment jsdom
/**
 * Message 定时器账本（暂停 / 恢复折算剩余）。
 *
 * 背景：弹窗打开时 `pauseAllTimers`、关闭时 `resumeAllTimers`。恢复必须按**已流逝时间折算**出剩余
 * 时长，而不是重新计满；暂停期间墙钟继续走、但倒计时必须冻结。判反的表现是：每开一次弹窗，所有
 * toast 的存活时间就被重置一次 —— 弹窗开着时它们永不消失，或者恢复瞬间集体消失。
 *
 * 用假定时器：这里要断言的正是「时间怎么被记账」，真实时钟既慢又不可控。
 */
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '@/platform/store/uiStore';
import { MESSAGE_DEFAULT_DURATION_MS } from '@/platform/utils/constants';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('uiStore Message 定时器账本', () => {
  it('暂停按已流逝时间折算剩余，恢复后总存活时长仍等于原时长', () => {
    const ui = useUiStore();
    ui.message.info('提示', { duration: 1000 });
    expect(ui.messages).toHaveLength(1);

    vi.advanceTimersByTime(600);
    ui.pauseAllTimers();
    vi.advanceTimersByTime(5000);
    expect(ui.messages).toHaveLength(1);

    ui.resumeAllTimers();
    // 剩余 400ms：若恢复时重新计满 1000ms，这一档之后消息仍然在场（下一档才会红）
    vi.advanceTimersByTime(399);
    expect(ui.messages).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(ui.messages).toHaveLength(0);
  });

  it('暂停期间墙钟继续走，但倒计时冻结在暂停那一刻', () => {
    const ui = useUiStore();
    ui.message.info('提示', { duration: 1000 });

    vi.advanceTimersByTime(200);
    ui.pauseAllTimers();
    // 只推进墙钟、不跑定时器：模拟「弹窗开着过了一分钟」
    vi.setSystemTime(Date.now() + 60_000);
    ui.resumeAllTimers();

    // 剩余必须是暂停时的 800ms，而不是把暂停期间那一分钟也算进去（那样这里会瞬间清空）
    vi.advanceTimersByTime(799);
    expect(ui.messages).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(ui.messages).toHaveLength(0);
  });

  it('常驻型 Message（LOADING / NEUTRAL）不参与自动销毁，恢复定时器也不给它排定销毁', () => {
    const ui = useUiStore();
    ui.message.loading('加载中');
    ui.message.neutral('引导');
    expect(ui.messages).toHaveLength(2);

    ui.pauseAllTimers();
    ui.resumeAllTimers();
    vi.advanceTimersByTime(MESSAGE_DEFAULT_DURATION_MS * 3);

    // 二者的存活由业务显式收尾（任务结束 / 引导关闭），任何定时器都不该把它们摘掉
    expect(ui.messages).toHaveLength(2);
  });
});
