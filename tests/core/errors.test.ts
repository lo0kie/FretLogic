import { describe, expect, it } from 'vitest';

import { AppError, errors } from '@/platform/services/errors';

describe('AppError', () => {
  it('工厂函数构造带分类的存储错误', () => {
    const e = errors.storage('底层写入失败');
    // toBeInstanceOf(Error) 是继承基类的必然结果、code 又等于工厂字面量——原断言无区分度；
    // 保留类型断言，补上此时唯一未覆盖的契约：message 原样透传、name 被正确覆盖
    expect(e).toBeInstanceOf(AppError);
    expect(e.name).toBe('AppError');
    expect(e.code).toBe('STORAGE');
    expect(e.message).toBe('底层写入失败');
  });

  it('context 与 cause 被保留，cause 不进枚举（手动挂接的 ES2022 兼容路径）', () => {
    const cause = new Error('db error');
    const e = errors.storage('同步失败', { context: { url: '/x' }, cause });
    expect(e.context).toEqual({ url: '/x' });
    // ES2020 lib 无 Error.cause（源码用 defineProperty 手动挂接），窄化读取，运行时同一属性
    expect((e as Error & { cause?: unknown }).cause).toBe(cause);
    expect(Object.keys(e)).not.toContain('cause');
  });

  it('无 cause 时不创建该属性', () => {
    const e = errors.storage('写入被暂停');
    expect('cause' in e).toBe(false);
  });
});
