/**
 * 轻量 IndexedDB Promise 封装（不引入第三方库）。
 *
 * 数据库：fret-logic-v2，对象库见 SCHEMA。
 * 所有方法均返回 Promise，调用方负责错误处理（统一抛 AppError）。
 */
import { errors } from '@/platform/services/errors';

export const DB_NAME = 'fret-logic-v2';
export const DB_VERSION = 1;

export interface ObjectStoreSchema {
  keyPath: string | null;
  /** name -> 索引名，keyPath -> 索引字段，unique -> 是否唯一 */
  indexes?: Record<string, { keyPath: string; unique?: boolean }>;
}

export const SCHEMA: Record<string, ObjectStoreSchema> = {
  chords: {
    keyPath: 'id',
    indexes: { groupId: { keyPath: 'groupId' }, nameKey: { keyPath: 'nameKey' } },
  },
  groups: { keyPath: 'id', indexes: { sort: { keyPath: 'sort' } } },
  songs: { keyPath: 'id' },
  syncMeta: { keyPath: 'name' },
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const [storeName, schema] of Object.entries(SCHEMA)) {
        if (db.objectStoreNames.contains(storeName)) continue;
        const store = schema.keyPath
          ? db.createObjectStore(storeName, { keyPath: schema.keyPath })
          : db.createObjectStore(storeName);
        for (const [indexName, idx] of Object.entries(schema.indexes ?? {})) {
          store.createIndex(indexName, idx.keyPath, { unique: !!idx.unique });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(errors.storage('打开 IndexedDB 失败', { context: { db: DB_NAME }, cause: request.error }));
    request.onblocked = () => reject(errors.storage('IndexedDB 升级被阻塞', { context: { db: DB_NAME } }));
  });
  return dbPromise;
}

function tx(db: IDBDatabase, storeName: string, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(errors.storage('IndexedDB 操作失败', { cause: req.error }));
  });
}

export const idb = {
  async get<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
    const db = await openDb();
    return requestToPromise(tx(db, storeName, 'readonly').get(key) as IDBRequest<T | undefined>);
  },
  async getAll<T>(storeName: string): Promise<T[]> {
    const db = await openDb();
    return requestToPromise(tx(db, storeName, 'readonly').getAll() as IDBRequest<T[]>);
  },
  async put(storeName: string, value: unknown): Promise<IDBValidKey> {
    const db = await openDb();
    return requestToPromise(tx(db, storeName, 'readwrite').put(value));
  },
  async delete(storeName: string, key: IDBValidKey): Promise<void> {
    const db = await openDb();
    return requestToPromise(tx(db, storeName, 'readwrite').delete(key) as IDBRequest<undefined>);
  },
  async clear(storeName: string): Promise<void> {
    const db = await openDb();
    return requestToPromise(tx(db, storeName, 'readwrite').clear() as IDBRequest<undefined>);
  },
  /** 批量写入同一事务（保证原子性） */
  async bulkPut(storeName: string, values: unknown[]): Promise<void> {
    if (values.length === 0) return;
    const db = await openDb();
    const store = tx(db, storeName, 'readwrite');
    for (const value of values) {
      store.put(value);
    }
    return new Promise((resolve, reject) => {
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => reject(errors.storage('IndexedDB 批量写入失败', { context: { storeName } }));
    });
  },
  async bulkDelete(storeName: string, keys: IDBValidKey[]): Promise<void> {
    if (keys.length === 0) return;
    const db = await openDb();
    const store = tx(db, storeName, 'readwrite');
    for (const key of keys) {
      store.delete(key);
    }
    return new Promise((resolve, reject) => {
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => reject(errors.storage('IndexedDB 批量删除失败', { context: { storeName } }));
    });
  },
  /** 全量替换：同一事务内先清空再批量写入（原子，避免 clear/put 跨事务竞态） */
  async replaceAll(storeName: string, values: unknown[]): Promise<void> {
    const db = await openDb();
    const store = tx(db, storeName, 'readwrite');
    store.clear();
    for (const value of values) {
      store.put(value);
    }
    return new Promise((resolve, reject) => {
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => reject(errors.storage('IndexedDB 全量替换失败', { context: { storeName } }));
      store.transaction.onabort = () => reject(errors.storage('IndexedDB 全量替换已中止', { context: { storeName } }));
    });
  },
  /** 按索引键查询 */
  async getAllByIndex<T>(storeName: string, indexName: string, key: IDBValidKey): Promise<T[]> {
    const db = await openDb();
    const store = tx(db, storeName, 'readonly');
    const index = store.index(indexName);
    return requestToPromise(index.getAll(key) as IDBRequest<T[]>);
  },
  async close(): Promise<void> {
    const db = await openDb();
    db.close();
    dbPromise = null;
  },
};
