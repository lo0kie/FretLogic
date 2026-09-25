/**
 * `useStorage` 的应用统一入口：默认后端为 IDB kv 库的同步内存镜像（见 idbKv.ts），
 * 应用所有小状态的持久化统一经此入口走 IDB。
 *
 * 与 @vueuse/core 的 useStorage 全部重载签名保持一致（storage 可选参 / options 可选参两种形态），
 * 调用点只需把 import 来源从 '@vueuse/core' 切到本模块，调用表达式与序列化器等 options 原样保留。
 * 显式传入自定义 StorageLike 的调用仍被支持（第三参为带 getItem 的对象时原样透传）。
 */
import { useStorage as useVueStorage } from '@vueuse/core';

import { idbKvStorage } from '@/platform/services/storage/idbKv';

import type { RemovableRef, StorageLike, UseStorageOptions } from '@vueuse/core';
import type { MaybeRefOrGetter } from 'vue';

export function useStorage(
  key: string,
  initial: MaybeRefOrGetter<string>,
  storage?: StorageLike | undefined,
  options?: UseStorageOptions<string>
): RemovableRef<string>;
export function useStorage(
  key: string,
  initial: MaybeRefOrGetter<string>,
  options?: UseStorageOptions<string>
): RemovableRef<string>;
export function useStorage(
  key: string,
  initial: MaybeRefOrGetter<boolean>,
  storage?: StorageLike | undefined,
  options?: UseStorageOptions<boolean>
): RemovableRef<boolean>;
export function useStorage(
  key: string,
  initial: MaybeRefOrGetter<boolean>,
  options?: UseStorageOptions<boolean>
): RemovableRef<boolean>;
export function useStorage(
  key: string,
  initial: MaybeRefOrGetter<number>,
  storage?: StorageLike | undefined,
  options?: UseStorageOptions<number>
): RemovableRef<number>;
export function useStorage(
  key: string,
  initial: MaybeRefOrGetter<number>,
  options?: UseStorageOptions<number>
): RemovableRef<number>;
export function useStorage<T>(
  key: string,
  initial: MaybeRefOrGetter<T>,
  storage?: StorageLike | undefined,
  options?: UseStorageOptions<T>
): RemovableRef<T>;
export function useStorage<T>(
  key: string,
  initial: MaybeRefOrGetter<T>,
  options?: UseStorageOptions<T>
): RemovableRef<T>;
export function useStorage<T>(
  key: string,
  initial: MaybeRefOrGetter<T>,
  storageOrOptions?: StorageLike | UseStorageOptions<T>,
  maybeOptions?: UseStorageOptions<T>
): RemovableRef<T> {
  if (storageOrOptions && typeof (storageOrOptions as StorageLike).getItem === 'function')
    return useVueStorage<T>(key, initial, storageOrOptions as StorageLike, maybeOptions);

  return useVueStorage<T>(key, initial, idbKvStorage, {
    // 默认值**不落盘**（@vueuse 的 writeDefaults 默认为 true）。
    // 原因：idbKv 未水合时 getItem 一律返回 null，而 vueuse 把这个 null 当作「键不存在」，
    // 于是把 initial 写进存储——一次伪写入就足以让 IDB 里的真实值被默认值覆盖
    // （启动链路有超时兜底，不保证水合先于一切初始化，见 idbKv.isIdbKvHydrated 的说明）。
    // 关掉之后，「从未设置」在存储层保持为「不存在」，读出的值仍由 initial 提供，
    // 用户可感知行为完全不变；调用点显式传 writeDefaults 时仍以后者为准（展开顺序）。
    writeDefaults: false,
    ...(storageOrOptions as UseStorageOptions<T> | undefined),
  });
}
