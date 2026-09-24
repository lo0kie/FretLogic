/**
 * 通用「忙碌守卫 + loading message + 结果/错误 message」动作管线。
 * 收拢各处重复的样板：互斥守卫 → busy 置位 → loading message → 执行 → 成功提示 /
 * 失败统一提示 → finally 复位 busy 并移除 loading。
 *
 * **契约**（决定它为何留在 platform，以及动它之前必须先知道的事）：
 *
 * - 唯一的平台外依赖是 `@/platform/store/uiStore`，属 **platform 内部依赖** —— 六条
 *   `import/no-restricted-paths` zone 一条都不涉及，故放在 `platform/composables/` 不构成违规。
 *   真正值得注意的是相反的一面：它是本目录 13 个条目里**唯一**碰 store 的，且消费方全在
 *   app / domains（7 文件 / 18 处调用 + 一个包装器）：app 侧 scoreExportActions、
 *   backupModalActions、useImportExportService、syncActions（另有自定义错误映射的包装器
 *   `runCloudAction`，见 `app/services/sync/syncActions.ts`）；domains 侧 useChordTransfer、
 *   WorkbenchExportPanel、textTransferActions。
 * - 由此得出硬约束：**不能整文件搬到 app 层**，否则 domains 侧那 3 个消费方立刻违反
 *   `domains ↛ app`。要彻底剥离 store 只能把消息 API 改成注入，届时 7 个消费方的调用形态
 *   都得跟着改；换来的只是 platform 纯净化，当前不做。
 * - `useUiStore()` 的调用在**函数体内**（非模块顶层），故仍是「调用方作用域内取 store」的常规
 *   用法：必须在有活跃 Pinia 的组件/handler 中调用，不能在模块初始化时调用。
 */
import { useUiStore } from '@/platform/store/uiStore';

export interface RunBusyActionOptions<T> {
  /**
   * 互斥进行中标记；省略则不做重入守卫与 busy 置位。
   * 接受任何「可读写的 boolean 容器」：storeToRefs/组件内的 Ref，以及 reactive 对象字段
   * （用 `toRef(state, 'key')` 传入）。此前类型写死 `Ref<boolean>`，弹窗侧的 busy 挂在
   * reactive 的 modalData 上塞不进来，只能把整条守卫流水线手抄一遍。
   */
  busy?: { value: boolean };
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
    if (opts.loadingText !== undefined)
      loadingMessageId = uiStore.message.loading(opts.loadingText, { closable: false });

    const result = await opts.run();
    if (loadingMessageId !== null) uiStore.removeMessage(loadingMessageId);
    if (opts.successText !== undefined)
      uiStore.message.success(typeof opts.successText === 'function' ? opts.successText(result) : opts.successText);

    return result;
  } catch (err: unknown) {
    if (loadingMessageId !== null) uiStore.removeMessage(loadingMessageId);
    if (opts.onError) opts.onError(err);
    else {
      if (opts.logPrefix) console.error(opts.logPrefix, err);
      uiStore.message.error(err instanceof Error ? err.message : (opts.errorFallback ?? '操作失败'));
    }
    if (opts.rethrowError) throw err;
    return null;
  } finally {
    if (opts.busy) opts.busy.value = false;
  }
}
