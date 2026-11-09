/**
 * 启动占位进度上报：这条链路是纯 DOM 副作用（Vue 尚未挂载，没有任何响应式出口），
 * 故只能断言「DOM 被改成了什么」，不能靠组件测试。
 *
 * 覆盖五件事：
 *  ① 全局贯穿式映射：阶段内完成度 → 总进度，条宽落在该阶段的区间里；
 *  ② 不确定态（无 phase、无 total）不画假百分比，走 data-indeterminate；
 *  ③ 节流：小幅推进不落笔、换阶段必须落笔 —— 后者是节流最容易误伤的一条
 *    （若把它也按比例阈值吞掉，「卡在 620 / 2000 但阶段已经换了」就看不出来）；
 *  ④ 全程只增不减：并发段报出更小的值时条儿不退回去，这是启动页最刺眼的观感缺陷；
 *  ⑤ withBootPhase 的时长估算：立刻落笔、止步于区间 90%、stop 后不再写 DOM。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BOOT_PHASES,
  isBootSplashMounted,
  reportBootProgress,
  resetBootProgressThrottle,
  withBootPhase,
} from '@/platform/services/boot/bootProgress';

const SPLASH_HTML = `
  <div class="boot-splash" role="status">
    <div class="boot-splash__bar"><div class="boot-splash__bar-fill"></div></div>
    <p class="boot-splash__label">正在加载数据…</p>
  </div>
`;

/** 一个便于断言的测试区间：占总进度的 30% ~ 95% */
const PHASE = { from: 0.3, to: 0.95 };

const label = (): string => document.querySelector('.boot-splash__label')?.textContent ?? '';
const fill = (): HTMLElement => document.querySelector<HTMLElement>('.boot-splash__bar-fill')!;
/**
 * 填充宽度取**数值**而不是字符串：jsdom 会把 `31.0%` 归一成 `31%`（走 parseFloat 再回写），
 * 断言字符串等于在断言 jsdom 的格式化实现，与我们要验证的「比例算对了没有」无关。
 */
const fillPct = (): number => parseFloat(fill().style.width || 'NaN');

