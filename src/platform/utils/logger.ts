/**
 * 统一日志设施：带 `[fret-logic]:<scope>` 前缀，便于过滤与后续接入上报。
 * 生产构建会剥离 debug/info；warn/error 保留。
 *
 * 适用约定（不是「全仓无裸 console」）：
 * - `src/app` 与 `src/domains` 的运行期事件（同步、导入导出、音频、持久化、清洗等）一律走本模块，
 *   才有统一前缀与生产裁剪策略；唯一例外是开发面板 DevPanel.vue 的本地调试输出。
 * - `platform/ui` 组件与指令的 props 误用告警（BaseSlider / BaseNumberInput / ActionButton /
 *   GlobalNotification / vGridNav 等）以及 runBusyAction 的调用方自定义 logPrefix 保留裸 console：
 *   它们是开发期契约断言而非运行留痕，接进 logger 只会把 scope 变成组件名噪声。
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const PREFIX = '[fret-logic]';

/** 是否生产环境（构建时静态替换） */
const IS_PROD = import.meta.env.PROD;

/** 统一输出日志：带模块前缀标签，extra 存在时一并输出。 */
function emit(level: LogLevel, scope: string, message: string, extra?: unknown) {
  const tag = `${PREFIX}:${scope}`;
  if (extra !== undefined) console[level](tag, message, extra);
  else console[level](tag, message);
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
