/**
 * 分块挂载控制器：把「一次性全量挂载/卸载大列表」的帧尖峰摊到多帧。
 *
 * 适用场景：列表单元数量大（百级以上）、单元挂载有真实组件成本（子组件 setup / 指令 / 浮层
 * 登记），且存在「开合 / 切换导致整组内容一帧内全量挂载或卸载」的路径。与 useRowWindowing
 * 是同一家族的两种策略——后者按滚动窗口只挂可见行（需要行高可预知），本控制器不要求行高
 * 知识，只按帧批量推进挂载/卸载（适合行高不定、或已由折叠容器占位的场景）。
 *
 * 用法（多 key 管理，如侧栏多分组各含一份大列表）：
 *   const chunked = createChunkedMount<string>(36);
 *   // 展开：从当前限额起每帧补一批直到挂满；挂满后限额移除、回到全量渲染
 *   chunked.startFill(key, () => items.length, () => isStillOpen);
 *   // 收起方向保留期结束后：每帧卸一批直到清空，onDrained 里做最终清理（移除保留门控等）
 *   chunked.startDrain(key, () => items.length, key => releaseRetention(key));
 *   // 渲染：slice(items, key) 无限额时返回原数组（避免每次渲染复制）
 *   v-for="item in chunked.slice(items, key)"
 *   // 补挂/卸载进行中关闭进出动画（换成无样式 transition name 前缀）
 *   :name="chunked.isFilling(key) ? 'v-transition-fill' : 'v-transition-list'"
 */
import { getCurrentScope, onScopeDispose, reactive } from 'vue';

export interface ChunkedMountController<K extends string> {
  /** 该 key 当前挂载上限；Infinity = 无限制（全量渲染，补挂已完成或未启用） */
  getLimit: (key: K) => number;
  /** 该 key 是否处于补挂/卸载流程（模板据此切换 TransitionGroup 的动画名） */
  isFilling: (key: K) => boolean;
  /** 按上限截取应渲染的片段；无上限时原样返回（不复制） */
  slice: <T>(items: readonly T[], key: K) => T[];
  /**
   * 展开方向的分块补挂：每帧把上限提高 batch 直到 ≥ 总数。
   * @param getTotal 每帧重读的总数（补挂期间列表可能继续增删）
   * @param shouldContinue 每帧前置检查（如「分组仍处展开态」）；返回 false 时循环停摆
   *   （filling 标记保留，由后续 startDrain / startFill 接管）
   */
  startFill: (key: K, getTotal: () => number, shouldContinue?: () => boolean) => void;
  /**
   * 收起方向的分块卸载：每帧把上限降低 batch 直到 0。
   * @param onDrained 清空后的收尾（如移除保留窗口、删除渲染门控），在最后一帧回调
   */
  startDrain: (key: K, getTotal: () => number, onDrained?: (key: K) => void) => void;
  /** 取消该 key 进行中的 rAF 循环（不影响已写入的限额与 filling 标记） */
  cancel: (key: K) => void;
  /** 取消全部循环；在组件作用域内创建时会随作用域销毁自动调用 */
  dispose: () => void;
}

/**
 * 创建分块挂载控制器。
 * @param batch 每帧补挂/卸载的数量（一次调用内固定；补挂与卸载共用该批量）
 */
export const createChunkedMount = <K extends string>(batch = 36): ChunkedMountController<K> => {
  /** 各 key 的挂载上限；无条目 = Infinity（全量）。
   *  reactive 的 Map/Set 方法签名会把 key 解包成 UnwrapRefSimple<K>，泛型 K 过不去，
   *  故先按无参构造创建再断言回 Map<K, number>（运行时行为一致，仅类型层面绕行） */
  const limits = reactive(new Map()) as unknown as Map<K, number>;
  /** 各 key 进行中的 rAF 句柄 */
  const rafIds = new Map<K, number>();
  /** 处于补挂/卸载流程的 key：与 raf 生命周期解耦——循环停摆（shouldContinue 为 false）后
   *  渲染仍走「无动画」分支，避免停摆窗口内的一次渲染把进出动画放出来 */
  const fillingKeys = reactive(new Set<K>()) as unknown as Set<K>;

  const controller: ChunkedMountController<K> = {
    getLimit: key => limits.get(key) ?? Number.POSITIVE_INFINITY,

    isFilling: key => fillingKeys.has(key),

    slice: <T>(items: readonly T[], key: K): T[] => {
      const limit = limits.get(key);
      return limit === undefined ? (items as T[]) : (items.slice(0, limit) as T[]);
    },

    startFill: (key, getTotal, shouldContinue) => {
      controller.cancel(key);
      if (!limits.has(key)) limits.set(key, Math.min(batch, getTotal()));
      fillingKeys.add(key);
      const tick = () => {
        rafIds.delete(key);
        if (shouldContinue && !shouldContinue()) return;
        const total = getTotal();
        const limit = limits.get(key) ?? total;
        if (limit >= total) {
          limits.delete(key);
          fillingKeys.delete(key);
          return;
        }
        limits.set(key, Math.min(limit + batch, total));
        rafIds.set(key, requestAnimationFrame(tick));
      };
      rafIds.set(key, requestAnimationFrame(tick));
    },

    startDrain: (key, getTotal, onDrained) => {
      controller.cancel(key);
      if (!limits.has(key)) limits.set(key, getTotal());
      fillingKeys.add(key);
      const tick = () => {
        rafIds.delete(key);
        const limit = (limits.get(key) ?? 0) - batch;
        if (limit <= 0) {
          limits.delete(key);
          fillingKeys.delete(key);
          onDrained?.(key);
          return;
        }
        limits.set(key, limit);
        rafIds.set(key, requestAnimationFrame(tick));
      };
      rafIds.set(key, requestAnimationFrame(tick));
    },

    cancel: key => {
      const id = rafIds.get(key);
      if (id !== undefined) {
        cancelAnimationFrame(id);
        rafIds.delete(key);
      }
    },

    dispose: () => {
      for (const id of rafIds.values()) cancelAnimationFrame(id);
      rafIds.clear();
    },
  };

  if (getCurrentScope()) onScopeDispose(controller.dispose);
  return controller;
};
