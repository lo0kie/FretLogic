/**
 * useScrollMemory 单测：覆盖三块**类型层保证不了**的运行期语义。
 *
 * 1. `keys` 声明校验 —— 去重、重复上报、越界兜底。档位键的重复在类型层根本不可见
 *    （`['a','a']` 与 `['a']` 同型），越界键也只存在于 JS 调用方或被宽化的动态值里，故只能在此守。
 *    其中"声明为空数组"是最容易被顺手简化掉的一条边界（写成 `keys?.length` 就退化成"完全不校验"）。
 * 2. 记忆按档位键隔离 —— 换档不得互相写坏（新档位的贴回不能把旧档位记的位置抹掉）。
 * 3. 贴回的两条保护 —— ① 被容器钳位的写入不得反过来覆盖记忆；② 补写期间用户自行滚动就放弃补写。
 *
 * 运行环境是 node（logic project）。容器用**假滚动容器**而不是真实元素：本 composable 只用
 * scrollTop 读写与 scroll 监听，而 jsdom 没有排版（scrollTop 恒 0、不派发 scroll），用替身反而
 * 能把"写入被钳到可滚动量上限 + scroll 事件异步派发"这套真实行为写实 —— 那正是贴回逻辑的前提。
 * requestAnimationFrame 在 node 下不存在，统一打桩成"手动驱动的帧队列"，兼防补写循环空转。
 *
 * **时序契约（写用例时必须遵守）**：`restore()` 是"立即写一次 + 下一 tick 再写一次"的两次写入。
 * 所以每次「绑定容器」或「换档」之后都要 `await settle()`（= 两次 nextTick）把内部补写等落定；
 * 只等一次的话，那次补写会漂到你下一个同步动作之后才执行（实测会把容器清零、把档位记忆写坏，
 * 表现为用例假失败）。
 */
import { effectScope, nextTick, ref } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useScrollMemory } from '@/platform/composables/useScrollMemory';

import type { Ref } from 'vue';

const SCOPE_TAG = 'scrollMemory';

/**
 * 假滚动容器：把浏览器的三条关键行为写实。
 * - 写入先钳到"可滚动量上限"，位置没变就不派发事件；
 * - scroll 事件**异步**派发（贴回是先写、再把写入结果记成程序化写入值，同步回调会绕开回声抑制）；
 * - 内容变矮会连带把当前位置钳下来，并派发一次 scroll。
 */
class FakeScroller {
  private scrollTopValue = 0;
  private scrollLimit = 0;
  private pendingScrollEvents = 0;
  private readonly listeners = new Set<() => void>();

  get scrollTop(): number {
    return this.scrollTopValue;
  }

  set scrollTop(next: number) {
    const clamped = this.clamp(next);
    if (clamped === this.scrollTopValue) return;
    this.scrollTopValue = clamped;
    this.pendingScrollEvents += 1;
  }

  /** 用户/外部滚动：位置一定变化并派发 scroll */
  userScrollTo(next: number): void {
    this.scrollTopValue = this.clamp(next);
    this.pendingScrollEvents += 1;
  }

  /** 模拟内容高度变化：可滚动量上限随之改变（变矮时当前位置被连带钳下来） */
  setLimit(limit: number): void {
    this.scrollLimit = limit;
    if (this.scrollTopValue > limit) {
      this.scrollTopValue = limit;
      this.pendingScrollEvents += 1;
    }
  }

  addEventListener(type: string, handler: () => void): void {
    if (type === 'scroll') this.listeners.add(handler);
  }

  removeEventListener(type: string, handler: () => void): void {
    // 与 addEventListener 同一道过滤：只有 scroll 监听登记在表内，其余类型本就没得删
    // （写成无条件 delete 会让 type 变成未使用参数，noUnusedParameters 直接报错）
    if (type === 'scroll') this.listeners.delete(handler);
  }

  /** 派发积压的 scroll 事件（浏览器在下一个任务里派发，这里由用例显式驱动） */
  flushScroll(): void {
    const pending = this.pendingScrollEvents;
    this.pendingScrollEvents = 0;
    for (let index = 0; index < pending; index += 1) for (const listener of [...this.listeners]) listener();
  }

  asElement(): HTMLElement {
    return this as unknown as HTMLElement;
  }

  private clamp(value: number): number {
    return Math.max(0, Math.min(value, this.scrollLimit));
  }
}

let frameCallbacks: Map<number, FrameRequestCallback>;

