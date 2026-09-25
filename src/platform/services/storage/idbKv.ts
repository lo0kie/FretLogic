/**
 * IDB kv 库的同步内存镜像：为 `useStorage` 等同步读场景提供持久化后端。
 *
 * 读：全部命中内存 Map（启动时由 hydrateIdbKv 一次性水合），同步 O(1)；
 * 写：先更新内存 Map，再微批（50ms）合并落盘到 IDB kv 库，pagehide 时强制 flush。
 * 跨标签页：写入方落盘成功后经 BroadcastChannel 通知，其他标签页回读对齐内存（见下方同步段）。
 *
 * 之所以需要镜像：IndexedDB 只有异步 API，而 vueuse 的 useStorage 要求同步 StorageLike；
 * 既有抽象（settingsStore / uiStore 与两个编辑器 store 的所有 useStorage 调用点）不动，
 * 代价是把「小状态」的读写收敛到这一层。
 */
import { errors } from '@/platform/services/errors';
import { registerExitFlusher } from '@/platform/services/lifecycle/exitFlush';
import { idb } from '@/platform/services/storage/idb';
import { isPersistBlocked, reportPersistFailure } from '@/platform/services/storage/persistFailure';

const KV_STORE = 'kv';
/** 微批落盘窗口：多次连续写合并为一次 IDB 事务 */
const FLUSH_DELAY_MS = 50;

/** key -> 值（string）。null 等价于「无此键」，与 Storage.getItem 语义对齐 */
const memory = new Map<string, string>();

/** 待落盘的键集合（新增/修改/删除统一记键，flush 时按内存现状整键写入或删除） */
const dirtyKeys = new Set<string>();

/**
 * 每个键的写入代数：kvSet / kvRemove 每次调用递增。
 *
 * 用途只有一个——让 flushNow 认出「本轮事务落盘期间该键又被改写过」。dirtyKeys 是 Set，
 * 重入的 add 是幂等的，光看集合根本区分不出「本轮取的快照」与「期间新加入的脏标记」。
 */
const writeEpoch = new Map<string, number>();

const bumpWriteEpoch = (key: string): void => void writeEpoch.set(key, (writeEpoch.get(key) ?? 0) + 1);

/**
 * **显式删除**过的键（只由 kvRemove 写入）。flushNow 只对它们执行 IDB delete。
 *
 * 为什么不能凭「内存里没有」就删：内存镜像会被整体重置（水合、异常路径），重置后某些键
 * 暂时不在内存里，但这并不表示用户删了它 —— 照删就是一次读空把 IDB 里的既有记录真删掉。
 * 删除是本模块唯一不可逆的动作，判据必须来自意图，而不是当下的现状。
 */
const removedKeys = new Set<string>();

let flushTimer: ReturnType<typeof setTimeout> | null = null;

/* ---------------------------------------------------------------------------
 * 跨标签页同步：IDB 没有 storage 事件等价物，自建 BroadcastChannel 补上。
 * 语义与 localStorage 的 storage 事件对齐：
 * - 写入方：flushNow 落盘成功后广播本轮变更键（只发通知，不携带值，接收方回读 IDB）；
 * - 接收方：按键回读 IDB → 更新内存镜像 → 派发 `vueuse-storage` 自定义事件
 *   （detail 携带 storageArea = idbKvStorage），已挂载的 useStorage ref 会据此刷新。
 * 冲突策略：同键并发写为 last-write-wins（与 storage 事件时代语义一致）。
 * ------------------------------------------------------------------------- */
const SYNC_CHANNEL_NAME = 'fret-logic:idb-kv-sync';
// 与 @vueuse/core 内部的 customStorageEventName 一致（该常量未导出，本地固化）。
// useStorage 对非 Storage 后端监听的是这个事件名，且 update() 要求 detail.storageArea
// 与其持有的 StorageLike 同一实例（@vueuse/core dist update(): `event.storageArea !== storage` 即早退）。
const VUEUSE_STORAGE_EVENT = 'vueuse-storage';
let syncChannel: BroadcastChannel | null = null;

