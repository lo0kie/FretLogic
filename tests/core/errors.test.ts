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

  it('cause 的正反两面：给了就挂上且不进枚举，没给就不创建该属性', () => {
    const cause = new Error('db error');
    const e = errors.storage('同步失败', { context: { url: '/x' }, cause });
    expect(e.context).toEqual({ url: '/x' });
    // lib 升到 ES2022 后 Error 自带 cause?: unknown，直接读取即可（原先要断言成 Error & { cause?: unknown }）
    expect(e.cause).toBe(cause);
    expect(Object.keys(e)).not.toContain('cause');

    // 反面：无条件挂 cause 会让每个错误都带上一个值为 undefined 的属性，日志序列化时凭空多一个键
    expect('cause' in errors.storage('写入被暂停')).toBe(false);
  });
});
