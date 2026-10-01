import { describe, expect, it, vi } from 'vitest';

import { createHook } from '@/platform/utils/hook';

/**
 * createHook 是五处「Set + on/emit」实现收口后的唯一来源（persistFailure / motion / idbKv /
 * overlayLifecycle / exitFlush）。它没有别的地方可被间接覆盖，故语义在这里直接钉死 ——
 * 尤其是**广播取快照**这一条：收口前五份里两处取快照、三处直接遍历 Set，是真实存在过的口径差。
 */
describe('createHook 订阅钩子', () => {
  it('on 登记、emit 广播，参数原样透传', () => {
    const hook = createHook<[n: number, s: string]>();
    const seen: [number, string][] = [];
    hook.on((n, s) => seen.push([n, s]));
    hook.emit(1, 'a');
    hook.emit(2, 'b');
    expect(seen).toEqual([
      [1, 'a'],
      [2, 'b'],
    ]);
  });

  it('off 退订生效，且可重复调用（退订幂等）', () => {
    const hook = createHook();
    const listener = vi.fn();
    const off = hook.on(listener);
    hook.emit();
    expect(listener).toHaveBeenCalledTimes(1);

    off();
    off(); // 幂等：再调一次不应抛错，也不应误删别人的订阅
    hook.emit();
    expect(listener).toHaveBeenCalledTimes(1);

    const other = vi.fn();
    hook.on(other);
    hook.emit();
    expect(other).toHaveBeenCalledTimes(1);
  });

  it('广播取快照：回调里新登记的监听本轮收不到，回调里退订自己也不影响本轮其余监听', () => {
    const hook = createHook();
    const order: string[] = [];
    const late = vi.fn();

    hook.on(() => {
      order.push('first');
      hook.on(late); // 本轮不应被调用（直接遍历 Set 的话会被调用）
    });
    const offSelf = hook.on(() => order.push('self'));
    hook.on(() => {
      order.push('third');
      offSelf(); // 退订自己不打断本轮（它已经在本轮快照里了）
    });

    hook.emit();
    expect(order).toEqual(['first', 'self', 'third']);
    expect(late).not.toHaveBeenCalled();

    // 下一轮：新登记的那个才收到
    hook.emit();
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('clear 清空全部订阅', () => {
    const hook = createHook();
    const listener = vi.fn();
    hook.on(listener);
    hook.clear();
    hook.emit();
    expect(listener).not.toHaveBeenCalled();
  });

  it('监听方抛错会中断本轮剩余监听（本模块不吞异常，需兜底的调用方自行包一层）', () => {
    const hook = createHook();
    const after = vi.fn();
    hook.on(() => {
      throw new Error('boom');
    });
    hook.on(after);
    expect(() => hook.emit()).toThrow('boom');
    expect(after).not.toHaveBeenCalled();
  });
});
