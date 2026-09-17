/**
 * 有上限的 LRU 缓存：超出容量时按插入顺序淘汰最旧条目。
 * 用于替换各处手写的 "size >= N 时删最旧 key" 样板。
 */
import { registerCache } from './cacheRegistry';

export interface LruCacheOptions<K, V> {
  /** 条目被淘汰、覆盖或清空时的销毁回调（用于释放 ImageBitmap 等底层原生资源） */
  onEvict?: (key: K, value: V) => void;
  /** 开发面板展示名：传入后（仅 DEV）自动登记到 cacheRegistry，供开发面板查看条数/字节/清空 */
  name?: string;
  /** 单条 value 的字节估算（如位图按 w×h×4、普通数据用 common 的 estimateValueBytes）。
   *  仅在传入 name 时用于开发面板展示；不传则该缓存只显示条数 */
  weigh?: (key: K, value: V) => number;
}

export interface LruCache<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  has(key: K): boolean;
  delete(key: K): boolean;
  clear(): void;
  /** 清空并反注册（开发面板不再展示）。用于模块被 HMR 替换时释放旧实例：
   *  否则旧缓存被注册表的闭包钉住，其位图既不可达也无法回收 */
  dispose(): void;
  readonly size: number;
  /** 命中次数：get 取到值时累加（`has` 只做存在性判断，不计入） */
  readonly hits: number;
  /** 未命中次数：get 未取到值时累加 */
  readonly misses: number;
}

/** 创建字符串键的 LRU 缓存实例：get/set 均刷新位置，超限淘汰最旧条目，支持生命周期释放回调。 */
export function createLruCache<V>(limit: number, options?: LruCacheOptions<string, V>): LruCache<string, V> {
  const map = new Map<string, V>();
  // 反注册句柄（仅 DEV 有值），由 dispose 消费
  let unregister: (() => void) | null = null;
  // 字节合计的脏标记：只有会改变合计的写入才置脏（get 只改访问顺序、不影响合计）。
  // 开发面板每秒采样一次，此前每次都要对全部条目递归估算一遍（4096 条的解析结果级结构 =
  // 每秒数万个临时对象），而稳态下条数没变、结果完全一样。
  // 约定：缓存内的 value 视为不可变快照（写入即新对象），若调用方原地改写已存入的对象，
  // 读数会滞后到下一次写入 —— 这与开发面板「相对参考」的定位一致，不额外做深比较。
  let bytesDirty = true;
  let bytesTotal = 0;
  // 命中统计：只反映「查表结果」，用于开发面板判断缓存是否真在生效。
  // 条数天然不变的全命中缓存与完全没被使用的缓存，读数完全一样，只有命中数能区分。
  let hits = 0;
  let misses = 0;
  const cache: LruCache<string, V> = {
    get: key => {
      if (!map.has(key)) {
        misses++;
        return undefined;
      }
      hits++;
      const val = map.get(key)!;
      map.delete(key);
      map.set(key, val);
      return val;
    },
    has: key => map.has(key),
    delete: key => {
      if (!map.has(key)) return false;
      const val = map.get(key);
      map.delete(key);
      if (val !== undefined) {
        options?.onEvict?.(key, val);
      }
      bytesDirty = true;
      return true;
    },
    set: (key, value) => {
      // 已存在则先删除再插入，刷新到最新位置（访问序 LRU 语义）
      if (map.has(key)) {
        const oldVal = map.get(key);
        map.delete(key);
        if (oldVal !== undefined && oldVal !== value) {
          options?.onEvict?.(key, oldVal);
        }
      }
      map.set(key, value);
      if (map.size > limit) {
        const oldestKey = map.keys().next().value;
        if (oldestKey !== undefined) {
          const oldestVal = map.get(oldestKey);
          map.delete(oldestKey);
          if (oldestVal !== undefined) {
            options?.onEvict?.(oldestKey, oldestVal);
          }
        }
      }
      bytesDirty = true;
    },
    clear: () => {
      if (options?.onEvict) {
        for (const [k, v] of map.entries()) {
          options.onEvict(k, v);
        }
      }
      map.clear();
      bytesDirty = true;
    },
    dispose: () => {
      cache.clear();
      unregister?.();
      unregister = null;
    },
    get size() {
      return map.size;
    },
    get hits() {
      return hits;
    },
    get misses() {
      return misses;
    },
  };
  if (options?.name) {
    const { weigh } = options;
    unregister = registerCache({
      name: options.name,
      limit,
      size: () => cache.size,
      // 命中统计随每次 get 变化，是面板「缓存到底有没有在生效」的直接读数
      hits: () => cache.hits,
      misses: () => cache.misses,
      // 惰性重算：仅在写入置脏后的首次读取时逐条累加，稳态采样直接返回上次结果
      bytes: weigh
        ? () => {
            if (bytesDirty) {
              let total = 0;
              for (const [key, value] of map) total += weigh(key, value);
              bytesTotal = total;
              bytesDirty = false;
            }
            return bytesTotal;
          }
        : undefined,
      clear: () => cache.clear(),
    });
  }
  return cache;
}
