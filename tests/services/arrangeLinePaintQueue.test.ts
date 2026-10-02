/**
 * 排列区分片绘制队列的回归锚点（2026-10-02 由 worker 改回主线程分片）。
 *
 * 钉住四条契约 —— 每一条都对应一个「改错了不报错、只是卡顿或永远不画」的形态：
 *  1. **同一轮排入的批量不在同一轮跑完**：一屏几十行是逐条排入的（每行一个 `onMounted`），若每排
 *     一条就同步把队列跑干净，「队列里永远只有一条」，分片退化成逐条同步执行 —— 首版正是这么写的，
 *     本文件第 1 条用例当场抓到；
 *  2. **先进先出**：先挂载的行先出图，与滚动的观感顺序一致；
 *  3. **取消**：取消过的任务永不执行（父级只挂载视窗内的行，卸载即离屏，视窗优先全靠它）；
 *  4. **取消是幂等的**：对已执行 / 未知的键取消不抛错、不留痕，后续排入照常。
 *
 * 桩说明：不 mock 定时器 —— 队列起跑与片间让出都用 `setTimeout(0)`，本文件就按真实宏任务等它跑。
 * 断言里**不写死片长**（只要求「跑了一部分但没跑完」），改那个常量不会误伤本文件。
 */
import { describe, expect, it } from 'vitest';

import {
  cancelArrangeLinePaint,
  scheduleArrangeLinePaint,
} from '@/domains/score/editor/services/arrangeLinePaintQueue';

/** 排入的任务数：远大于任何合理的片长，才能既看出「没跑完」、又不必知道片长是多少 */
const JOBS = 20;

/** 让出一轮宏任务 */
const nextMacrotask = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/** 让出若干轮宏任务：跑满需要的轮数才看得到后续片 */
const flushMacrotasks = async (turns = 24): Promise<void> => {
  for (let i = 0; i < turns; i++) await nextMacrotask();
};

describe('arrangeLinePaintQueue', () => {
  it('同一轮排入的批量不在同一轮跑完，让出后按排入顺序跑完', async () => {
    const ran: number[] = [];
    const keys = Array.from({ length: JOBS }, (_, i) => scheduleArrangeLinePaint(`fifo-${i}`, () => ran.push(i)));

    // 排入这一轮：一条都不该画（起跑排在宏任务里，同一轮的行要先攒齐）
    expect(ran).toEqual([]);

    // 起跑后的第一轮：只画了一片，没画完 —— 一轮画完就等于没有分片
    await nextMacrotask();
    expect(ran.length).toBeGreaterThan(0);
    expect(ran.length).toBeLessThan(JOBS);

    await flushMacrotasks();

    expect(ran).toEqual(Array.from({ length: JOBS }, (_, i) => i));
    // 键必须互不相同：它由队列全局自增，组件侧各实例的序号会撞
    expect(new Set(keys).size).toBe(JOBS);
  });

  it('取消过的任务永不执行，其余任务照常跑完', async () => {
    const ran: string[] = [];
    const keys = Array.from({ length: JOBS }, (_, i) =>
      scheduleArrangeLinePaint(`cancel-${i}`, () => ran.push(`cancel-${i}`))
    );

    // 取消最后一条：它必定还在队列里（片长远小于 JOBS），不依赖「取消那一刻跑到第几条」
    const dropped = keys[JOBS - 1]!;
    cancelArrangeLinePaint(dropped);

    await flushMacrotasks();

    expect(ran).toEqual(Array.from({ length: JOBS - 1 }, (_, i) => `cancel-${i}`));
  });

  it('对已执行过或未知的键取消是幂等空操作', async () => {
    const ran: string[] = [];
    const key = scheduleArrangeLinePaint('idempotent', () => ran.push('idempotent'));

    await flushMacrotasks();
    expect(ran).toEqual(['idempotent']);

    // 任务已经跑掉：此刻取消既不该抛，也不该影响后续排入
    expect(() => cancelArrangeLinePaint(key)).not.toThrow();
    expect(() => cancelArrangeLinePaint('never-scheduled#999')).not.toThrow();

    scheduleArrangeLinePaint('after-cancel', () => ran.push('after-cancel'));
    await flushMacrotasks();
    expect(ran).toEqual(['idempotent', 'after-cancel']);
  });
});
