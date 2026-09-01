/**
 * 统一日志设施。
 * 生产构建会剥离 debug/info；warn/error 保留（但经过统一前缀，便于过滤与后续接入上报）。
 * 取代散落的 console.* 调用。
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const PREFIX = '[fret-logic]';

/** 是否生产环境（构建时静态替换） */
const IS_PROD = import.meta.env.PROD;

/** 统一输出日志：带模块前缀标签，extra 存在时一并输出。 */
function emit(level: LogLevel, scope: string, message: string, extra?: unknown) {
  const tag = `${PREFIX}:${scope}`;
  if (extra !== undefined) {
    console[level](tag, message, extra);
  } else {
    console[level](tag, message);
  }
}

export const logger = {
  debug(scope: string, message: string, extra?: unknown) {
    if (IS_PROD) return;
    emit('debug', scope, message, extra);
  },
  info(scope: string, message: string, extra?: unknown) {
    if (IS_PROD) return;
    emit('info', scope, message, extra);
  },
  warn(scope: string, message: string, extra?: unknown) {
    emit('warn', scope, message, extra);
  },
  error(scope: string, message: string, extra?: unknown) {
    emit('error', scope, message, extra);
  },
};
