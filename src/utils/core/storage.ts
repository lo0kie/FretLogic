/**
 * localStorage 读取 JSON 的共享实现。
 *
 * repositories / migrateLegacy 此前各有一份逐字相同的 readJson(storage,key)，
 * bootstrap 另有一份数组语义变体。这里收敛为两档：
 * - readJson：读任意 JSON，键缺失或解析失败返回 undefined
 * - readJsonArray：读 JSON 数组，键缺失/解析失败/非数组均返回空数组
 */

/** 从指定存储读取并解析 JSON；键不存在或解析失败时返回 undefined。 */
export const readJson = (storage: Storage, key: string): unknown => {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
};

/** 从指定存储读取 JSON 数组；键不存在、解析失败或非数组时返回空数组。 */
export const readJsonArray = <T>(storage: Storage, key: string): T[] => {
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
};
