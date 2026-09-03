import { inject, reactive } from 'vue';

/**
 * 模态控制器：统一「弹窗开关集合 + 弹窗数据」的声明与打开/关闭样板。
 * 分组/乐谱/备份三类模态 composable 复用；各自的业务动作（校验/写 store/toast）仍留在调用方。
 * 返回的 modals 与 modalData 均为响应式对象，模板可直接 v-model 绑定。
 */
export function useModalController<F extends Record<string, boolean>, D extends object>(
  initialFlags: F,
  initialData: D
) {
  const modals = reactive({ ...initialFlags }) as Record<keyof F, boolean>;
  const modalData = reactive({ ...initialData }) as D;

  /**
   * 打开指定弹窗；可先应用数据补丁（预填/重置弹窗数据）。
   * ⚠️ modalData 是所有弹窗共用的单份响应式对象：patch 只覆盖传入字段，未覆盖的字段会
   * 保留上一个弹窗写入的旧值。调用方必须保证 patch 覆盖该弹窗用到的全部相关字段，
   * 否则会出现「上一个弹窗的数据泄漏进当前弹窗」的隐患（如 activeGroup 残留导致误操作）。
   */
  const open = <K extends keyof F & string>(key: K, patch?: Partial<D>): void => {
    if (patch) Object.assign(modalData, patch);
    modals[key] = true;
  };

  /** 关闭指定弹窗 */
  const close = <K extends keyof F & string>(key: K): void => {
    modals[key] = false;
  };

  return { modals, modalData, open, close };
}

/** 容器组件注入模态控制器：封装 inject<T>(key)! 的类型体操，注入缺失时给出明确报错 */
export function injectModalController<T>(key: string): T {
  const controller = inject<T>(key);
  if (controller == null) throw new Error(`模态控制器未注入：容器组件缺少 provide('${key}', ...)`);
  return controller;
}
