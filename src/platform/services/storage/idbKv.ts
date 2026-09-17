/**
 * IDB kv 库的同步内存镜像：为 `useStorage` 等同步读场景提供持久化后端。
 *
 * 读：全部命中内存 Map（启动时由 hydrateIdbKv 一次性水合），同步 O(1)；
 * 写：先更新内存 Map，再微批（50ms）合并落盘到 IDB kv 库，pagehide 时强制 flush。
 * 跨标签页：写入方落盘成功后经 BroadcastChannel 通知，其他标签页回读对齐内存（见下方同步段）。
 *
 * 之所以需要镜像：IndexedDB 只有异步 API，而 vueuse 的 useStorage 要求同步 StorageLike；
 * 既有抽象（60 处调用点）不动，代价是把「小状态」的读写收敛到这一层。
 */
import { errors } from '@/platform/services/errors';
import { idb } from '@/platform/services/storage/idb';
import { isPersistBlocked, reportPersistFailure } from '@/platform/services/storage/persistFailure';

const KV_STORE = 'kv';
/** 微批落盘窗口：多次连续写合并为一次 IDB 事务 */
const FLUSH_DELAY_MS = 50;

/** key -> 值（string）。null 等价于「无此键」，与 Storage.getItem 语义对齐 */
const memory = new Map<string, string>();

/** 待落盘的键集合（新增/修改/删除统一记键，flush 时按内存现状整键写入或删除） */
const dirtyKeys = new Set<string>();

let flushTimer: ReturnType<typeof setTimeout> | null = null;

/* ---------------------------------------------------------------------------
 * 跨标签页同步：IDB 没有 storage 事件等价物，自建 BroadcastChannel 补上。
 * 语义与 localStorage 的 storage 事件对齐：
 * - 写入方：flushNow 落盘成功后广播本轮变更键（只发通知，不携带值，接收方回读 IDB）；
 * - 接收方：按键回读 IDB → 更新内存镜像 → 派发 `vueuse:${key}` 自定义事件，
 *   已挂载的 useStorage ref 会据此刷新（vueuse 对自定义 StorageLike 的事件约定）。
 * 冲突策略：同键并发写为 last-write-wins（与 storage 事件时代语义一致）。
 * ------------------------------------------------------------------------- */
const SYNC_CHANNEL_NAME = 'fret-logic:idb-kv-sync';
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
    const oldValue = memory.get(key) ?? null;
    const newValue = record && typeof record.value === 'string' ? record.value : null;
    if (oldValue === newValue) continue;
    if (newValue === null) memory.delete(key);
    else memory.set(key, newValue);
    window.dispatchEvent(new CustomEvent(`vueuse:${key}`, { detail: { key, oldValue, newValue } }));
  }
};

const reportKvFailure = (key: string, error: unknown): void => {
  reportPersistFailure(`kv:${key}`, error instanceof Error ? error : errors.storage('IDB kv 写入失败'));
};

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
  dirtyKeys.clear();
  await idb.runTx([KV_STORE], 'readwrite', get => {
    const store = get(KV_STORE);
    for (const key of keys) {
      const value = memory.get(key);
      if (value === undefined) store.delete(key);
      // 配额熔断：跳过写入（内存镜像继续工作，删除类操作放行以释放空间）
      else if (!isPersistBlocked()) store.put({ key, value });
    }
  });
  // 落盘成功后通知其他标签页回读这些键（失败不广播，各页下次自然对齐）
  broadcastKvUpdate(keys);
};

const scheduleFlush = (): void => {
  cancelPendingFlush();
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushNow().catch((error: unknown) => reportKvFailure('batch', error));
  }, FLUSH_DELAY_MS);
};

/** 同步读（水合前返回 null——启动链路保证 hydrateIdbKv 先于任何 store 初始化执行） */
export const kvGet = (key: string): string | null => memory.get(key) ?? null;

/** 同步写：立即更新内存，微批落盘 */
export const kvSet = (key: string, value: string): void => {
  memory.set(key, value);
  dirtyKeys.add(key);
  scheduleFlush();
};

/** 同步删：立即更新内存，微批落盘 */
export const kvRemove = (key: string): void => {
  memory.delete(key);
  dirtyKeys.add(key);
  scheduleFlush();
};

/** 启动时一次性水合：把 IDB kv 库全部记录读入内存。必须在任何 useStorage/store 初始化之前 await。 */
export const hydrateIdbKv = async (): Promise<void> => {
  const records = await idb.getAll(KV_STORE);
  memory.clear();
  for (const record of records) {
    if (record && typeof record.key === 'string' && typeof record.value === 'string') {
      memory.set(record.key, record.value);
    }
  }
};

/** 立即落盘（供转录完成、页面退出等关键节点调用） */
export const flushIdbKv = (): Promise<void> => flushNow();

/** 供页面退出/切后台兜底（fire-and-forget，不阻塞生命周期） */
export const flushIdbKvOnExit = (): void => {
  void flushNow().catch(() => {
    /* 退出路径静默 */
  });
};

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushIdbKvOnExit);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushIdbKvOnExit();
  });
  // 跨标签页同步频道：尽早建立，收到变更通知即回读（Browser 环境不支持时静默降级）
  if (typeof BroadcastChannel !== 'undefined') {
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
