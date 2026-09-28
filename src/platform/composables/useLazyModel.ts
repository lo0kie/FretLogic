import { shallowRef, watch } from 'vue';

import type { ShallowRef } from 'vue';

/**
 * 受控组件的「本地即时值 + 一次性初值快照 + 外部同步 + lazy 门控提交」。
 *
 * 形态：`v-model.lazy` 下输入 / 拖拽期间只更新本地值，到**提交点**（change / blur / 拖拽结束）
 * 才写回 model —— 否则逐键 / 逐帧写回会让上游（多为 store 或深层表单）反复重渲染；
 * 非 lazy 时每次写入都同步回 model。
 *
 * 为什么收在平台层：这段状态机在 `BaseInput` / `BaseTextarea` / `BaseSlider` 里各写了一份，而它的
 * 两条写回条件分处两地 ——「非 lazy 才写」在**写入**侧、「lazy 才写」在**提交点**侧。
 * 漏掉后者的代价不是样式瑕疵而是功能失效：lazy 模式下 model **永不写回**（两个文本控件正是如此，
 * 注释写着「提交点写回 model」、代码里却只有 commitLocal）。收在一处后两者是同一个函数的两个分支。
 *
 * 用 `shallowRef` 而非 `ref`：值一律整体替换（字符串 / 数字 / 区间数组都是新建的），没有原地改字段的场景；
 * 顺带免去 `ref<T>` 在泛型下的 `UnwrapRef` 转换。
 */
export const useLazyModel = <T>(options: {
  /** 读当前 model 值（取初值快照用） */
  model: () => T;
  /** 写回 model */
  commit: (value: T) => void;
  /** 是否 lazy（通常来自 modelModifiers.lazy） */
  lazy: () => boolean;
}) => {
  /** 本地即时值：初值取 model 的一次性快照（后续由下方 watch 同步） */
  const local: ShallowRef<T> = shallowRef(options.model());
  watch(options.model, v => {
    local.value = v;
  });

  /** 常规写入：总是更新本地值；非 lazy 时同步写回 model */
  const commitLocal = (value: T): void => {
    local.value = value;
    if (!options.lazy()) options.commit(value);
  };

  /**
   * 提交点落盘：lazy 模式下把值写回 model。
   *
   * 非 lazy 时**刻意不重复写**：每次写入已同步过，而区间值那类「每次都是新数组」的形态重复写会让
   * 依赖 model 的下游多空跑一次（口径见 BaseSlider 的 updateValue 注释）。
   */
  const flushIfLazy = (value: T = local.value): void => {
    local.value = value;
    if (options.lazy()) options.commit(value);
  };

  return { local, commitLocal, flushIfLazy };
};