const broadcastKvUpdate = (keys: string[]): void => {
  if (syncChannel === null || keys.length === 0) return;
  try {
    syncChannel.postMessage({ type: 'kv-update', keys });
  } catch {
    // 广播失败不影响本页持久化
  }
};

const applyRemoteKvUpdate = async (keys: string[]): Promise<void> => {
  for (const key of keys) {
    let record: { key: string; value: string } | undefined;
    try {
      record = await idb.get(KV_STORE, key);
    } catch {
      continue; // 单键回读失败只影响该键，不中断其余键
    }
    // 本键有**未落盘的本地写入**时不动内存镜像：此刻内存里的值才是用户最新意图，
    // 用 IDB 的回读值覆盖它，随后 flushNow 落盘的也是被覆盖后的值 —— 本地这次写入静默丢失。
    // 与 flushNow 的 writeEpoch 是同一件事的两半：那半管「落盘期间又被改写」，这半管管「远端覆盖本地待写」。
    if (dirtyKeys.has(key)) continue;
    const oldValue = memory.get(key) ?? null;
    const newValue = record && typeof record.value === 'string' ? record.value : null;
    if (oldValue === newValue) continue;
    if (newValue === null) memory.delete(key);
    else memory.set(key, newValue);
    window.dispatchEvent(
      new CustomEvent(VUEUSE_STORAGE_EVENT, { detail: { key, oldValue, newValue, storageArea: idbKvStorage } })
    );
  }
};

const reportKvFailure = (key: string, error: unknown): void =>
  void reportPersistFailure(`kv:${key}`, error instanceof Error ? error : errors.storage('IDB kv 写入失败'));

const cancelPendingFlush = (): void => {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
};

/** 把 dirtyKeys 落到 IDB（单事务，逐键 put/delete）。无待写项时空转。 */
const flushNow = async (): Promise<void> => {
  cancelPendingFlush();
  if (dirtyKeys.size === 0) return;
  const keys = [...dirtyKeys];
  // 本轮事务开始时的代数快照（见 writeEpoch）：事务是 await 的，执行期间同一键可能又被
  // kvSet / kvRemove 弄脏，那批标记必须留到下一轮。否则下面的摘除会把它们一并抹掉——
  // 内存已是新值、IDB 还是旧值，而这批键从此不在脏集合里 ⇒ 永不重试（下一轮 flush 见集合为空
  // 直接 return，pagehide 的强制 flush 同样空转），内存与 IDB 永久分叉。
  const epochAtStart = new Map(keys.map(key => [key, writeEpoch.get(key) ?? 0] as const));
  /** 本轮落盘期间该键未被再次改写（只有这样的键才允许摘除脏标记 / 广播） */
  const untouched = (key: string): boolean => (writeEpoch.get(key) ?? 0) === epochAtStart.get(key);
  // 事务成功前不清 dirtyKeys：一旦 clear() 早于事务执行，事务失败（abort/熔断/连接失效）
  // 时这批键就被当成「已落盘」丢弃，永不重试，内存与 IDB 永久分叉（P1 审计 N 系）。
  // 先在事务回调内逐键摘除成功项，事务 complete 后统一收口。
  const writtenKeys: string[] = [];
  /** 内存里已无、但并非显式删除的键：只从脏集合摘掉，绝不对 IDB 执行 delete（见 removedKeys） */
  const droppedKeys: string[] = [];
  try {
    await idb.runTx([KV_STORE], get => {
      const store = get(KV_STORE);
      for (const key of keys) {
        const value = memory.get(key);
        if (value === undefined) {
          if (!removedKeys.has(key)) {
            droppedKeys.push(key);
            continue;
          }
          store.delete(key);
          writtenKeys.push(key);
        }
        // 配额熔断：跳过写入（内存镜像继续工作，删除类操作放行以释放空间）
        else if (!isPersistBlocked()) {
          store.put({ key, value });
          writtenKeys.push(key);
        }
      }
    });
    // 事务已 complete：这批键真正落盘，才允许从脏集合摘除；且只摘本轮没被再次改写的那些，
    // 被改写过的留到下一轮（它的新值还在 memory 里等着）
    for (const key of writtenKeys) {
      if (!untouched(key)) continue;
      dirtyKeys.delete(key);
      removedKeys.delete(key);
    }
    for (const key of droppedKeys) if (untouched(key)) dirtyKeys.delete(key);
    // 只广播真正落盘、且此后未被再次改写的键：熔断跳写的键 IDB 里仍是旧值，广播出去会让其它
    // 标签页回读旧值并派发刷新，把本页用户新输入回退掉；本轮被改写的键同理（IDB 里落的可能
    // 已不是它此刻的值），留给下一轮广播
    broadcastKvUpdate(writtenKeys.filter(untouched));
  } catch (error) {
    // 事务失败：dirtyKeys 保持原样（含本轮 keys），下个 flush 周期自然重试
    reportKvFailure(keys[0] ?? 'flush', error);
  }
};

