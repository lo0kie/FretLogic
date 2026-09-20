/**
 * IndexedDB 封装：基于 `idb` 包（Jake Archibald 出品，~1KB）提供 Promise 化访问，
 * 在其之上保留本项目的三层定制：
 * 1. SCHEMA 声明表驱动的 upgrade（含「陈旧索引清理」与「缺库自愈 bump 重开」）；
 * 2. AppDBSchema 编译期绑定（storeName ↔ 记录类型，见下方类型区）；
 * 3. runTx 跨库单事务 + 统一错误包装（AppError.storage）。
 *
 * 数据库：fret-logic-v2，对象库见 SCHEMA。调用方负责错误处理（统一抛 AppError）。
 */
import { openDB as openIdb } from 'idb';

import { errors } from '@/platform/services/errors';

import { isPersistBlocked } from './persistFailure';

import type { IDBPDatabase, IDBPTransaction } from 'idb';

export const DB_NAME = 'fret-logic-v2';
/**
 * v2：清理早期版本遗留的失效索引（`chords.nameKey`、`groups.sort`）——两个 keyPath 在实体上都不存在
 * （Chord 用 nameSegments，Group 用 sortRule/sortKey），索引恒为空。
 * 必须 bump 版本号：`onupgradeneeded` 只在版本变化时触发，否则已装用户的旧库会一直带着死索引。
 */
/**
 * v3：新增 `kv` 对象库——偏好/UI 等小状态经 idbKv 内存镜像落在这里
 * （记录形如 {key, value: string}，keyPath: 'key'）。
 * 必须 bump 版本号：`onupgradeneeded` 只在版本变化时触发。
 */
export const DB_VERSION = 3;

export interface ObjectStoreSchema {
  keyPath: string | null;
  /** name -> 索引名，keyPath -> 索引字段，unique -> 是否唯一 */
  indexes?: Record<string, { keyPath: string; unique?: boolean }>;
}

export const SCHEMA: Record<string, ObjectStoreSchema> = {
  chords: {
    keyPath: 'id',
    indexes: { groupId: { keyPath: 'groupId' } },
  },
  groups: { keyPath: 'id' },
  songs: { keyPath: 'id' },
  syncMeta: { keyPath: 'name' },
  /** 小状态 KV（idbKv 内存镜像的落盘目标）：记录形如 { key, value: string } */
  kv: { keyPath: 'key' },
} as const;

/* ---------------------------------------------------------------------------
 * 编译期 Schema 绑定（零运行时代码）：把每个对象库的「主键类型 / 记录类型 / 索引类型」
 * 与 SCHEMA 对应起来，idb 各方法的 storeName 收紧为 keyof AppDBSchema——
 * 拼错库名、往库里塞错类型记录、按不存在的索引查询，均在编译期报错。
 *
 * ⚠️ 本文件属于 platform，**不得 import 任何 domain 类型**（AGENTS §3，eslint
 * no-restricted-paths 把关）。因此 AppDBSchema 在这里只声明 platform 自有的
 * syncMeta / kv 两库；chords / groups / songs 三库的记录类型由应用层经
 * declaration merging 填充（见 src/app/services/storage/appDbSchema.ts）——
 * app 允许同时看见 platform 与 domains，是唯一合法的「类型汇合点」。
 * ------------------------------------------------------------------------- */
export interface AppDBSchema {
  /** 通用元信息记录：name 为主键；已知用途为 song-order 顺序索引（见 songRepository） */
  syncMeta: { key: string; value: { name: string; ids?: string[] } };
  /** 小状态 KV（idbKv 内存镜像的落盘目标）：记录形如 { key, value: string } */
  kv: { key: string; value: { key: string; value: string } };
}

export type StoreName = keyof AppDBSchema & string;

/** 无索引的库在 AppDBSchema 中不声明 indexes，读取时统一回退为空索引表 */
type StoreIndexes<K extends StoreName> = AppDBSchema[K] extends { indexes: infer I } ? I : Record<string, never>;

let dbPromise: Promise<IDBPDatabase> | null = null;

