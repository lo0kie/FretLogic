import { describe, expect, it, vi } from 'vitest';

vi.mock('@/platform/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/**
 * 每个用例都重新加载模块：`quotaBlocked` 与 `failedKeys` 是模块级状态，跨用例会串味。
 * 连带效果是 logger 也会重新求值，故需要 logger 的用例要在**同一代**里动态取它。
 */
const loadModule = async () => {
  vi.resetModules();
  const mod = await import('@/platform/services/storage/persistFailure');
  const { logger } = await import('@/platform/utils/logger');
  return { ...mod, logger };
};

describe('持久化失败上报', () => {
  it('识别配额超限：按 name 与 message 双重判定', async () => {
    const { isQuotaExceededError } = await loadModule();
    expect(isQuotaExceededError(new DOMException('boom', 'QuotaExceededError'))).toBe(true);
    expect(isQuotaExceededError(new DOMException('boom', 'NS_ERROR_DOM_QUOTA_REACHED'))).toBe(true);
    expect(isQuotaExceededError(new Error('Quota exceeded while writing'))).toBe(true);
    expect(isQuotaExceededError(new Error('普通写入失败'))).toBe(false);
    expect(isQuotaExceededError('字符串错误')).toBe(false);
    expect(isQuotaExceededError(null)).toBe(false);
  });

  it('沿 cause 链下探：原生 DOMException 被包在 cause 上时仍能识别（否则熔断永不置位）', async () => {
    const { isQuotaExceededError } = await loadModule();
    const native = new DOMException('boom', 'QuotaExceededError');
    expect(isQuotaExceededError(Object.assign(new Error('AppError: 写入失败'), { cause: native }))).toBe(true);
    expect(
      isQuotaExceededError(
        Object.assign(new Error('外层'), { cause: Object.assign(new Error('内层'), { cause: native }) })
      )
    ).toBe(true);
    expect(isQuotaExceededError(Object.assign(new Error('外层'), { cause: new Error('内层') }))).toBe(false);
  });

  it('始终落日志；同键在冷却窗口内只通知一次，窗口过后可再次上报', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T00:00:00Z'));
    try {
      const { logger, onPersistFailure, reportPersistFailure } = await loadModule();
      const seen: string[] = [];
      onPersistFailure(info => seen.push(info.key));

      const error = new Error('写入失败');
      reportPersistFailure('chords', error);
      reportPersistFailure('chords', error);
      expect(seen).toEqual(['chords']);
      // 落日志不受去重影响：两次都要留痕
      expect(logger.error).toHaveBeenCalledTimes(2);

      // 推进远超静默窗口的时间后允许再次上报
      vi.setSystemTime(new Date('2026-03-01T00:01:00Z'));
      reportPersistFailure('chords', error);
      expect(seen).toEqual(['chords', 'chords']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('不同键各自独立去重', async () => {
    const { onPersistFailure, reportPersistFailure } = await loadModule();
    const seen: string[] = [];
    onPersistFailure(info => seen.push(info.key));
    const error = new Error('写入失败');
    reportPersistFailure('chords', error);
    reportPersistFailure('songs', error);
    expect(seen).toEqual(['chords', 'songs']);
  });

  it('clearPersistFailure 立即解除冷却，后续失败可马上上报', async () => {
    const { clearPersistFailure, onPersistFailure, reportPersistFailure } = await loadModule();
    const seen: string[] = [];
    onPersistFailure(info => seen.push(info.key));
    const error = new Error('写入失败');
    reportPersistFailure('chords', error);
    reportPersistFailure('chords', error);
    expect(seen).toHaveLength(1);

    clearPersistFailure('chords');
    reportPersistFailure('chords', error);
    expect(seen).toHaveLength(2);
  });

  it('注销订阅后不再收到通知', async () => {
    const { onPersistFailure, reportPersistFailure } = await loadModule();
    const seen: string[] = [];
    const off = onPersistFailure(info => seen.push(info.key));
    off();
    reportPersistFailure('chords', new Error('写入失败'));
    expect(seen).toEqual([]);
  });

  it('配额超限会置位熔断标记（写入型操作据此停摆）', async () => {
    const { isPersistBlocked, reportPersistFailure } = await loadModule();
    expect(isPersistBlocked()).toBe(false);
    reportPersistFailure('chords', new DOMException('boom', 'QuotaExceededError'));
    expect(isPersistBlocked()).toBe(true);
  });
});