const scheduleFlush = (): void => {
  cancelPendingFlush();
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushNow().catch((error: unknown) => reportKvFailure('batch', error));
  }, FLUSH_DELAY_MS);
};

/** 同步读。水合前返回 null —— 该 null 与「键不存在」不可区分，故凡以「键不存在」为判据的调用方
 *  必须先问 isIdbKvHydrated()：启动链路有超时兜底，并不保证水合先于一切初始化完成。 */
export const kvGet = (key: string): string | null => memory.get(key) ?? null;

/** 同步写：立即更新内存，微批落盘 */
export const kvSet = (key: string, value: string): void => {
  memory.set(key, value);
  dirtyKeys.add(key);
  removedKeys.delete(key);
  bumpWriteEpoch(key);
  scheduleFlush();
};

/** 同步删：立即更新内存，微批落盘 */
export const kvRemove = (key: string): void => {
  memory.delete(key);
  dirtyKeys.add(key);
  removedKeys.add(key);
  bumpWriteEpoch(key);
  scheduleFlush();
};

/** 水合是否已完成。未水合时 kvGet 一律返回 null，与「键确实不存在」不可区分（见 isIdbKvHydrated） */
let hydrated = false;

/** 水合完成回调（一次性）：已水合时立即执行。供「必须等水合才成立」的一次性逻辑挂载
 *（如 settingsStore 的两处数据迁移 —— 未水合时读到的全是出厂默认值）。 */
const hydratedListeners = new Set<() => void>();

export const onIdbKvHydrated = (listener: () => void): (() => void) => {
  if (hydrated) {
    listener();
    return () => {};
  }
  hydratedListeners.add(listener);
  return () => void hydratedListeners.delete(listener);
};

