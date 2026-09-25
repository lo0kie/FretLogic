/**
 * IndexedDB 封装：基于 `idb` 包（Jake Archibald 出品，~1KB）提供 Promise 化访问，
 * 在其之上保留本项目的三层定制：
 * 1. SCHEMA 声明表驱动的 upgrade（含「陈旧索引清理」与「缺库 / 缺索引自愈 bump 重开」）；
 * 2. AppDBSchema 编译期绑定（storeName ↔ 记录类型，见下方类型区）；
 * 3. runTx 跨库原子写事务 + 统一错误包装（AppError.storage）。
 *
 * 数据库：fret-logic-v2，对象库见 SCHEMA。调用方负责错误处理（统一抛 AppError）。
 */
import { openDB as openIdb } from 'idb';

import { AppError, errors } from '@/platform/services/errors';

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
 * ⚠️ 本文件属于 platform，**不得 import 任何 domain 类型**（rules/02-protected-zones.md
 * 的「一、稳定保护区」；eslint
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
      for (const [indexName, idx] of Object.entries(wantedIndexes))
        store.createIndex(indexName, idx.keyPath, { unique: Boolean(idx.unique) });

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
    for (const indexName of staleIndexNames) store.deleteIndex(indexName);

    for (const [indexName, idx] of Object.entries(wantedIndexes))
      if (!store.indexNames.contains(indexName))
        store.createIndex(indexName, idx.keyPath, { unique: Boolean(idx.unique) });
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
 * 读某对象库现有的索引名集合。IDBDatabase 不直接暴露索引，只能经一次（只读）事务取到对象库；
 * `indexNames` 是同步属性，事务随之自动提交，无需 await。
 * 探测失败一律回退成「SCHEMA 声明的索引齐全」：自愈是为了补缺口，不能因为探不到就每次开库都 bump 一次版本。
 */
function readIndexNames(db: IDBPDatabase, storeName: string, wanted: string[]): Set<string> {
  try {
    const store = db.transaction(storeName).objectStore(storeName);
    const names = new Set<string>();
    for (let i = 0; i < store.indexNames.length; i += 1) {
      const name = store.indexNames.item(i);
      if (name) names.add(name);
    }
    return names;
  } catch {
    return new Set(wanted);
  }
}

/**
 * SCHEMA 与磁盘库的差异清单：缺失的对象库，以及**已存在库上缺失的索引**。
 * 两者都要查：`onupgradeneeded` 只在版本变化时触发，所以「库已是当前版本、却少一个 SCHEMA 声明的索引」
 * 这种脱节不会自己愈合——只按缺库判自愈，缺索引的老库会一直缺着（按该索引查询恒空，静默返回错数据）。
 */
function findSchemaDrift(db: IDBPDatabase): { stores: string[]; indexes: string[] } {
  const stores: string[] = [];
  const indexes: string[] = [];
  for (const [storeName, schema] of Object.entries(SCHEMA)) {
    if (!db.objectStoreNames.contains(storeName)) {
      stores.push(storeName);
      continue;
    }
    const wanted = Object.keys(schema.indexes ?? {});
    if (wanted.length === 0) continue;
    const existing = readIndexNames(db, storeName, wanted);
    for (const indexName of wanted) if (!existing.has(indexName)) indexes.push(`${storeName}.${indexName}`);
  }
  return { stores, indexes };
}

/**
 * 打开连接并自愈 schema：磁盘库版本号可能与 SCHEMA 内容脱节
 * （例：库已到 v3 但缺某个 store 或某个索引——onupgradeneeded 只在版本变化时触发，缺口永远补不上）。
 * 打开成功后校验 SCHEMA 声明的全部 store 与索引，缺哪项就以 version+1 重开一次，借 upgrade 补齐。
 */
