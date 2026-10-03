import { getCurrentScope, onBeforeUnmount, onScopeDispose, toValue, watch } from 'vue';

import type { MaybeRefOrGetter } from 'vue';

/**
 * 按判据挂/摘的全局监听：判据为真时挂上，为假时摘掉，组件卸载时兜底摘一次。
 *
 * 解决的是「常驻全局监听」的浪费与漂移：
 * ① **浪费**：浮层类组件（BasePopover / 输入框搜索面板…）在 setup 期无条件注册几条 window / document
 *    捕获监听，几十个实例就是几十条常驻监听，而它们只在「打开 / 拖拽中 / 按住」这类窗口内才有意义；
 * ② **漂移**：手写 `addEventListener` / `removeEventListener` 成对出现时，两条语句分散在
 *    相隔几十行的两个函数里（典型是「按下挂、抬起摘」的拖拽），改动其一就静默漏摘 —— 表现为
 *    同一个事件被处理两次，或组件卸载后回调仍在跑。
 *
 * 为什么不用 `useEventListener`：它做的是「**换目标**时摘旧挂新」，而这里要的是「**判据为假时干脆不挂**」；
 * 且 window / document 这类目标会命中它那条「目标是常量」的重载，改传取值器会落到通用目标重载上，
 * 与 PointerEvent 这类具名监听器签名对不上。故本模块只借它的形态（返回即挂、卸载即摘），语义按判据走。
 *
 * 时序：`watch` 走默认的 pre flush —— 翻转发生在交互回调里（pointerdown 里置「拖拽中」），
 * pre flush 在下一帧渲染前就挂好，同一次交互后续派发的事件（pointermove 在**另一个任务**里派发）
 * 不会漏；而摘除发生在判据转假的同一轮微任务里，也不会漏掉重复派发。
 * 用同步 `addEventListener` 与用本函数挂，对事件派发的可观测差异为零。
 *
 * @param target   监听目标（window / document）
 * @param isOn     判据：为真挂、为假摘；随判据变化自动挂/摘
 * @param event    事件名
 * @param listener 监听器
 * @param options  与原生一致的监听选项（capture / passive…）；**挂与摘用同一份**，不会像手写那样两边写岔
 */
export function useConditionalListener<E extends keyof WindowEventMap>(
  target: Window,
  isOn: MaybeRefOrGetter<boolean>,
  event: E,
  listener: (e: WindowEventMap[E]) => void,
  options?: AddEventListenerOptions
): void;
export function useConditionalListener<E extends keyof DocumentEventMap>(
  target: Document,
  isOn: MaybeRefOrGetter<boolean>,
  event: E,
  listener: (e: DocumentEventMap[E]) => void,
  options?: AddEventListenerOptions
): void;
export function useConditionalListener(
  target: Window | Document,
  isOn: MaybeRefOrGetter<boolean>,
  event: string,
  listener: EventListener,
  options?: AddEventListenerOptions
): void {
  const attach = (): void => target.addEventListener(event, listener, options);
  const detach = (): void => target.removeEventListener(event, listener, options);

  // `MaybeRefOrGetter<boolean>` 里那个裸 `boolean` 分支过不了 `watch` 的 `WatchSource` 重载
  // （它只认 ref / computed / 取值器），故先归一成取值器再交给 watch —— 值 / ref / 取值器三种入参
  // 由 `toValue` 统一收口，调用方不必关心传的是哪一种。
  //
  // ⚠️ 不要图省事写成 `watch([isOn], ([on]) => …)`：它能编过，但数组重载把 `on` 推成
  // `MaybeRefOrGetter<boolean>`（**元素本身**，不是它的值），类型上已不是布尔 —— 看着对、语义错，
  // 而且 `isOn` 传 ref / 取值器时它恒为真，摘除分支永远不会走到。
  watch(
    () => toValue(isOn),
    on => (on ? attach() : detach()),
    { immediate: true }
  );
  // watch 随组件作用域自动停止，但「停止」不会执行摘除分支 —— 卸载时必须显式摘一次。
  // 走 onScopeDispose 而不是只挂 onBeforeUnmount：后者在**非组件作用域**（store setup /
  // effectScope.run）里不注册任何钩子，那些调用点会静默泄漏监听器；判据与同目录的
  // useRafThrottle / useChunkedMount 同款（组件 setup 也有 scope，故这一条即覆盖两种场景）。
  if (getCurrentScope()) onScopeDispose(detach);
  else onBeforeUnmount(detach);
}
