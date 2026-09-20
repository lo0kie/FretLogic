/**
 * 通用「忙碌守卫 + loading message + 结果/错误 message」动作管线。
 * 收拢各处重复的样板：互斥守卫 → busy 置位 → loading message → 执行 → 成功提示 /
 * 失败统一提示 → finally 复位 busy 并移除 loading。
 * useSyncService.runCloudAction（自定义错误映射）与本管线（默认错误处理）均基于此。
 */
import { useUiStore } from '@/platform/store/uiStore';

import type { Ref } from 'vue';

export interface RunBusyActionOptions<T> {
  /** 互斥进行中标记（storeToRefs 解出的 ref 或组件内 ref）；省略则不做重入守卫与 busy 置位 */
  busy?: Ref<boolean>;
  /** loading message 文案；省略则不弹 loading（轻量快速动作避免 message 噪音） */
  loadingText?: string;
  /** 实际执行的异步动作 */
  run: () => Promise<T>;
  /** 成功提示：省略则成功时仅移除 loading 不弹成功 message（由调用方在返回后按需追加） */
  successText?: string | ((result: T) => string);
  /** 失败处理：默认 console.error + message.error(err.message ?? fallback)；同步服务传入自定义错误映射 */
  onError?: (err: unknown) => void;
  /** err 非 Error 时的默认错误文案 */
  errorFallback?: string;
  /** 默认错误处理时 console.error 的日志前缀 */
  logPrefix?: string;
  /** 失败时是否向上重抛（调用方自行决定后续流程时使用，如备份解析） */
  rethrowError?: boolean;
}

/**
 * 执行忙碌动作管线。
 * @returns run 的返回值；重入守卫退出或执行失败时返回 null（rethrowError 时失败会抛出原错误）。
 *          成功 message 会在移除 loading 之后才弹出，保证提示顺序正确。
 */
export async function runBusyAction<T>(opts: RunBusyActionOptions<T>): Promise<T | null> {
  const uiStore = useUiStore();
  if (opts.busy?.value) return null;
  if (opts.busy) opts.busy.value = true;
  let loadingMessageId: number | null = null;
  try {
    if (opts.loadingText !== undefined) {
      loadingMessageId = uiStore.message.loading(opts.loadingText, { closable: false });
    }
    const result = await opts.run();
    if (loadingMessageId !== null) uiStore.removeMessage(loadingMessageId);
    if (opts.successText !== undefined) {
      uiStore.message.success(typeof opts.successText === 'function' ? opts.successText(result) : opts.successText);
    }
    return result;
  } catch (err: unknown) {
    if (loadingMessageId !== null) uiStore.removeMessage(loadingMessageId);
    if (opts.onError) {
      opts.onError(err);
    } else {
      if (opts.logPrefix) console.error(opts.logPrefix, err);
      uiStore.message.error(err instanceof Error ? err.message : (opts.errorFallback ?? '操作失败'));
    }
    if (opts.rethrowError) throw err;
    return null;
  } finally {
    if (opts.busy) opts.busy.value = false;
  }
}
