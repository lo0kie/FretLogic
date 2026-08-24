import { describe, expect, it } from 'vitest';
import { AppError, ErrorCode, errors, toAppError } from '@/services/errors';

describe('AppError / toAppError', () => {
  it('工厂函数构造带分类的错误', () => {
    const e = errors.input('无效输入');
    expect(e).toBeInstanceOf(AppError);
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe(ErrorCode.INVALID_INPUT);
    expect(e.message).toBe('无效输入');
    expect(e.userMessage).toBe('无效输入');
  });

  it('userMessage 可覆盖默认 message', () => {
    const e = errors.storage('底层写入失败', { userMessage: '保存失败，请重试' });
    expect(e.userMessage).toBe('保存失败，请重试');
    expect(e.message).toBe('底层写入失败');
  });

  it('context 与 cause 被保留', () => {
    const cause = new Error('db error');
    const e = errors.network('同步失败', { context: { url: '/x' }, cause });
    expect(e.context).toEqual({ url: '/x' });
    expect(e.cause).toBe(cause);
  });

  it('toAppError 透传 AppError', () => {
    const original = errors.io('导出失败');
    expect(toAppError(original)).toBe(original);
  });

  it('toAppError 包装普通 Error 并带上 fallback 分类', () => {
    const wrapped = toAppError(new Error('boom'), ErrorCode.INTERNAL);
    expect(wrapped).toBeInstanceOf(AppError);
    expect(wrapped.code).toBe(ErrorCode.INTERNAL);
    expect(wrapped.message).toBe('boom');
  });

  it('toAppError 兜底非 Error 值', () => {
    const wrapped = toAppError('字符串错误');
    expect(wrapped.code).toBe(ErrorCode.INTERNAL);
    expect(wrapped.message).toBe('字符串错误');
  });
});
