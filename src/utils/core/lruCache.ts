/**
 * 有上限的 LRU 缓存：超出容量时按插入顺序淘汰最旧条目。
 * 用于替换各处手写的 "size >= N 时删最旧 key" 样板。
 */
export interface LruCache<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  has(key: K): boolean;
  readonly size: number;
}

export function createLruCache<V>(limit: number): LruCache<string, V> {
  const map = new Map<string, V>();
  return {
    get: key => map.get(key),
    has: key => map.has(key),
    set: (key, value) => {
      // 已存在则先删除再插入，刷新到最新位置（访问序 LRU 语义）
      if (map.has(key)) map.delete(key);
      map.set(key, value);
      if (map.size > limit) {
        const oldest = map.keys().next().value;
        if (oldest !== undefined) map.delete(oldest);
      }
    },
    get size() {
      return map.size;
    },
  };
}
