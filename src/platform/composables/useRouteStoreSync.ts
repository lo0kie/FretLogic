import { watch } from 'vue';

import { useRoute, useRouter } from 'vue-router';

import { isIdbKvHydrated, kvGet, kvRemove, onIdbKvHydrated } from '@/platform/services/storage/idbKv';

import type { LocationQuery } from 'vue-router';

/**
 * URL ↔ Store 状态同构的通用骨架：chord 工作台（#/workbench?group&chord）与乐谱页
 * （#/score?id&tab）原本各自内联实现同一套同步协议，本模块将其参数化下沉。
 *
 * 同步协议（与原两份实现逐语义一致）：
 * - Store → URL：镜像 watcher 以 replace 收口所有选中路径，不产生历史条目；
 * - URL → Store：前进/后退、首屏直达、KeepAlive 重激活时回灌；中段重新进入本页时以内存选中
 *   为权威回灌 URL；冷启动仅首次用「最近编辑」kv 指针补位（失效指针清理）；其余场景按
 *   「参数合法→应用；非法→从 URL 纠偏移除」两段式处理，由调用方注入（applyParams）。
 *
 * 单例语义（重要）：原实现的 resumed / currentPath 是各 domain 模块的模块级单例 ——
 * 即「每页面一份」：跨组件重挂载存活、同页多组件实例共享、不同页面互不串扰。
 * 下沉后该状态改由本工厂的闭包承载，因此约定：每个调用方模块只创建一份引擎
 * （在 domain 模块内做模块级缓存，或如 score 侧随 effectScope 单例重建），
 * 引擎必须在组件 setup / 独立 effectScope.run 等有注入上下文的时机创建（内部 useRoute）。
 *
 * 平台层不引入业务知识与校验依赖：query 的解析/校验器（zod 或手写）、序列化、kv 键名
 * 均由调用方注入，本模块只保留框架流程。
 */

/** applyParams 回调上下文：框架 sync 流程在冷启动块之后交给业务处理时提供的信息与原语 */
export interface RouteSyncApplyContext {
  /** 当前 URL 的 query（与框架同一读取时机，业务校验据此做两段式应用/纠偏） */
  query: LocationQuery;
  /** 本次是否属于「刚进入本页」：path 变化与 KeepAlive 重激活都算，用于挡掉「缺参数即清空」 */
  freshEntry: boolean;
  /** 以 patch 合并当前 query 发起 replace（同值时跳过，避免路由抖动） */
  replaceQuery: (patch: Record<string, string | undefined>) => void;
}

export interface RouteStoreSyncOptions {
  /** 本页路由 path：镜像写入与回灌的统一作用域守卫 */
  routePath: string;
  /** 冷启动时 URL 是否完全没有地址参数（各页地址参数集不同，由调用方判定） */
  hasNoAddress: (query: LocationQuery) => boolean;
  /** 「最近编辑」kv 指针的键名 */
  lastPointerKey: string;
  /** 指针指向的 id 是否仍有效；无效指针由框架 kvRemove 清理，避免每次激活重复补位失败 */
  isPointerValid: (pointerId: string) => boolean;
  /** 由有效指针构建冷启动补位 patch（score 侧会在此捎带最近的 tab 等扩展参数） */
  buildColdStartPatch: (pointerId: string) => Record<string, string>;
  /** 由 Store 当前状态推导镜像 URL 的 query 子集（Store → URL 序列化规则） */
  buildMirrorPatch: () => Record<string, string | undefined>;
  /** URL → Store 的参数应用/纠偏两段式（原实现编号步骤 1/2…），业务校验由调用方注入 */
  applyParams: (ctx: RouteSyncApplyContext) => void;
}

export interface RouteStoreSyncApi {
  /**
   * URL → Store 回灌；无效参数由 applyParams 纠偏移除（无路由环境为空操作）。
   * @param activated 本次同步来自 KeepAlive 重新激活（onActivated）而非路由变化。
   *   激活同样是一次「进入本页」：它是渲染后置钩子，晚于 pre 冲刷的路由 watcher 运行，
   *   那时 currentPath 已被那次调用更新成同一个 path —— 只看 path 会把这次进入误判为
   *   「页内 URL 编辑」，于是「缺地址参数即清空」的分支会把刚切回时仍有效的选中误清。
   *   是否传 true 取决于页面语义（chord 工作台传 true；乐谱页原实现无此参数，不传）。
   */
  syncRouteToStore: (activated?: boolean) => void;
  /**
   * 注册 watcher 并执行首次回灌，顺序固定：路由 watcher → 首次回灌 → 镜像 watcher。
   * 时序保证：先做一次 URL→Store 回灌，再启动 Store→URL 镜像，避免镜像在回灌前用
   * 持久化状态覆盖深链参数。须在宿主作用域内调用（组件 setup → watcher 随组件销毁；
   * 独立 effectScope.run → watcher 随作用域销毁），mirrorSources 每项注册一个镜像 watcher。
   */
  registerWatchers: (mirrorSources: (() => unknown)[]) => void;
}

