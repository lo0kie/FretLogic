/**
 * 浮层层号分配的不变量：**任何时刻不得有两个浮层持有同一个层号**。
 *
 * 缺陷形态（2026-09-26 审查）：`acquireFloatingZ(ceiling)` 直接取
 * `Math.min(max + 1, ceiling, CEILING)`，而 ceiling 是调用方传的「打开中的直接后代的最低层号 - 1」——
 * 它表达的是**上界**，不是空闲位，完全可能正好等于另一个浮层已占用的号。两个浮层并列后：
 * z-index 退回 DOM 顺序裁决（父面板的「置顶」静默失效），且任一先释放就把这个共享号从集合里摘掉
 * （另一个还在用，后续新浮层可能被分配到它头上）。
 *
 * 断言的是层号的**唯一性**这一不变量，不锁具体数值：数值取决于集合里已有多少号，
 * 写死数值会让用例随无关改动而碎。
 */
import { describe, expect, it } from 'vitest';

import { acquireFloatingZ, releaseFloatingZ } from '@/platform/ui/popover/floatingZ';

describe('浮层层号分配', () => {
  it('ceiling 落在已占用层号上时向下让位，绝不并列', () => {
    // 复现 bring-to-front 的真实交错：父面板 P、与 P 同级的 E、P 内部打开的子浮层 C。
    // P 置顶时调用方给的 ceiling 是「C 的层号 - 1」= E 的层号 —— 一个已被占用的号。
    const p = acquireFloatingZ();
    const e = acquireFloatingZ();
    const c = acquireFloatingZ();
    releaseFloatingZ(p); // P 先让位，再以 ceiling 重新取号（置顶）

    const brought = acquireFloatingZ(c - 1);

    // 「让位」的方向是**向下**：结果不得越过 ceiling（它表达的是上界）。
    // 只断言「不并列」是不够的 —— 分配器若从别处（如 max + 1）取一个更高的空闲号，
    // 层号同样互不相同，但父面板会反超自己面板内的子浮层，正是 ceiling 要防的那件事。
    expect(brought).toBeLessThanOrEqual(c - 1);
    expect(brought).not.toBe(e);
    expect(new Set([brought, e, c]).size).toBe(3);

    releaseFloatingZ(brought);
    releaseFloatingZ(e);
    releaseFloatingZ(c);
  });
});