/** 启动时一次性水合：把 IDB kv 库全部记录读入内存。必须在任何 useStorage/store 初始化之前 await。 */
export const hydrateIdbKv = async (): Promise<void> => {
  const records = await idb.getAll(KV_STORE);
  // 水合窗口（上面的 await 期间）可能已有写入落进 memory —— 它们比 IDB 里的旧值新，必须先留下。
  // 判据取 dirtyKeys：它正是「已写但尚未落盘」的键集，启动首轮水合时为空（于是行为就是纯 IDB 真相），
  // 只有窗口期真发生过写入才会被覆盖回来。少了这一步，memory.clear() 会把窗口期的写入抹掉，
  // 而排在后面的微批 flush 见到 memory 里没有该键，走的是删除分支 ⇒ 一次写入被读成一次删除。
  const windowWrites = [...dirtyKeys].map(key => [key, memory.get(key)] as const);
  memory.clear();
  for (const record of records)
    if (record && typeof record.key === 'string' && typeof record.value === 'string')
      memory.set(record.key, record.value);
  // 窗口期写入覆盖回读值（last-write-wins）；值为 undefined 表示窗口期执行过 kvRemove，保持删除
  for (const [key, value] of windowWrites)
    if (value === undefined) memory.delete(key);
    else memory.set(key, value);
  hydrated = true;

  // 水合完成 = 这批键的**真值**第一次可用。逐个派发 vueuse 存储事件，让已存在的 useStorage ref
  // 从「出厂默认值」切到磁盘值 —— 启动链路有超时兜底（main.ts 的 Promise.race），超时即挂载，
  // 那一刻创建的 ref 读到的都是默认值，而此前没有任何东西会在水合完成后再通知它们一次
  //（跨标签页那条路径有 applyRemoteKvUpdate 做同样的事，本地水合这条一直缺）。
  // 事件名与 storageArea 口径必须与 useStorage 的处理器一致（它要求 detail.storageArea
  // 与自身持有的 StorageLike 是同一实例，否则早退）。
  if (typeof window !== 'undefined')
    for (const [key, newValue] of memory)
      window.dispatchEvent(
        new CustomEvent(VUEUSE_STORAGE_EVENT, {
          detail: { key, oldValue: null, newValue, storageArea: idbKvStorage },
        })
      );

  // 通知「必须等水合才成立」的一次性逻辑。放在派发之后：它们读的是刚被刷新的 ref。
  for (const listener of [...hydratedListeners]) listener();
  hydratedListeners.clear();
};

/**
 * kv 内存镜像是否已水合完成。
 *
 * 为什么需要这个判据：kvGet 在水合前返回 null，而 null 同时意味着「没有这个键」——两者对调用方
 * 不可区分。启动链路有超时兜底（见 main.ts 的 Promise.race），超时后 mount 照常发生，
 * 此时拿 kvGet 判「首访 / 有无偏好」的调用方会把**老用户**当成新用户。凡是以「键不存在」为判据的
 * 调用点，都必须先用这一句把「还没水合」摘出去。
 */
export const isIdbKvHydrated = (): boolean => hydrated;

/** 立即落盘（供转录完成、页面退出等关键节点调用） */
export const flushIdbKv = (): Promise<void> => flushNow();

/** 供页面退出/切后台兜底（fire-and-forget，不阻塞生命周期） */
export const flushIdbKvOnExit = (): void =>
  void flushNow().catch(() => {
    /* 退出路径静默 */
  });

if (typeof window !== 'undefined') {
  // 退出落盘兜底：登记进全局唯一的退出落盘注册表（platform/services/lifecycle/exitFlush.ts），
  // 不再自行挂 pagehide / visibilitychange（同一关注点此前在三个模块里各挂了一份）
  registerExitFlusher(flushIdbKvOnExit);
  // 跨标签页同步频道：尽早建立，收到变更通知即回读（Browser 环境不支持时静默降级）
  if (typeof BroadcastChannel !== 'undefined')
    try {
      syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
      syncChannel.onmessage = (event: MessageEvent) => {
        const data = event.data as { type?: unknown; keys?: unknown } | null;
        if (!data || data.type !== 'kv-update' || !Array.isArray(data.keys)) return;
        const keys = data.keys.filter((key): key is string => typeof key === 'string');
        void applyRemoteKvUpdate(keys);
      };
    } catch {
      syncChannel = null;
    }
}

/**
 * vueuse useStorage 的 StorageLike 适配器（同步）。
 * 注意：刻意不是真实 Storage 实例 —— vueuse 对非 Storage 后端自动改走同文档
 * 自定义事件同步，不会触发 window storage 事件回环。
 */
export const idbKvStorage = {
  getItem: (key: string): string | null => kvGet(key),
  setItem: (key: string, value: string): void => kvSet(key, value),
  removeItem: (key: string): void => kvRemove(key),
};