/** 创建一份「URL ↔ Store 同构」同步引擎（参数与生命周期约定见各类型与文件头注释） */
export function createRouteStoreSync(options: RouteStoreSyncOptions): RouteStoreSyncApi {
  const route = useRoute();
  const router = useRouter();

  // 测试环境可能未注入路由：无路由时所有 URL 能力降级（watcher 直接过、回灌不动作）
  const hasRouter = Boolean(route && router);

  /** 本页会话内是否已完成冷启动回灌（防重入：避免用户取消选择后被回灌复活）。每引擎一份 = 每页面一份 */
  let resumed = false;
  /** 上一次 sync 观察到的路由 path：用于判断「是刚进入本页」还是「页内 URL 编辑」 */
  let currentPath = '';

  /** 用 query 子集与当前 URL 比对，避免同值 replace 造成路由抖动 */
  const isQuerySame = (patch: Record<string, string | undefined>): boolean =>
    Object.entries(patch).every(([k, v]) => (route.query[k] ?? undefined) === v);

  /** 以 patch 合并当前 query 发起 replace（同值时跳过） */
  const replaceQuery = (patch: Record<string, string | undefined>) => {
    if (isQuerySame(patch)) return;
    void router.replace({ query: { ...route.query, ...patch } });
  };

  // ==================== Store → URL（用户选中动作的 replace 镜像） ====================

  const mirrorStoreToUrl = () => {
    if (!hasRouter || route.path !== options.routePath) return;
    replaceQuery(options.buildMirrorPatch());
  };

  // ==================== URL → Store（前进 / 后退 / 首屏直达回灌） ====================

  /**
   * 冷启动补位：URL 完全没有地址参数时，用「最近编辑」指针补一次位（令 URL 仍是唯一数据源）。
   * 返回是否已发起补位（发起后调用方不再走 applyParams：那次 replace 会再触发一轮 watcher）。
   */
  const applyColdStartPointer = (): boolean => {
    if (!options.hasNoAddress(route.query)) return false;
    const lastPointer = kvGet(options.lastPointerKey);
    if (!lastPointer) return false;
    if (options.isPointerValid(lastPointer)) {
      replaceQuery(options.buildColdStartPatch(lastPointer));
      return true;
    }
    // 失效指针：清理，避免每次激活重复补位失败
    kvRemove(options.lastPointerKey);
    return false;
  };

  const syncRouteToStore = (activated = false): void => {
    // 无路由环境（组件单测）不触碰 route，先判 hasRouter 再读 route
    if (!hasRouter) return;
    const prevPath = currentPath;
    currentPath = route.path;
    if (route.path !== options.routePath) return;
    /** 本次是否由路由 path 变化触发（页内 URL 编辑为 false） */
    const pathChanged = route.path !== prevPath;
    /** 本次是否属于「刚进入本页」：path 变化与缓存重激活都算，两者都要挡掉「缺参数即清空」 */
    const freshEntry = pathChanged || activated;

    // 中段重新进入本页（resumed 已置位 = 非冷启动）：导航清空 query 时，以内存选中为权威回灌 URL，
    // 令「URL=状态」延续，避免「缺参数即清空」把仍有效的选中误清（丢 URL 根因）。
    // 冷启动（resumed=false）跳过此回灌，让深链参数与「最近编辑」指针回灌先说话，绝不覆盖深链。
    // 判据用 pathChanged 而非 freshEntry：重激活时这次回灌早已由 pre 冲刷的那次 watcher 发起
    //（其 replace 尚未落地，route.query 仍是空的），此处再发一次只是重复导航。
    if (pathChanged && resumed) mirrorStoreToUrl();

    // 0. 冷启动回灌（本页会话仅首次，resumed 置位后不再回灌）：仅当 URL 完全没有地址参数时，
    //    用「最近编辑」指针补位一次，令 URL 仍是唯一数据源；URL 已有地址时直接消耗本次回灌机会，
    //    避免指针覆盖显式传入的地址参数，也避免用户取消选择后被回灌复活。
    if (!resumed) {
      // ⚠️ 未水合时**不能**消耗这次补位：`kvGet` 未水合一律返回 null，与「键确实不存在」不可区分
      //（idbKv 的 kvGet 契约），照常置位 resumed 会让唯一一次冷启动补位被烧掉 —— 深链参数与
      //「最近编辑」指针双双回灌不到，直接开 `#/workbench` 就是空选中。启动链路有超时兜底
      //（main.ts 的 Promise.race），「引擎初始化早于水合完成」是可达路径。
      // 故此时既不置位也不补位，把这一轮挂到水合回调上补做（与 settingsStore 的 afterKvHydrated 同款）。
      if (!isIdbKvHydrated()) {
        const pendingFreshEntry = freshEntry;
        onIdbKvHydrated(() => {
          if (resumed) return; // 期间已由别的路径完成（如再次导航）
          resumed = true;
          if (applyColdStartPointer()) return;
          options.applyParams({ query: route.query, freshEntry: pendingFreshEntry, replaceQuery });
        });
        return;
      }
      resumed = true;
      if (applyColdStartPointer()) return;
    }

    // 1+. 参数应用/纠偏两段式（合法→应用；非法→从 URL 纠偏移除），业务差异留在 domain 侧
    options.applyParams({ query: route.query, freshEntry, replaceQuery });
  };

  const registerWatchers = (mirrorSources: (() => unknown)[]): void => {
    // 前进/后退与跨页跳转回灌：路由 path/query 变化且当前在本页时同步
    watch(
      () => (hasRouter ? ([route.path, route.query] as const) : null),
      () => syncRouteToStore()
    );
    // 先回灌再启镜像（时序保证见 registerWatchers 的 JSDoc）
    syncRouteToStore();
    for (const source of mirrorSources) watch(source, mirrorStoreToUrl);
  };

  return { syncRouteToStore, registerWatchers };
}
