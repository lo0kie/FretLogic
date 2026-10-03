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
import { isClient, isString } from '@/platform/utils/common';
import { createHook } from '@/platform/utils/hook';

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

/**
 * 水合窗口（`hydrateIdbKv` 的 await 期间）落下的写入登记：key -> 值（undefined = 该键被 kvRemove）。
 * 非空即表示「正处在水合窗口内」，kvSet / kvRemove 据此登记。
 *
 * 为什么不能拿 dirtyKeys 当窗口期写入的判据：flush 成功后会把键从 dirtyKeys 里摘掉，窗口期的写入
 * 若已落盘就查不到了，而 hydrateIdbKv 拿到的 records 又是更早的事务快照 —— 这次写入在内存镜像里
 * 凭空消失（IDB 里在、内存里没有，此后一律读成「无此键」）。窗口期之外落下的写入不需要本表：
 * 要么已经落盘（回读快照里有），要么还挂在 dirtyKeys 上（由水合起手那份快照兜住）。
 *
 * 范围**必须**限定在窗口内，不能放宽成「自上次水合以来」：那样重新水合（清库 + 重新水合，
 * 测试的 beforeEach 正是这个动作）会把上一次水合之后写过的每个键一并盖回去，
 * 连已被 `idb.clear` 清掉的值都会复活 —— 那不是「保住未落盘的写入」，而是让内存镜像只增不减。
 */
let hydrationWindow: Map<string, string | undefined> | null = null;

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

/**
 * 跨标签页失效广播的消息形状与判别值。
 *
 * 发送侧（`broadcastKvUpdate`）与接收侧（`syncChannel.onmessage`）此前各写一遍字面量
 * `'kv-update'`，中间没有任何共同声明 —— 任一处改字（或漏改）都只表现为「跨标签页同步悄悄失效」，
 * 没有任何报错。判别值收在这里，发送与接收都引它。
 */
const KV_UPDATE_TYPE = 'kv-update';
interface KvBroadcastMessage {
  type: typeof KV_UPDATE_TYPE;
  keys: string[];
}