async function openDb(): Promise<IDBPDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    let db: IDBPDatabase;
    try {
      try {
        db = await openAt(DB_VERSION);
      } catch (error) {
        // 自愈路径会把磁盘库 bump 到高于 DB_VERSION 的版本；此后按声明版本打开会抛
        // VersionError —— 此时改用「不指定版本」打开（跟随磁盘版本，不触发 upgrade）。
        if (!isVersionError(error)) throw error;
        db = await openAt(undefined);
      }
      const drift = findSchemaDrift(db);
      if (drift.stores.length > 0 || drift.indexes.length > 0) {
        db.close();
        db = await openAt(db.version + 1);
        const remaining = findSchemaDrift(db);
        if (remaining.stores.length > 0 || remaining.indexes.length > 0) {
          db.close();
          throw errors.storage('IndexedDB 对象库补建失败', {
            context: { db: DB_NAME, stores: remaining.stores, indexes: remaining.indexes },
          });
        }
      }
    } catch (error) {
      // 打开与自愈的**每一条**失败路径都必须作废 dbPromise：否则缓存里永远留着这条 rejected
      // promise，之后所有 openDb() 都返回它、在已失败的连接上反复抛同一错且永不自愈
      // （P0 审计 #5：冷启动 IDB 偶发失败 → 整 tab 持久化永久毒化，且无恢复路径）。
      // 此前这句只挂在「按声明版本打开」那一支上：自愈段的 openAt(db.version + 1) 与
      // 「补建后仍有缺口」的抛错都绕过了它——而这两条恰是磁盘库状态最脏、最需要重试的路径，
      // 一次偶发失败同样会毒化整个 tab 的持久化。判据改为「凡抛出必作废」，不按分支列举。
      dbPromise = null;
      // 上面已包装成 AppError 的（补建失败）原样上抛，不再重复套一层 storage 文案
      if (error instanceof AppError) throw error;
      throw errors.storage('打开 IndexedDB 失败', { context: { db: DB_NAME }, cause: error });
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

/**
 * 事务内可用的对象库：**只声明消费方用到的能力**，不冒充原生 IDBObjectStore。
 *
 * 为什么不能是原生签名：底层是 idb 包装过的对象库，put / delete 被就地覆写成返回 Promise
 * （而非 IDBRequest），与原生签名不兼容。硬断言回原生类型（`as unknown as IDBObjectStore`）
 * 等于把这一层的类型检查整个关掉 —— 而消费方（chordRepository / songRepository / idbKv）
 * 只用 put / delete、且一律不取返回值，把能力声明到「够用」即可，不必假装是原生对象库。
 */
export interface TxObjectStore {
  put(value: unknown, key?: unknown): unknown;
  delete(key: unknown): unknown;
}

/**
 * 熔断期的对象库代理：拦截 put/add 并抛错，其余操作（delete / clear / get / getAll / index…）原样放行。
 *
 * 为什么按操作而不是按事务拦：`runTx` 曾对 `mode === 'readwrite'` 一律抛错，于是配额熔断期间
 * **连删除都写不进去**——而删除正是用户释放空间、恢复可写的唯一手段，熔断因此变成不可自愈的死锁
 * （idbKv.flushNow 里那句「删除类操作放行以释放空间」与 persistFailure 的「删除/清空类操作不受阻断」
 * 都成了空话，回调内的 `!isPersistBlocked()` 分支也永不可达：守卫在进入回调前就抛了）。
 * 写入仍必须抛错而非静默跳过：静默会让 chordRepository.save（事务后更新镜像）、
 * songPersistence.flushSongsNow（catch 只在抛错时恢复脏集合）误判提交成功，内存与 IDB 永久分叉
 * （P0 审计 #1）。判据在**每次取用时**求值——熔断可能就在本次事务执行期间被打开。
 */
const withQuotaGuard = (store: TxObjectStore, storeNames: string[], mode: IDBTransactionMode): TxObjectStore =>
  new Proxy(store, {
    get(target, prop) {
      if (isPersistBlocked() && (prop === 'put' || prop === 'add'))
        return () => {
          throw errors.storage('存储配额已超限，写入已暂停', { context: { storeNames, mode } });
        };
      const value = Reflect.get(target, prop) as unknown;
      // 原生方法必须绑回真实对象调用，否则触发 Illegal invocation
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });

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
      for (const value of values) void tx.store.put(value);

      await tx.done;
    });
  },
  async bulkDelete<K extends StoreName>(storeName: K, keys: AppDBSchema[K]['key'][]): Promise<void> {
    if (keys.length === 0) return;
    const db = await openDb();
    await guard('批量删除', { storeName }, async () => {
      const tx = db.transaction(storeName, 'readwrite');
      for (const key of keys) void tx.store.delete(key as IDBValidKey);

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
      for (const value of values) void tx.store.put(value);

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
   * 跨对象库单事务（**写入型**）：fn 内经 get(storeName) 拿各库 objectStore 操作，
   * 任一抛错即 abort 整个事务（如 groups/chords 的「同生共死」原子写）。
   *
   * 只做 readwrite：本函数的用途就是多库原子写，读型多库事务用不到这层封装（逐库 idb.get 即可）。
   * 收窄成字面量还让 idb 不再把 put/delete 标成可选（它按 mode 联合把只读事务的写操作声明为
   * undefined），因此无需对对象库类型做任何断言 —— 见 TxObjectStore。
   */
  async runTx(storeNames: string[], fn: (get: (storeName: string) => TxObjectStore) => void): Promise<void> {
    // 必须留字面量类型：注解成 IDBTransactionMode 会把类型推宽回联合，idb 随即又把写操作标成可选
    const mode = 'readwrite';
    // 配额熔断的处置下移到单个操作（见 withQuotaGuard）：写入型操作抛错让调用方感知失败，
    // 删除/清空类放行以便用户腾空间。整段事务一律抛错会把熔断变成不可自愈的死锁。
    const db = await openDb();
    await guard('事务', { storeNames }, async () => {
      const transaction = db.transaction(storeNames, mode);
      const stores = new Map(storeNames.map(name => [name, transaction.objectStore(name)]));
      let failure: unknown = null;
      try {
        fn(name => {
          const store = stores.get(name);
          if (!store) throw errors.storage(`事务中不存在对象库 ${name}`, { context: { storeNames } });
          return withQuotaGuard(store, storeNames, mode);
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