/**
 * SCHEMA 驱动的 upgrade：新建 store 与「把老库索引集合对齐到 SCHEMA」共用同一个 upgrade 事务。
 * `idb` 包把 upgrade 回调化，事务由回调结束自动提交——无需手动监听 oncomplete。
 */
function upgrade(
  db: IDBPDatabase,
  _oldVersion: number,
  _newVersion: number | null,
  upgradeTx: IDBPTransaction<unknown, string[], 'versionchange'>
): void {
  for (const [storeName, schema] of Object.entries(SCHEMA)) {
    const wantedIndexes = schema.indexes ?? {};
    if (!db.objectStoreNames.contains(storeName)) {
      const store = schema.keyPath
        ? db.createObjectStore(storeName, { keyPath: schema.keyPath })
        : db.createObjectStore(storeName);
      for (const [indexName, idx] of Object.entries(wantedIndexes)) {
        store.createIndex(indexName, idx.keyPath, { unique: !!idx.unique });
      }
      continue;
    }
    // 已存在的 store：既要补建缺失索引，也要删除 SCHEMA 中不再声明的陈旧索引 ——
    // 只加不删会让历史版本的死索引永久留在老库里（索引按 keyPath 建，字段不存在时恒为空）。
    const store = upgradeTx.objectStore(storeName);
    const wantedNames = new Set(Object.keys(wantedIndexes));
    // 先收集再删除：deleteIndex 会让 indexNames 前移，边遍历边删会漏掉后继项
    const staleIndexNames: string[] = [];
    for (let i = 0; i < store.indexNames.length; i += 1) {
      const indexName = store.indexNames.item(i);
      if (indexName && !wantedNames.has(indexName)) staleIndexNames.push(indexName);
    }
    for (const indexName of staleIndexNames) {
      store.deleteIndex(indexName);
    }
    for (const [indexName, idx] of Object.entries(wantedIndexes)) {
      if (!store.indexNames.contains(indexName)) {
        store.createIndex(indexName, idx.keyPath, { unique: !!idx.unique });
      }
    }
  }
}

/** 当前已打开的数据库连接：versionchange 阻塞回调据此关闭本页旧连接放行升级 */
let activeDb: IDBPDatabase | null = null;

/** 按指定版本号打开连接（undefined = 跟随磁盘当前版本，不触发 upgrade；upgrade 逻辑见 upgrade()）。 */
function openAt(version?: number): Promise<IDBPDatabase> {
  const options = {
    upgrade,
    // 升级被其他标签页占用时等待其释放后自动继续（替代旧实现的立即报错，体验更平滑）
    blocked: () => undefined,
    // 本页旧连接收到 versionchange 时必须主动关闭，否则它不注册释放逻辑
    // （idb 只在提供 blocking 时才监听 versionchange），其它标签页的升级会永久挂起。
    // 同时必须作废 dbPromise：连接已 close，若缓存仍返回旧 Promise，本页所有后续
    // 读写会在已关闭连接上抛 InvalidStateError 且永不自愈（P1 审计 N 系）
    blocking: () => {
      activeDb?.close();
      activeDb = null;
      dbPromise = null;
    },
  };
  return version === undefined ? openIdb(DB_NAME, undefined, options) : openIdb(DB_NAME, version, options);
}

/** 识别 VersionError（磁盘库版本高于代码声明版本时 indexedDB.open 会抛） */
function isVersionError(error: unknown): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if (current instanceof DOMException && current.name === 'VersionError') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * 打开连接并自愈 schema：磁盘库版本号可能与 SCHEMA 内容脱节
 * （例：库已到 v3 但缺某个 store——onupgradeneeded 只在版本变化时触发，缺的库永远补不上）。
 * 打开成功后校验 SCHEMA 声明的全部 store，缺哪个就以 version+1 重开一次，借 upgrade 补建。
 */
