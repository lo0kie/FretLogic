import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerExitFlusher } from '@/platform/services/lifecycle/exitFlush';
import { logger } from '@/platform/utils/logger';

vi.mock('@/platform/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const firePageHide = () => window.dispatchEvent(new Event('pagehide'));

describe('退出前落盘兜底', () => {
  const unregisters: (() => void)[] = [];
  afterEach(() => {
    unregisters.splice(0).forEach(off => off());
    vi.mocked(logger.error).mockClear();
  });

  it('pagehide 触发已登记的回调', () => {
    const flush = vi.fn();
    unregisters.push(registerExitFlusher(flush));
    firePageHide();
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('单个回调抛错不阻断其余回调，且异常不逃逸进 pagehide', () => {
    const order: string[] = [];
    unregisters.push(
      registerExitFlusher(() => {
        throw new Error('落盘失败');
      })
    );
    unregisters.push(registerExitFlusher(() => order.push('after')));

    expect(() => firePageHide()).not.toThrow();
    expect(order).toEqual(['after']);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('注销后不再触发', () => {
    const flush = vi.fn();
    const off = registerExitFlusher(flush);
    off();
    firePageHide();
    expect(flush).not.toHaveBeenCalled();
  });

  it('页面隐藏时经 visibilitychange 触发；仍可见时不触发', () => {
    const flush = vi.fn();
    unregisters.push(registerExitFlusher(flush));

    const original = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
    try {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      expect(flush).not.toHaveBeenCalled();

      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      expect(flush).toHaveBeenCalledTimes(1);
    } finally {
      delete (document as unknown as Record<string, unknown>)['visibilityState'];
      if (original) Object.defineProperty(Document.prototype, 'visibilityState', original);
    }
  });
});
