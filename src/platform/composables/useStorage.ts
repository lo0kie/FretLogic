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

  return useVueStorage<T>(key, initial, idbKvStorage, storageOrOptions as UseStorageOptions<T> | undefined);
}