async function openDb(): Promise<IDBPDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    let db: IDBPDatabase;
    try {
      db = await openAt(DB_VERSION);
    } catch (error) {
      // 自愈路径会把磁盘库 bump 到高于 DB_VERSION 的版本；此后按声明版本打开会抛
      // VersionError —— 此时改用「不指定版本」打开（跟随磁盘版本，不触发 upgrade）。
      if (isVersionError(error)) db = await openAt(undefined);
      else {
        // 打开失败必须作废 dbPromise：否则缓存里永远留着这条 rejected promise，
        // 之后所有 openDb() 都返回它、在已失败的连接上反复抛同一错且永不自愈
        // （P0 审计 #5：冷启动 IDB 偶发失败 → 整 tab 持久化永久毒化，且无恢复路径）。
        dbPromise = null;
        throw errors.storage('打开 IndexedDB 失败', { context: { db: DB_NAME }, cause: error });
      }
    }
    const missingStores = Object.keys(SCHEMA).filter(name => !db.objectStoreNames.contains(name));
    if (missingStores.length > 0) {
      db.close();
      db = await openAt(db.version + 1);
      const stillMissing = Object.keys(SCHEMA).filter(name => !db.objectStoreNames.contains(name));
      if (stillMissing.length > 0) {
        db.close();
        // 同上：补建失败也要作废，否则该 rejected promise 会毒化后续所有读写。
        dbPromise = null;
        throw errors.storage('IndexedDB 对象库补建失败', { context: { db: DB_NAME, stores: stillMissing } });
      }
    }
    activeDb = db;
    return db;
  })();
  return dbPromise;
}

/** 统一错误包装：`idb` 包抛原生 DOMException，这里归一化为 AppError.storage */
async function guard<T>(op: string, context: Record<string, unknown>, fn: () => Promise<T> | T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw errors.storage(`IndexedDB ${op}失败`, { context, cause: error });
  }
}

