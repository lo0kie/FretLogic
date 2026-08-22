import type { GuitarStringsModel } from '@/types';
import { isProxy, isRef, toRaw, unref } from 'vue';

/**
 * 健壮的深拷贝：
 * 1. 剥离 Vue 响应式代理（reactive/readonly）
 * 2. 如果遇到 Ref，自动解包（防御性）
 * 3. 优先使用 structuredClone，不支持的浏览器回退 JSON
 */
export function cloneDeep<T>(value: T): T {
  // 1. 原始类型
  if (value === null || typeof value !== 'object') {
    return value;
  }

  // 2. 强制剥离所有层的 Vue 代理（reactive/readonly）
  let raw: unknown = isProxy(value) ? toRaw(value) : value;

  // 3. 防御：如果脱壳后是 Ref，解包成原始值（虽然你代码里没有，但加上没坏处）
  if (isRef(raw)) {
    raw = unref(raw);
    // 解包后可能又是对象，递归一次以确保完全清干净
    return cloneDeep(raw as T);
  }

  // 4. 使用浏览器原生结构化克隆（最快，支持循环引用/Date/RegExp/Map/Set）
  try {
    return structuredClone(raw) as T;
  } catch {
    // 5. 兜底：极少数旧浏览器或遇到不可克隆类型（如 Symbol）
    // 注意：JSON 方法会丢失 Date/RegExp/循环引用，但你的数据不包含这些，完全够用
    return JSON.parse(JSON.stringify(raw)) as T;
  }
}

export function cloneGuitarStrings(strings: GuitarStringsModel): GuitarStringsModel {
  const raw = toRaw(strings);
  return [
    [raw[0][0], raw[0][1]],
    [raw[1][0], raw[1][1]],
    [raw[2][0], raw[2][1]],
    [raw[3][0], raw[3][1]],
    [raw[4][0], raw[4][1]],
    [raw[5][0], raw[5][1]],
  ];
}
