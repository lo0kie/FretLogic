import { inject, reactive } from 'vue';

import { cloneDeep } from '@/platform/utils/common';

import type { InjectionKey } from 'vue';

/**
 * 模态控制器：统一「弹窗开关集合 + 弹窗数据」的声明与打开/关闭样板。
 * 分组/乐谱/备份三类模态 composable 复用；各自的业务动作（校验/写 store/message）仍留在调用方。
 * 返回的 modals 与 modalData 均为响应式对象，模板可直接 v-model 绑定。
 */
export function useModalController<F extends Record<string, boolean>, D extends object>(
  initialFlags: F,
  initialData: D
) {
  // pristine 在创建时深拷贝定格：modalData 是所有弹窗共用的单份对象，若与出厂数据共享嵌套引用，
  // 某弹窗原地改写嵌套字段会把污染带进「回落」的源里，回落就再也回不到真初值
  const pristine = cloneDeep(initialData);
  const modals = reactive({ ...initialFlags }) as Record<keyof F, boolean>;
  const modalData = reactive(cloneDeep(initialData)) as D;

  /**
   * 打开指定弹窗；可先应用数据补丁（预填/重置弹窗数据）。
   *
   * modalData 是所有弹窗共用的单份响应式对象，因此每次 open 都先**整体回落到出厂数据**再套
   * patch —— 此前只覆盖传入字段，未覆盖的字段会保留上一个弹窗写入的旧值，而调用方并不都传全
   * （`open('create')` 一个字段都不传），「上一个弹窗的数据泄漏进当前弹窗」（如 activeGroup
   * 残留导致误操作）就成为可达路径。回落语义与备份弹窗「关闭即归位到打开时默认值」的既有
   * 看门一致；调用方若需跨开合保留草稿，应把草稿放在自己的状态里而不是 modalData。
   */
  const open = <K extends keyof F & string>(key: K, patch?: Partial<D>): void => {
    Object.assign(modalData, cloneDeep(pristine));
    if (patch) Object.assign(modalData, patch);
    modals[key] = true;
  };

  /** 关闭指定弹窗 */
  const close = <K extends keyof F & string>(key: K): void => {
    modals[key] = false;
  };

  return { modals, modalData, open, close };
}

/** 容器组件注入模态控制器：键是**类型化 InjectionKey**（provide 与 inject 两端共用同一符号，
 *  不再各写字符串字面量），注入缺失时给出明确报错 */
export function injectModalController<T>(key: InjectionKey<T>): T {
  const controller = inject(key);
  if (controller == null)
    throw new Error(`模态控制器未注入：容器组件缺少 provide(${String(key.description ?? String(key))}, ...)`);
  return controller;
}
