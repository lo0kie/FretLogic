/**
 * 取消投放区（宿主渲染的「拖到此处取消」）。
 *
 * 元素由宿主用模板 ref 挂进来：该区只在拖拽期渲染，故随会话挂 / 摘。
 * 判据是**矩形命中**而非 `elementFromPoint` —— 取消区不吃指针事件（`pointer-events: none`），
 * 命中测试根本命中不到它，而它也不该被命中：那会挡住内部源的落点解析。
 */
import { ref } from 'vue';

import type { ComponentPublicInstance, Ref } from 'vue';

export interface CancelZoneApi {
  /** 当前指针是否悬在取消区上（供取消区自己做高亮反馈） */
  isOverCancelZone: Ref<boolean>;
  /** 模板 ref 挂载取消区元素（签名对齐 Vue 的模板 ref 回调，组件实例一律视为未挂载） */
  setCancelZoneEl: (el: Element | ComponentPublicInstance | null) => void;
  /**
   * 取消区命中：命中则清空落点、置「将取消」标记并返回 true（调用方据此跳过落点解析）。
   *
   * 判据必须落在**合帧回调内部**，不能放在 schedule 那一侧：松手时两条落点节流都会被 flush 一次
   * （见 dragSession 的 handleGlobalPointerUp），而 flush 绕过 schedule、直接拿「最后一帧的位置」
   * 执行 —— 判据留在 schedule 侧的话，那次 flush 会用「进入取消区之前」的旧坐标把落点写回去，
   * 松手反而落到某个槽上。
   *
   * 清空落点即等价于「松手不落地」：落地函数的准入判据本就要求落点键非空，故取消不需要额外的落地分支。
   */
  applyCancelZone: (x: number, y: number) => boolean;
  /** 会话收尾时复位悬停标记（会话态归零的一部分） */
  resetCancelZone: () => void;
}

export const createCancelZone = (clearDropTarget: () => void): CancelZoneApi => {
  // 用普通变量而非 ref —— 它只在指针事件与合帧回调里被读，不参与渲染
  let cancelZoneEl: HTMLElement | null = null;

  const isOverCancelZone = ref(false);

  const setCancelZoneEl = (el: Element | ComponentPublicInstance | null) => {
    cancelZoneEl = el instanceof HTMLElement ? el : null;
  };

  /**
   * 指针是否落在取消区矩形内。取消区在拖拽期固定于视口、不跟手，故每帧现读一次矩形即可，无需缓存。
   */
  const isPointInCancelZone = (x: number, y: number): boolean => {
    if (!cancelZoneEl) return false;
    const rect = cancelZoneEl.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  };

  const applyCancelZone = (x: number, y: number): boolean => {
    if (!isPointInCancelZone(x, y)) {
      isOverCancelZone.value = false;
      return false;
    }
    isOverCancelZone.value = true;
    clearDropTarget();
    return true;
  };

  const resetCancelZone = () => void (isOverCancelZone.value = false);

  return { isOverCancelZone, setCancelZoneEl, applyCancelZone, resetCancelZone };
};
