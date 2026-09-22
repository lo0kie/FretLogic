/**
 * 本地持久化失败上报（存储配额超限等）。
 *
 * 为什么单独做一层「上报」而不是就地提示：写入方分布在 domains 层
 * （chordStore 的和弦列表防抖写、songPersistence 的歌曲分片写），而 domains 层
 * 严禁反向依赖 app 层的 UI 状态。这里只负责把「写失败」这一事实抛出去，
 * 由应用装配层注册监听并决定如何呈现（见 app/services/persistFailureNotice.ts）。
 *
 * 去重：同一 key 短时间窗口内连续失败只上报一次 —— 防抖写会按 400ms 节奏反复失败，
 * 不去重会刷屏。历史上依赖调用方写入成功后 clearPersistFailure 解锁，但只有和弦域
 * 一处真的调了，kv/歌曲域的去重锁一旦加上就永不解除，同会话后续写失败全部静默
 * （P1 审计 N 系）。改为冷却窗口去重：窗口过后自动允许再次上报，无需调用方自觉。
 */
import { logger } from '@/platform/utils/logger';

export interface PersistFailureInfo {
  /** 持久化单元标识（存储键名或域内语义名），用于同键去重与提示归因 */
  key: string;
  error: unknown;
}

type PersistFailureListener = (info: PersistFailureInfo) => void;

const listeners = new Set<PersistFailureListener>();
/** 各键最近一次上报失败的时间戳（冷却窗口去重） */
const failedKeys = new Map<string, number>();
/** 同键重复失败的静默窗口：窗口内不重复打扰，窗口过后允许再次上报 */
const DEDUPE_COOLDOWN_MS = 30_000;
/**
 * 配额熔断标记：一旦确认配额超限置位，写入型操作随即停摆——两层的落地方式不同：
 * `idb` 的 put/bulkPut/replaceAll/读写事务直接抛「存储配额已超限，写入已暂停」（调用方按既有
 * 写失败路径处理），`idbKv` 的 flush 则跳过这批 put（内存镜像仍持有新值，读侧不受影响）。
 * 删除/清空类操作不受阻断（用户清理空间后可写）。
 * 仅模块内有效：页面刷新即复位，用户整理空间后可自然恢复写入。
 */
let quotaBlocked = false;

/** 是否已因配额超限触发熔断（写入被暂停） */
export const isPersistBlocked = (): boolean => quotaBlocked;

/** 订阅持久化失败；返回取消订阅函数。 */
export const onPersistFailure = (listener: PersistFailureListener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * 判断错误是否因存储配额超限；各浏览器 name 与文案有差异，故按名字与消息双重识别。
 *
 * ⚠️ 必须**沿 cause 链下探**：`idb.ts` 的 `guard()`（第 187-193 行）把对象库抛出的原生
 * DOMException 统一包成 `AppError`，原始 `QuotaExceededError` 只存在于 `cause` 上。
 * 此前只比对最外层，导致 `quotaBlocked` 永不置位 —— `idb.ts:212/228/251/290` 的四处
 * `isPersistBlocked()` 熔断守卫、`idbKv` 的 flush 跳过、以及「存储配额已超限，写入已暂停」
 * 提示全部成为不可达死码，`migrateLegacy` 删源前的守门也恒为假（P1 审计 #1）。
 * 写法与同目录 `idb.ts:136` 的 `isVersionError` 对齐（它正是走 cause 的）。
 */
export const isQuotaExceededError = (error: unknown): boolean => {
  let current: unknown = error;
  while (current instanceof Error) {
    if (
      typeof DOMException !== 'undefined' &&
      current instanceof DOMException &&
      (current.name === 'QuotaExceededError' || current.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    )
      return true;
    if (/quota/i.test(`${current.name}${current.message}`)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
};

/** 上报一次写入失败：始终落日志；同键在冷却窗口内不重复通知订阅方；配额超限额外触发熔断。 */
export const reportPersistFailure = (key: string, error: unknown): void => {
  logger.error('storage', `持久化写入失败：${key}`, error);
  if (isQuotaExceededError(error)) quotaBlocked = true;
  const now = Date.now();
  const lastReportedAt = failedKeys.get(key);
  if (lastReportedAt !== undefined && now - lastReportedAt < DEDUPE_COOLDOWN_MS) return;
  failedKeys.set(key, now);
  listeners.forEach(listener => listener({ key, error }));
};

/** 写入成功后调用：立即解除该键的冷却，使后续再次失败能马上上报（可选优化，非正确性依赖）。 */
export const clearPersistFailure = (key: string): void => {
  failedKeys.delete(key);
};
