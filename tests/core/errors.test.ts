import { describe, expect, it } from 'vitest';

import { AppError, errors } from '@/platform/services/errors';

describe('AppError', () => {
  it('工厂函数构造带分类的存储错误', () => {
    const e = errors.storage('底层写入失败');
    expect(e).toBeInstanceOf(AppError);
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe('STORAGE');
  });

  it('context 与 cause 被保留，cause 不进枚举（手动挂接的 ES2022 兼容路径）', () => {
    const cause = new Error('db error');
    const e = errors.storage('同步失败', { context: { url: '/x' }, cause });
    expect(e.context).toEqual({ url: '/x' });
    expect(e.cause).toBe(cause);
    expect(Object.keys(e)).not.toContain('cause');
  });

  it('无 cause 时不创建该属性', () => {
    const e = errors.storage('写入被暂停');
    expect('cause' in e).toBe(false);
  });
});