/** 推进一帧（补写按 rAF 排帧，测试里手动驱动，避免 node 下空转） */
function runNextFrame(): void {
  const next = frameCallbacks.entries().next();
  if (next.done) return;
  const [id, callback] = next.value;
  frameCallbacks.delete(id);
  callback(0);
}

function pendingFrameCount(): number {
  return frameCallbacks.size;
}

/** 等冲刷与 composable 内部那次补写都落定（见文件头「时序契约」） */
async function settle(): Promise<void> {
  await nextTick();
  await nextTick();
}

/** 在 effectScope 里跑一段 composable（scope 负责在用例结束时解绑监听、取消补写帧） */
function runInScope<T>(factory: () => T): { value: T; stop: () => void } {
  const scope = effectScope();
  const value = scope.run(factory) as T;
  return { value, stop: () => scope.stop() };
}

/** 期望值由输入推导，只有"契约文案"本身是字面量 */
const outOfRangeWarning = (scope: string, key: string, declared: readonly string[]) => ({
  message: `档位键「${key}」不在 keys 声明内，该档位没有独立的滚动记忆`,
  extra: { scope, activeKey: key, declaredKeys: [...declared] },
});

const duplicatedWarning = (scope: string, keys: readonly string[], duplicatedKeys: readonly string[]) => ({
  message: `keys 里有重复档位：${duplicatedKeys.join('、')}（重复项共用同一份记忆）`,
  extra: { scope, declaredKeys: [...new Set(keys)] },
});

/**
 * 声明块用例的挂载：`keys` 声明后档位键在类型层已被收窄，越界键**在类型上不可表达**——
 * 这里刻意绕过（被测的正是那条运行期兜底），也是本文件唯一一处**契约**逃逸
 * （用例里的 `keys[0]!` 不在此列：它只是把「夹具恒非空」这条不变量写给类型系统）。
 */
function mountDeclaration(options: { scope: string; keys: readonly string[] | undefined; activeKey: Ref<string> }) {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { stop } = runInScope(() => useScrollMemory({ ...options, target: null } as never));
  return {
    readWarnings: () =>
      warn.mock.calls
        .filter(call => String(call[0]).includes(SCOPE_TAG))
        .map(call => ({ message: String(call[1]), extra: call[2] })),
    stop,
  };
}

beforeEach(() => {
  frameCallbacks = new Map();
  let nextFrameId = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    nextFrameId += 1;
    frameCallbacks.set(nextFrameId, callback);
    return nextFrameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frameCallbacks.delete(id);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useScrollMemory：keys 声明校验', () => {
  it('未声明 keys：不做任何校验，任意档位键都放行', () => {
    const activeKey = ref('任意键');
    const { readWarnings, stop } = mountDeclaration({ scope: 'decl-open', keys: undefined, activeKey });
    expect(readWarnings()).toEqual([]);
    stop();
  });

  it('keys 为空数组是有效声明：不报重复，但任何档位键都被判越界（不得退化成不校验）', () => {
    const activeKey = ref('a');
    const { readWarnings, stop } = mountDeclaration({ scope: 'decl-empty', keys: [], activeKey });
    expect(readWarnings()).toEqual([outOfRangeWarning('decl-empty', 'a', [])]);
    stop();
  });

  it.each([
    { keys: ['a', 'a'], duplicatedKeys: ['a'] },
    { keys: ['a', 'a', 'a'], duplicatedKeys: ['a', 'a'] },
    { keys: ['a', 'b', 'a'], duplicatedKeys: ['a'] },
    { keys: ['b', 'a', 'b', 'a'], duplicatedKeys: ['b', 'a'] },
  ])('重复声明 $keys：上报一次，载荷是去重后的首次出现序', ({ keys, duplicatedKeys }) => {
    // 夹具恒非空 ⇒ 首键必落在声明内，故只会触发「重复」这一条告警（不产生越界告警）
    const activeKey = ref(keys[0]!);
    const { readWarnings, stop } = mountDeclaration({ scope: 'decl-dup', keys, activeKey });
    expect(readWarnings()).toEqual([duplicatedWarning('decl-dup', keys, duplicatedKeys)]);
    stop();
  });

  it('越界档位键反复进出只上报一次，不刷屏', async () => {
    const activeKey = ref('z');
    const { readWarnings, stop } = mountDeclaration({ scope: 'decl-oor', keys: ['x', 'y'], activeKey });
    expect(readWarnings()).toEqual([outOfRangeWarning('decl-oor', 'z', ['x', 'y'])]);

    activeKey.value = 'x'; // 声明内的键：静默
    await nextTick();
    expect(readWarnings()).toHaveLength(1);

    activeKey.value = 'z'; // 再次越界：已被记住，不再重复上报
    await nextTick();
    expect(readWarnings()).toHaveLength(1);
    stop();
  });
});

