/**
 * 懒加载 chunk 的「预取」助手。
 *
 * 预取是纯优化：为了消除「首次点击 → chunk 下载 → 模块求值」的反馈死区，
 * 在空闲/挂载时机提前把 chunk 拉进缓存。它失败不影响功能——用户点击时按原路径重新 import 即可。
 *
 * 因此预取**必须**吞掉失败：`void import('./x')` 遇到 chunk 404 / 断网 / SW 缓存未命中时
 * 会产生未处理的 promise rejection（控制台报错，且无法区分于真实故障），
 * 而调用方的 busy 状态与提示语却宣称「已消除死区」——弱网下这句话是假的却无人知晓。
 * 这里统一降级为 debug 日志（生产构建会剥离 debug），保留可观测性又不惊扰用户。
 *
 * 不做自动重试：重试会把一次失败放大为多次无效网络请求，而用户真实点击本就会重新加载。
 */
import { logger } from './logger';

export const prefetch = (loader: () => Promise<unknown>, scope: string): void =>
  void loader().catch(
    (error: unknown) => void logger.debug(scope, '预取 chunk 失败，将在首次使用时按需重新加载', error)
  );
