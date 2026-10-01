/**
 * 极简订阅钩子：`Set` + 订阅 / 退订 + 广播。
 *
 * 为什么单独立一份：这套「`Set` 存监听、`on` 返回退订函数、广播时遍历」的骨架在仓内被抄了五遍
 * （`persistFailure` 的持久化失败、`motion` 的减弱动效偏好、`idbKv` 的水合完成、
 * `overlayLifecycle` 的模态在屏、`exitFlush` 的退出落盘），五份只有注释维系，且**广播口径已经分叉**：
 * 两处遍历 `[...set]` 快照，三处直接遍历 `Set` 本身。这不是风格差异 —— 直接遍历时，
 * 「回调里注册一个新监听」会让新监听在本轮就被调用（自我追加即死循环），而快照版不会。
 * 收在一处后口径只有一个说法：**本轮广播的接收者 = 广播开始那一刻的订阅者集合**。
 *
 * 刻意不用 `@vueuse/core` 的 `createEventHook`：装的 14.4.0 版本没有它的类型出口
 * （`@vueuse/shared` 未安装），引入即要开类型后门。
 */

export interface Hook<T extends unknown[]> {
  /**
   * 订阅；返回退订函数。
   *
   * 退订幂等（重复调用只是重复 `delete` 同一个不存在的键），故可以在「卸载」与「关闭」两条
   * 路径上都调一次而无需去重。
   */
  on: (listener: (...args: T) => void) => () => void;
  /**
   * 广播。
   *
   * 遍历的是**快照**：监听方在回调里退订自己、或注册新的监听，都不会影响本轮已经确定下来的接收者集合。
   * 监听方抛错会中断本轮剩余监听（与五处原实现一致，本模块不擅自加 try/catch ——
   * 需要「单个失败不阻断其余」的调用方（如退出落盘）应在注册时自行包一层）。
   */
  emit: (...args: T) => void;
  /**
   * 清空全部订阅。
   *
   * 供「只广播一次」的钩子在广播后释放闭包引用（见 `idbKv` 的水合完成）——
   * 那种钩子广播后再无人会收到通知，留着订阅者只是白占引用。
   */
  clear: () => void;
}

/** 建一个订阅钩子。类型参数是广播的参数元组，如 `createHook<[info: PersistFailureInfo]>()`。 */
export const createHook = <T extends unknown[] = []>(): Hook<T> => {
  const listeners = new Set<(...args: T) => void>();
  return {
    on: listener => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    emit: (...args) => {
      for (const listener of [...listeners]) listener(...args);
    },
    clear: () => listeners.clear(),
  };
};
