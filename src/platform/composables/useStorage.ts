/**
 * `useStorage` 的应用统一入口：默认后端为 IDB kv 库的同步内存镜像（见 idbKv.ts），
 * 应用所有小状态的持久化统一经此入口走 IDB。
 *
 * 调用点只需把 import 来源从 '@vueuse/core' 切到本模块，调用表达式与序列化器等 options 原样保留。
 * 显式传入自定义 StorageLike 的调用仍被支持（第三参为带 getItem 的对象时原样透传）。
 *
 * ⚠️ `string` / `boolean` / `number` 三组重载**不是**泛型签名的冗余抄写，删不得（试过，删完 19 条
 * 类型错误）：它们的作用是把 `initial` 的类型**拓宽**到基本类型。泛型签名下 `T` 由 `initial` 反推，
 * 而 TS 只对**新鲜字面量**（当场写出的 `'lo0kie'`）做字面量拓宽，对 `as const` 对象的只读属性
 * （`GITHUB_SYNC_CONFIG.DEFAULT_OWNER`，类型是 `'lo0kie'`）**不拓宽** —— 于是 ref 的类型落成
 * `RemovableRef<'lo0kie'>`，`settingsStore` 里 `githubOwner.value = <string>` 直接 TS2322，
 * 与旧值的比较还会被判成「永不成立」的 TS2367。显式写出 `MaybeRefOrGetter<string>` 的重载
 * 先命中，返回类型恒为 `RemovableRef<string>`，这一整类问题才不存在。
 *
 * 给 `T` 加 `extends string | number | boolean` 约束同样不行（也试过）：约束反而让 TS 保留字面量，
 * 连新鲜字面量那条路径都会开始报错。
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
  // options 的两个候选位置都要收：四参形态的 options 在第四位，而「第三参显式传 undefined」的调用
  // （storage 为可选参数的包装层，如 useWorkbenchPanelExpanded 的 `useStorage(key, true, storage, { serializer })`
  // 在 storage 缺省时）会把 options 落在**第三位**。此前只展开第三位，第四位整份丢弃 ——
  // 自定义 serializer 静默失效，四个工作台面板的展开态读回 'expanded' / 'collapsed' 字符串后一律真值，
  // 收起状态再也持久化不下来，且全程无报错。
  // 两个位置都要收，且**不能**二选一：三参形态的 options 在第三位，四参形态的在第四位，
  // 而「第三参显式传 undefined」时第三、第四位在运行时分不出是哪种形态（第三位只是个 undefined），
  // 只取其中一个位置都会在另一种形态下丢 options。同时给出时以第四位为准（它就是正式的 options 位）。
  const hasStorage = Boolean(storageOrOptions && typeof (storageOrOptions as StorageLike).getItem === 'function');
  const options: UseStorageOptions<T> = {
    ...(hasStorage ? undefined : (storageOrOptions as UseStorageOptions<T> | undefined)),
    ...maybeOptions,
  };

  const resolved: UseStorageOptions<T> = {
    // 默认值**不落盘**（@vueuse 的 writeDefaults 默认为 true）。
    // 原因：idbKv 未水合时 getItem 一律返回 null，而 vueuse 把这个 null 当作「键不存在」，
    // 于是把 initial 写进存储——一次伪写入就足以让 IDB 里的真实值被默认值覆盖
    // （启动链路有超时兜底，不保证水合先于一切初始化，见 idbKv.isIdbKvHydrated 的说明）。
    // 关掉之后，「从未设置」在存储层保持为「不存在」，读出的值仍由 initial 提供，
    // 用户可感知行为完全不变；调用点显式传 writeDefaults 时仍以后者为准（展开顺序）。
    writeDefaults: false,
    ...options,
  };

  // 显式传入自定义 StorageLike 的调用两条分支统一收口：默认值不落盘这条保护对任何后端都成立
  // （非 idbKv 的后端同样可能「键不存在 ≠ 该写默认值」），此前透传分支漏了它。
  return hasStorage
    ? useVueStorage<T>(key, initial, storageOrOptions as StorageLike, resolved)
    : useVueStorage<T>(key, initial, idbKvStorage, resolved);
}