const broadcastKvUpdate = (keys: string[]): void => {
  if (syncChannel === null || keys.length === 0) return;
  try {
    const message: KvBroadcastMessage = { type: KV_UPDATE_TYPE, keys };
    syncChannel.postMessage(message);
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
    const newValue = record && isString(record.value) ? record.value : null;
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
    // 事务失败：dirtyKeys 保持原样（含本轮 keys），并**重新武装 flush 定时器**再重试。
    // 此前只 reportKvFailure 而没有 scheduleFlush —— 而 flushNow 开头的 cancelPendingFlush
    // 已经把定时器清掉了，于是「下个 flush 周期自然重试」这句注释并不成立：用户此后不再编辑的话，
    // 脏键就一直只在内存里，只剩 pagehide 的强制 flush 兜底。
    reportKvFailure(keys[0] ?? 'flush', error);
    if (dirtyKeys.size > 0) scheduleFlush();
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
  hydrationWindow?.set(key, value);
  dirtyKeys.add(key);
  removedKeys.delete(key);
  bumpWriteEpoch(key);
  scheduleFlush();
};

/** 同步删：立即更新内存，微批落盘 */
export const kvRemove = (key: string): void => {
  memory.delete(key);
  hydrationWindow?.set(key, undefined);
  dirtyKeys.add(key);
  removedKeys.add(key);
  bumpWriteEpoch(key);
  scheduleFlush();
};

/** 水合是否已完成。未水合时 kvGet 一律返回 null，与「键确实不存在」不可区分（见 isIdbKvHydrated） */
let hydrated = false;

/** 水合完成回调（一次性）：已水合时立即执行。供「必须等水合才成立」的一次性逻辑挂载
 *（如 settingsStore 的两处数据迁移 —— 未水合时读到的全是出厂默认值）。 */
const hydratedHook = createHook();

export const onIdbKvHydrated = (listener: () => void): (() => void) => {
  if (hydrated) {
    listener();
    return () => {};
  }
  return hydratedHook.on(listener);
};

/**
 * 水合回读的尝试次数。
 *
 * 为什么需要重试：水合是**整个会话的一次性动作**，失败一次就再也不会有第二次机会 ——
 * `hydrated` 保持 false，`kvGet` 此后一律返回 null，挂在 `onIdbKvHydrated` 上的一次性逻辑
 * （settingsStore 的两处数据迁移、useRouteStoreSync 的冷启动补位）永久静默不执行，
 * 而应用照常启动，用户看不到任何异常。IDB 的失败多为瞬时（事务 abort、被其它标签页
 * 阻塞后重开、open 竞态），重试一次即可恢复。
 *
 * 不做无界重试：隐私模式 / 存储被禁是永久性失败，无界重试会变成启动期热循环。
 * 重试次数用完仍失败时**照旧抛错**（契约不变，由 main.ts 的超时兜底接住）。
 */
const HYDRATE_READ_ATTEMPTS = 2;

/** kv 库记录形状（与 AppDBSchema['kv']['value'] 同构；此处按结构化写法声明，不额外引入类型导入） */
interface KvRecord {
  key: string;
  value: string;
}

/** 启动时一次性水合：把 IDB kv 库全部记录读入内存。必须在任何 useStorage/store 初始化之前 await。 */
export const hydrateIdbKv = async (): Promise<void> => {
  // 起手先取两份「比回读快照新」的写入，memory.clear() 之后要覆盖回去：
  //   ① 此刻尚未落盘的（dirtyKeys 快照）—— 覆盖 hydrate 被调用之前就落下的改动（启动早期的写入）；
  //   ② 下面 await 期间落下的（hydrationWindow）—— 覆盖「窗口期写入已抢先落盘、回读快照里却没有」
  //      这条窄时序（那种情况下该键已不在 dirtyKeys 里，只有窗口登记表记得）。
  // 窗口在回读 promise 落定后立即关闭：此后的写入回到「IDB 即真值」的常规语义，不再参与重放。
  const pendingAtStart = new Map([...dirtyKeys].map(key => [key, memory.get(key)] as const));
  const duringWindow = new Map<string, string | undefined>();
  hydrationWindow = duringWindow;
  // 窗口在整个「含重试的回读段」内保持开启：若第一次尝试失败后关掉窗口，第二次尝试的 await
  // 期间落下的写入就没人登记，会随 memory.clear() 一起消失（IDB 里在、内存里没有）。
  let records: KvRecord[] | null = null;
  let readError: unknown;
  try {
    for (let attempt = 1; attempt <= HYDRATE_READ_ATTEMPTS && records === null; attempt++)
      try {
        records = await idb.getAll(KV_STORE);
      } catch (error) {
        readError = error;
        reportKvFailure('hydrate', error);
      }
  } finally {
    hydrationWindow = null;
  }
  if (records === null) throw readError ?? errors.storage('IDB kv 水合回读失败');

  const windowWrites = new Map(pendingAtStart);
  for (const [key, value] of duringWindow) windowWrites.set(key, value);

  memory.clear();
  for (const record of records)
    if (record && isString(record.key) && isString(record.value)) memory.set(record.key, record.value);
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
  if (isClient)
    for (const [key, newValue] of memory)
      window.dispatchEvent(
        new CustomEvent(VUEUSE_STORAGE_EVENT, {
          detail: { key, oldValue: null, newValue, storageArea: idbKvStorage },
        })
      );

  // 通知「必须等水合才成立」的一次性逻辑。放在派发之后：它们读的是刚被刷新的 ref。
  // 广播后 clear：这是一次性钩子，此后 onIdbKvHydrated 走「已水合立即执行」那条短路，
  // 订阅者再也收不到通知，留着只是白占闭包引用。
  hydratedHook.emit();
  hydratedHook.clear();
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

if (isClient) {
  // 退出落盘兜底：登记进全局唯一的退出落盘注册表（platform/services/lifecycle/exitFlush.ts），
  // 不再自行挂 pagehide / visibilitychange（同一关注点此前在三个模块里各挂了一份）
  registerExitFlusher(flushIdbKvOnExit);
  // 跨标签页同步频道：尽早建立，收到变更通知即回读（Browser 环境不支持时静默降级）
  if (typeof BroadcastChannel !== 'undefined')
    try {
      syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
      syncChannel.onmessage = (event: MessageEvent) => {
        const data = event.data as { type?: unknown; keys?: unknown } | null;
        if (!data || data.type !== KV_UPDATE_TYPE || !Array.isArray(data.keys)) return;
        const keys = data.keys.filter((key): key is string => isString(key));
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
