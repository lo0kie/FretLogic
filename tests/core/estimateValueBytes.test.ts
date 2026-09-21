import { describe, expect, it } from 'vitest';

import { estimateValueBytes } from '@/platform/utils/common';

/** 开发面板的缓存字节读数全靠这个估算器，这里锁住它的口径与截断规则 */
describe('estimateValueBytes', () => {
  it('基础口径：字符串按 UTF-16 每字符 2 字节、数值 8 字节、布尔 4 字节，其余原始类型不计', () => {
    expect(estimateValueBytes(null)).toBe(0);
    expect(estimateValueBytes(undefined)).toBe(0);
    expect(estimateValueBytes('')).toBe(0);
    expect(estimateValueBytes('abc')).toBe(6);
    expect(estimateValueBytes(42)).toBe(8);
    expect(estimateValueBytes(BigInt(10))).toBe(8);
    expect(estimateValueBytes(true)).toBe(4);
    expect(estimateValueBytes(Math.max)).toBe(0);
    expect(estimateValueBytes(Symbol('s'))).toBe(0);
  });

  it('数组与普通对象按结构累加：数组不计下标名，对象连键名一起计', () => {
    expect(estimateValueBytes([])).toBe(8);
    expect(estimateValueBytes([1, 2])).toBe(8 + 8 + 8);
    expect(estimateValueBytes({ ab: 1 })).toBe(8 + 'ab'.length * 2 + 8);
    expect(estimateValueBytes({ a: { b: 'xy' } })).toBe(8 + 2 + (8 + 2 + 4));
  });

  it('只计自有可枚举属性：非可枚举属性与原型链上的可枚举属性都不计', () => {
    const obj: Record<string, unknown> = { counted: 1 };
    Object.defineProperty(obj, 'hidden', { value: 'zzzzz', enumerable: false });
    expect(estimateValueBytes(obj)).toBe(8 + 'counted'.length * 2 + 8);

    // 原型链上的可枚举属性：for...in 会遍历到，由 hasOwnProperty 拦下（与 Object.entries 语义一致）
    //
    // 注意：被测量调用必须与断言分开 —— 断言库（chai）内部会做 `for (flag in flags) target[flag] = ...`
    // 的 flags 复制，在「Object.prototype 上有不可写可枚举属性」的污染窗口内执行任何断言都会撞上只读属性抛错，
    // 报错位置还会伪装成被测函数。因此污染期内只取测量值，清理完再断言。
    Object.defineProperty(Object.prototype, '__estimateProbe__', {
      value: 'yyyyyyyy',
      enumerable: true,
      configurable: true,
    });
    const bytes = (() => {
      try {
        return estimateValueBytes({ own: 'x' });
      } finally {
        const removed = delete (Object.prototype as Record<string, unknown>)['__estimateProbe__'];
        expect(removed).toBe(true);
      }
    })();
    expect(bytes).toBe(8 + 'own'.length * 2 + 2);
  });

  it('类实例与原生容器不猜内部布局，只计对象头', () => {
    expect(estimateValueBytes(new Date())).toBe(8);
    expect(estimateValueBytes(new Map([['a', 1]]))).toBe(8);
    expect(estimateValueBytes(new Set([1]))).toBe(8);

    class Sample {
      value = 'xxxx';
    }
    expect(estimateValueBytes(new Sample())).toBe(8);
  });

  it('null 原型对象按普通对象展开（无原型即无「类实例」判定）', () => {
    const bare = Object.create(null) as Record<string, unknown>;
    bare['a'] = 'xy';
    expect(estimateValueBytes(bare)).toBe(8 + 2 + 4);
  });

  it('环状与重复引用按 0 截断：同一次遍历内每个对象只计一次', () => {
    const cyclic: Record<string, unknown> = { x: 1 };
    cyclic['self'] = cyclic;
    expect(estimateValueBytes(cyclic)).toBe(8 + 2 + 8 + 'self'.length * 2);

    // 共享同一对象的两处只算一次（估算因而偏小，属刻意的近似）
    const shared = { a: 1 };
    expect(estimateValueBytes([shared, shared])).toBe(8 + (8 + 2 + 8));
  });

  it('越界对象整棵截断，而原始类型在深度判断之前返回、不受深度上限约束', () => {
    let deep: unknown = { leaf: 'x' };
    for (let i = 0; i < 6; i++) deep = [deep];
    expect(estimateValueBytes(deep)).toBe(8 * 6);

    let deepString: unknown = 'x';
    for (let i = 0; i < 6; i++) deepString = [deepString];
    expect(estimateValueBytes(deepString)).toBe(8 * 6 + 2);
  });
});
