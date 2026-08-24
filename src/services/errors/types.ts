/** 应用统一的错误码分类 */
export const ErrorCode = {
  /** 输入/参数校验失败 */
  INVALID_INPUT: 'INVALID_INPUT',
  /** 存储层（IndexedDB/localStorage）读写失败 */
  STORAGE: 'STORAGE',
  /** 网络/同步失败（GitHub 同步） */
  NETWORK: 'NETWORK',
  /** 数据损坏/结构不合法 */
  DATA_CORRUPT: 'DATA_CORRUPT',
  /** 导出/导入失败 */
  IO: 'IO',
  /** 音频引擎失败 */
  AUDIO: 'AUDIO',
  /** 未分类的内部错误 */
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** 带分类与上下文的统一应用错误 */
export interface AppErrorOptions {
  code: ErrorCode;
  /** 面向用户的可读消息（可选，未提供时用 message） */
  userMessage?: string;
  /** 附加诊断上下文 */
  context?: Record<string, unknown>;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly userMessage: string;
  readonly context: Record<string, unknown> | undefined;

  constructor(message: string, options: AppErrorOptions) {
    super(message);
    this.name = 'AppError';
    this.code = options.code;
    this.userMessage = options.userMessage ?? message;
    this.context = options.context;
    if (options.cause !== undefined) {
      // ES2022 才支持 Error 构造 options；此处手动挂 cause，保持兼容
      Object.defineProperty(this, 'cause', {
        value: options.cause,
        writable: true,
        configurable: true,
        enumerable: false,
      });
    }
  }
}

/** 将任意未知错误规范化（保证 catch 到的都是 Error） */
export function toAppError(error: unknown, fallbackCode: ErrorCode = ErrorCode.INTERNAL): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error) {
    return new AppError(error.message, { code: fallbackCode, cause: error });
  }
  return new AppError(String(error), { code: fallbackCode, cause: error });
}

/** 便捷工厂 */
export const errors = {
  input: (message: string, extra?: Omit<AppErrorOptions, 'code'>) =>
    new AppError(message, { code: ErrorCode.INVALID_INPUT, ...extra }),
  storage: (message: string, extra?: Omit<AppErrorOptions, 'code'>) =>
    new AppError(message, { code: ErrorCode.STORAGE, ...extra }),
  network: (message: string, extra?: Omit<AppErrorOptions, 'code'>) =>
    new AppError(message, { code: ErrorCode.NETWORK, ...extra }),
  data: (message: string, extra?: Omit<AppErrorOptions, 'code'>) =>
    new AppError(message, { code: ErrorCode.DATA_CORRUPT, ...extra }),
  io: (message: string, extra?: Omit<AppErrorOptions, 'code'>) =>
    new AppError(message, { code: ErrorCode.IO, ...extra }),
  internal: (message: string, extra?: Omit<AppErrorOptions, 'code'>) =>
    new AppError(message, { code: ErrorCode.INTERNAL, ...extra }),
};