export const idb = {
  async get<K extends StoreName>(
    storeName: K,
    key: AppDBSchema[K]['key']
  ): Promise<AppDBSchema[K]['value'] | undefined> {
    const db = await openDb();
    return guard('操作', { storeName }, () => db.get(storeName, key)) as Promise<AppDBSchema[K]['value'] | undefined>;
  },
  async getAll<K extends StoreName>(storeName: K): Promise<AppDBSchema[K]['value'][]> {
    const db = await openDb();
    return guard('操作', { storeName }, () => db.getAll(storeName)) as Promise<AppDBSchema[K]['value'][]>;
  },
  async put<K extends StoreName>(storeName: K, value: AppDBSchema[K]['value']): Promise<IDBValidKey> {
    // 配额熔断：存储已满时不再反复冲击写入，但必须让调用方感知失败——
    // 静默 resolve 会让上层误判已落盘（chordStore.persistAll 会据此解除冷却、chordRepository.save
    // 随后更新镜像），下一轮 diff 跳过 put 导致数据永久写不进 IDB（P0 审计 #1）。改为抛错，由调用方
    // catch 后保留脏标记并上报，下一轮重试。删除/清空类操作不受熔断影响（见 delete/clear）。
    if (isPersistBlocked()) throw errors.storage('存储配额已超限，写入已暂停', { context: { storeName } });
    const db = await openDb();
    return guard('操作', { storeName }, () => db.put(storeName, value));
  },
  async delete<K extends StoreName>(storeName: K, key: AppDBSchema[K]['key']): Promise<void> {
    const db = await openDb();
    await guard('删除', { storeName }, () => db.delete(storeName, key as IDBValidKey));
  },
  async clear<K extends StoreName>(storeName: K): Promise<void> {
    const db = await openDb();
    await guard('清空', { storeName }, () => db.clear(storeName));
  },
  /** 批量写入同一事务（保证原子性）：tx.done 等价于旧实现的 oncomplete/onerror 手写监听 */
  async bulkPut<K extends StoreName>(storeName: K, values: AppDBSchema[K]['value'][]): Promise<void> {
    if (values.length === 0) return;
    // 配额熔断：已满时不再反复冲击写入，但必须让调用方感知失败（同 put 口径，P0 审计 #1）
    if (isPersistBlocked()) throw errors.storage('存储配额已超限，写入已暂停', { context: { storeName } });
    const db = await openDb();
    await guard('批量写入', { storeName }, async () => {
      const tx = db.transaction(storeName, 'readwrite');
      for (const value of values) {
        void tx.store.put(value);
      }
      await tx.done;
    });
  },
  async bulkDelete<K extends StoreName>(storeName: K, keys: AppDBSchema[K]['key'][]): Promise<void> {
    if (keys.length === 0) return;
    const db = await openDb();
    await guard('批量删除', { storeName }, async () => {
      const tx = db.transaction(storeName, 'readwrite');
      for (const key of keys) {
        void tx.store.delete(key as IDBValidKey);
      }
      await tx.done;
    });
  },
  /** 全量替换：同一事务内先清空再批量写入（原子，避免 clear/put 跨事务竞态） */
  async replaceAll<K extends StoreName>(storeName: K, values: AppDBSchema[K]['value'][]): Promise<void> {
    // 熔断期间短路（不执行 clear：全量替换会先清空后写入，中断会丢库内数据）；
    // 但必须让调用方感知失败，改为抛错而非静默 return（同 put 口径，P0 审计 #1）
    if (isPersistBlocked()) throw errors.storage('存储配额已超限，写入已暂停', { context: { storeName } });
    const db = await openDb();
    await guard('全量替换', { storeName }, async () => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.store.clear();
      for (const value of values) {
        void tx.store.put(value);
      }
      await tx.done;
    });
  },
  /** 按索引键查询 */
  async getAllByIndex<K extends StoreName, I extends keyof StoreIndexes<K> & string>(
    storeName: K,
    indexName: I,
    key: StoreIndexes<K>[I]
  ): Promise<AppDBSchema[K]['value'][]> {
    const db = await openDb();
    return guard('索引查询', { storeName, indexName }, () =>
      db.getAllFromIndex(storeName, indexName, key as IDBValidKey)
    ) as Promise<AppDBSchema[K]['value'][]>;
  },
  /** 列出对象库全部主键（不取值，用于全量对账/孤儿清理） */
  async getAllKeys<K extends StoreName>(storeName: K): Promise<AppDBSchema[K]['key'][]> {
    const db = await openDb();
    return guard('主键列举', { storeName }, () => db.getAllKeys(storeName)) as Promise<AppDBSchema[K]['key'][]>;
  },
  /**
   * 跨对象库单事务：fn 内经 get(storeName) 拿各库 objectStore 操作，
   * 任一抛错即 abort 整个事务（如 groups/chords 的「同生共死」原子写）。
   */
  async runTx(
    storeNames: string[],
    mode: IDBTransactionMode,
    fn: (get: (storeName: string) => IDBObjectStore) => void
  ): Promise<void> {
    // 配额熔断：写型事务不再冲击已满存储（与 put/bulkPut 同口径）；但必须抛错让调用方感知失败——
    // 静默 return 会让 chordRepository.save（事务后更新镜像）、songPersistence.flushSongsNow（catch 只
    // 在抛错时恢复脏集合）误判提交成功，导致内存与 IDB 永久分叉、编辑被标「已落盘」（P0 审计 #1）。
    // 改为抛错：上层 catch 据以保留脏标记 / 镜像并重试。读型事务不受熔断影响（本身不写）。
    if (mode === 'readwrite' && isPersistBlocked())
      throw errors.storage('存储配额已超限，写入已暂停', { context: { storeNames, mode } });
    const db = await openDb();
    await guard('事务', { storeNames }, async () => {
      const transaction = db.transaction(storeNames, mode);
      const stores = new Map(storeNames.map(name => [name, transaction.objectStore(name)]));
      let failure: unknown = null;
      try {
        fn(name => {
          const store = stores.get(name);
          if (!store) throw errors.storage(`事务中不存在对象库 ${name}`, { context: { storeNames } });
          // idb 包装类型按 mode 联合把 put/delete 标成可选；消费者均不取返回值，断言回原生签名
          return store as unknown as IDBObjectStore;
        });
      } catch (error) {
        failure = error;
        try {
          transaction.abort();
        } catch {
          /* 已提交/已中止的 abort 调用会抛错，吞掉即可 */
        }
      }
      try {
        await transaction.done;
      } catch (error) {
        // fn 抛错（业务失败）优先于底层 abort 原因；无业务失败时归一化为存储错误
        throw failure ?? errors.storage('IndexedDB 事务已中止', { context: { storeNames }, cause: error });
      }
    });
  },
  async close(): Promise<void> {
    const db = await openDb();
    db.close();
    dbPromise = null;
  },
};
