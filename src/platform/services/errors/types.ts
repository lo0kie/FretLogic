/**
 * 存储层错误分类。
 *
 * 边界：本词汇表只覆盖 IndexedDB 读写失败（`services/storage/idb.ts`、`idbKv.ts`）。
 * 其他层不套用：云同步有自己的 `SyncError`（`app/services/sync/provider.ts`），
 * 其余业务代码直接抛原生 Error，由捕获方按 message 面向用户展示。
 */
export const ErrorCode = {
  /** 存储层（IndexedDB）读写失败 */
  STORAGE: 'STORAGE',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** 带分类与上下文的统一应用错误 */
export interface AppErrorOptions {
  code: ErrorCode;
  /** 附加诊断上下文 */
  context?: Record<string, unknown>;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly context: Record<string, unknown> | undefined;

  constructor(message: string, options: AppErrorOptions) {
    super(message);
    this.name = 'AppError';
    this.code = options.code;
    this.context = options.context;
    if (options.cause !== undefined)
      // 显式 defineProperty 而非 super(message, { cause })：enumerable: false 是本模块的契约
      // —— cause 不进 Object.keys、不参与日志序列化（见 tests/core/errors.test.ts）。
      Object.defineProperty(this, 'cause', {
        value: options.cause,
        writable: true,
        configurable: true,
        enumerable: false,
      });
  }
}

/** 便捷工厂 */
export const errors = {
  storage: (message: string, extra?: Omit<AppErrorOptions, 'code'>) =>
    new AppError(message, { code: ErrorCode.STORAGE, ...extra }),
};