describe('useScrollMemory：持续记录与贴回', () => {
  it('记忆按档位键隔离：切走再切回位置找回，且未访问过的档位从头开始', async () => {
    const scroller = new FakeScroller();
    scroller.setLimit(2000);
    const activeKey = ref<'a' | 'b'>('a');
    const target = ref<HTMLElement | null>(null);
    const { stop } = runInScope(() =>
      useScrollMemory({ scope: 'mem-switch', keys: ['a', 'b'] as const, activeKey, target })
    );

    target.value = scroller.asElement();
    await settle();

    scroller.userScrollTo(600);
    scroller.flushScroll(); // 持续记录：用户滚动即写进 'a'
    expect(scroller.scrollTop).toBe(600);

    activeKey.value = 'b';
    await settle();
    scroller.flushScroll();
    expect(scroller.scrollTop).toBe(0); // 'b' 从未访问过 ⇒ 从头开始

    activeKey.value = 'a';
    await settle();
    scroller.flushScroll();
    expect(scroller.scrollTop).toBe(600); // 新档位的贴回与记录都没有写坏 'a'

    stop();
  });

  it('贴回被容器钳位时：被钳的值不得覆盖记忆', async () => {
    const tall = new FakeScroller();
    tall.setLimit(5000);
    const activeKey = ref('a');
    const target = ref<HTMLElement | null>(null);
    const { value: handle, stop } = runInScope(() => useScrollMemory({ scope: 'mem-echo', activeKey, target }));

    target.value = tall.asElement();
    await settle();
    tall.userScrollTo(600);
    tall.flushScroll();
    expect(tall.scrollTop).toBe(600);

    // 换绑到"更矮"的新容器（新内容撑不到 600）：这次贴回写入必然被钳到 120
    const short = new FakeScroller();
    short.setLimit(120);
    target.value = short.asElement();
    await settle();
    expect(short.scrollTop).toBe(120);
    short.flushScroll(); // 钳位那次写入的回声

    // 重新读一次记忆：必须仍是 600 —— 若回声被记下，这里会写成被钳的 120
    short.setLimit(5000);
    handle.restore();
    await settle();
    short.flushScroll();
    expect(short.scrollTop).toBe(600);
    stop();
  });

  it('贴回落不了位时逐帧补写：容器长高后落位，且落位后帧自终止', async () => {
    const tall = new FakeScroller();
    tall.setLimit(5000);
    const activeKey = ref('a');
    const target = ref<HTMLElement | null>(null);
    const { stop } = runInScope(() => useScrollMemory({ scope: 'mem-retry', activeKey, target }));

    target.value = tall.asElement();
    await settle();
    tall.userScrollTo(600);
    tall.flushScroll();

    const short = new FakeScroller();
    short.setLimit(120);
    target.value = short.asElement();
    await settle();
    short.flushScroll();
    expect(short.scrollTop).toBe(120);
    expect(pendingFrameCount()).toBeGreaterThan(0); // 没落位 ⇒ 已排补写帧

    short.setLimit(5000); // 容器长高不派发 scroll，只能靠补写贴回
    runNextFrame();
    short.flushScroll();
    expect(short.scrollTop).toBe(600);

    runNextFrame(); // 落位后补写循环必须自己停下来并取消帧
    expect(pendingFrameCount()).toBe(0);
    stop();
  });

  it('补写窗口内用户自行滚动：放弃补写，不与用户抢滚动条', async () => {
    const tall = new FakeScroller();
    tall.setLimit(5000);
    const activeKey = ref('a');
    const target = ref<HTMLElement | null>(null);
    const { stop } = runInScope(() => useScrollMemory({ scope: 'mem-yield', activeKey, target }));

    target.value = tall.asElement();
    await settle();
    tall.userScrollTo(600);
    tall.flushScroll();

    const short = new FakeScroller();
    short.setLimit(120);
    target.value = short.asElement();
    await settle();
    short.flushScroll();
    expect(pendingFrameCount()).toBeGreaterThan(0); // 补写已排帧

    short.userScrollTo(50); // 用户自己滚走了
    short.flushScroll();
    expect(short.scrollTop).toBe(50);

    short.setLimit(5000);
    runNextFrame(); // 补写帧仍在队列里，但必须放弃写入
    expect(short.scrollTop).toBe(50);
    expect(pendingFrameCount()).toBe(0);

    stop();
  });
});