describe('bootProgress', () => {
  beforeEach(() => {
    document.body.innerHTML = SPLASH_HTML;
    resetBootProgressThrottle();
  });

  it('阶段内完成度被映射到该阶段的总进度区间', () => {
    reportBootProgress({ label: '正在加载乐谱', phase: PHASE, done: 1000, total: 2000 });
    // 区间 0.3~0.95 的中点 = 0.625
    expect(fillPct()).toBeCloseTo(62.5, 1);
    // 文案显示**该阶段自己的**读数，不是按条宽反算
    expect(label()).toBe('正在加载乐谱 1000 / 2000');
    expect(fill().hasAttribute('data-indeterminate')).toBe(false);
  });

  it('阶段区间端点：0 落在区间起点、满量落在区间终点', () => {
    reportBootProgress({ label: '正在加载乐谱', phase: PHASE, done: 0, total: 2000 });
    expect(fillPct()).toBeCloseTo(30, 1);
    resetBootProgressThrottle();
    reportBootProgress({ label: '正在加载乐谱', phase: PHASE, done: 2000, total: 2000 });
    expect(fillPct()).toBeCloseTo(95, 1);
  });

  it('未给 phase 时退回不确定态，不画假百分比', () => {
    reportBootProgress({ label: '正在准备工作区' });
    expect(label()).toBe('正在准备工作区');
    expect(fill().style.width).toBe('');
    expect(fill().hasAttribute('data-indeterminate')).toBe(true);
  });

  it('有 phase 但未给 total 时停在区间起点（短实心），而不是滑动的空轨', () => {
    reportBootProgress({ label: '正在准备工作区', phase: BOOT_PHASES.prepare });
    expect(label()).toBe('正在准备工作区');
    expect(fillPct()).toBeCloseTo(0, 1);
    expect(fill().hasAttribute('data-indeterminate')).toBe(false);
  });

  it('total 为 0（空库）等同于未知，不显示 0 / 0', () => {
    reportBootProgress({ label: '正在加载乐谱', phase: PHASE, done: 0, total: 0 });
    expect(label()).toBe('正在加载乐谱');
    expect(fillPct()).toBeCloseTo(30, 1);
  });

  it('比例被夹在 [0, 1]：读数越界不画到区间外', () => {
    reportBootProgress({ label: '正在加载乐谱', phase: PHASE, done: 9999, total: 2000 });
    expect(fillPct()).toBeCloseTo(95, 1);
    resetBootProgressThrottle();
    reportBootProgress({ label: '正在加载乐谱', phase: PHASE, done: -5, total: 2000 });
    expect(fillPct()).toBeCloseTo(30, 1);
  });

  it('阶段名变化必须落笔，即使比例推进不足阈值', () => {
    reportBootProgress({ label: '正在加载乐谱', phase: PHASE, done: 620, total: 2000 });
    // 620/2000 → 625/2000 只推进 0.25%，远低于 1% 阈值
    reportBootProgress({ label: '正在加载乐谱', phase: PHASE, done: 625, total: 2000 });
    expect(label()).toBe('正在加载乐谱 620 / 2000');
    // 但换个阶段名就必须立刻体现
    reportBootProgress({ label: '正在加载和弦库', phase: PHASE, done: 625, total: 2000 });
    expect(label()).toBe('正在加载和弦库 625 / 2000');
  });

  it('同一阶段内小幅推进被节流吞掉（不反复写 DOM）', () => {
    // 阈值是 1%：2000 总量下 20 首以内不落笔
    reportBootProgress({ label: '正在加载乐谱', phase: PHASE, done: 100, total: 2000 });
    expect(label()).toBe('正在加载乐谱 100 / 2000');
    reportBootProgress({ label: '正在加载乐谱', phase: PHASE, done: 110, total: 2000 });
    // 推进 0.5%，低于 1% 阈值且未换阶段 ⇒ 不落笔，文案停在上一帧
    expect(label()).toBe('正在加载乐谱 100 / 2000');
  });

  it('全程只增不减：并发段报出更小比例时条儿不退回去', () => {
    reportBootProgress({ label: '正在加载乐谱', phase: BOOT_PHASES.songs, done: 1000, total: 2000 });
    const wide = fillPct();
    // 另一个域（和弦库）也报了一帧，它自己的分母更小 ⇒ 映射出的总进度更低
    reportBootProgress({ label: '正在加载和弦库', phase: BOOT_PHASES.chords, done: 1, total: 2 });
    expect(fillPct()).toBeGreaterThanOrEqual(wide);
  });

  it('阶段区间配置错误（往回拉）不会让条儿倒退，最多停在原地', () => {
    reportBootProgress({ label: '正在加载乐谱', phase: BOOT_PHASES.songs, done: 2000, total: 2000 });
    const wide = fillPct();
    // 人为给一个完全错位的区间：它的终点还不到当前条宽
    reportBootProgress({ label: '越界区间', phase: { from: 0, to: 0.1 }, done: 1, total: 1 });
    expect(fillPct()).toBeGreaterThanOrEqual(wide);
  });

  it('占位节点不存在（已挂载 / 单测环境）时静默返回，不抛错', () => {
    document.body.innerHTML = '';
    expect(() => reportBootProgress({ label: '正在加载乐谱', phase: PHASE, done: 1, total: 2 })).not.toThrow();
  });

  it('isBootSplashMounted 与 reportBootProgress 同口径地判断占位是否还在', () => {
    expect(isBootSplashMounted()).toBe(true);
    document.body.innerHTML = '';
    expect(isBootSplashMounted()).toBe(false);
  });

  it('估算读数（estimated）只推条宽、不显示数字', () => {
    reportBootProgress({ label: '正在加载乐谱', phase: PHASE, done: 5000, total: 10000, estimated: true });
    expect(label()).toBe('正在加载乐谱');
    expect(fillPct()).toBeCloseTo(62.5, 1);
  });

  it('withBootPhase 的估算期间文案不带数字', () => {
    vi.useFakeTimers();
    try {
      withBootPhase(PHASE, '正在准备工作区', 1200).stop();
      expect(label()).toBe('正在准备工作区');
    } finally {
      vi.useRealTimers();
    }
  });

  it('withBootPhase 之后真实读数立刻接管：数字出现且条宽不回退', () => {
    vi.useFakeTimers();
    try {
      const phase = withBootPhase(PHASE, '正在准备工作区', 1200);
      vi.advanceTimersByTime(400);
      const estimatedWide = fillPct();
      phase.stop();
      reportBootProgress({ label: '正在加载乐谱', phase: PHASE, done: 200, total: 2000 });
      expect(label()).toBe('正在加载乐谱 200 / 2000');
      expect(fillPct()).toBeGreaterThanOrEqual(estimatedWide);
    } finally {
      vi.useRealTimers();
    }
  });

  it('withBootPhase 按时间推进比例，且止步于区间的 90%（把末段留给真实读数）', () => {
    vi.useFakeTimers();
    try {
      const phase = withBootPhase(PHASE, '正在准备工作区', 1000);
      vi.advanceTimersByTime(500);
      const midway = fillPct();
      expect(midway).toBeGreaterThan(55);
      expect(midway).toBeLessThan(90);
      // 时间耗尽后停在 0.3 + 0.65*0.9 = 0.885，绝不撞到 95% —— 撞到就会「条儿先满、真实读数再往回看」
      vi.advanceTimersByTime(3000);
      expect(fillPct()).toBeCloseTo(88.5, 0);
      expect(fillPct()).toBeLessThan(95);
      phase.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('withBootPhase 在 stop 后不再写 DOM', () => {
    vi.useFakeTimers();
    try {
      const phase = withBootPhase(PHASE, '正在准备工作区', 1200);
      vi.advanceTimersByTime(200);
      phase.stop();
      const frozen = fill().style.width;
      vi.advanceTimersByTime(5000);
      expect(fill().style.width).toBe(frozen);
    } finally {
      vi.useRealTimers();
    }
  });

  it('withBootPhase 在占位已消失时立即停手，不留定时器', () => {
    vi.useFakeTimers();
    try {
      document.body.innerHTML = '';
      const phase = withBootPhase(PHASE, '正在准备工作区', 1200);
      expect(vi.getTimerCount()).toBe(0);
      phase.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('BOOT_PHASES 的四个区间首尾相接、覆盖 0 → 1，且不重叠', () => {
    const spans = [BOOT_PHASES.prepare, BOOT_PHASES.chords, BOOT_PHASES.songs, BOOT_PHASES.mount];
    expect(spans[0]!.from).toBe(0);
    expect(spans.at(-1)!.to).toBe(1);
    for (let i = 0; i < spans.length; i++) {
      expect(spans[i]!.to).toBeGreaterThan(spans[i]!.from);
      if (i > 0) expect(spans[i]!.from).toBe(spans[i - 1]!.to);
    }
  });
});
