/**
 * top-layer 入口的幂等包装：把「进 / 出浏览器顶层」收敛成两个可反复调用的动作。
 *
 * 为什么必须有包装，而不是各调用点直接写 `el.showPopover()`：
 * 打开 / 关闭在这些组件里都是**多路径 + 可打断**的（v-model 外部置值、触发交互、离场动画结束、
 * 卸载兜底、快速关-开），同一路径重复到达是常态。裸调两个 API 时状态不符虽不抛错（show 已在
 * 打开态即返回、hide 已在关闭态即返回），但 `isConnected` 那一层不成立——宿主已被 v-if 摘掉时
 * `showPopover()` 会抛 `InvalidStateError`，而它抛在 Vue 的渲染 / 卸载回调里，会把整条调用栈打断。
 * 故两个动作都自带「元素还在、且状态真的需要变」两道前置判断，调用点不必再各写一遍。
 *
 * 支持度：Popover API 自 2024-04 起为 Baseline（Chrome/Edge 114+、Safari 17+、Firefox 125+），
 * 与本仓既有的 `dvh` / `:has()` 用量同一档。按「不做双轨降级」的口径，这里不保留 z-index 回退路径：
 * 保留它等于把这次迁移的收益全部抵消（两套层叠来源并存，谁压谁取决于浏览器是否支持）。
 */

/**
 * 元素当前是否真的在 top-layer 里（即处于 popover 打开态）。
 *
 * 判据取 `:popover-open` 而不是自记的标志位：自记位会在「动画未结束就被摘掉宿主」「同一 tick 内
 * 反复开关」这类路径上与浏览器的真实状态分叉，而这里问的正是浏览器的真实状态。
 */
export const isInTopLayer = (el: HTMLElement | null): boolean =>
  Boolean(el?.isConnected && el.matches(':popover-open'));

/** 把元素放进 top-layer（已在其中或元素已卸载时为空操作） */
export const showInTopLayer = (el: HTMLElement | null): void => {
  if (!el?.isConnected || el.matches(':popover-open')) return;
  el.showPopover();
};

/** 把元素移出 top-layer（本就不在其中或元素已卸载时为空操作） */
export const hideFromTopLayer = (el: HTMLElement | null): void => {
  if (!isInTopLayer(el)) return;
  (el as HTMLElement).hidePopover();
};

/**
 * 把已在 top-layer 里的元素**重新抬到最上**（不在其中则等同于 `showInTopLayer`）。
 *
 * 实现是 hide + show：浏览器不提供「重排 top-layer」的 API，而 top-layer 的次序只由进入先后决定，
 * 要改次序只能重进一次。两个调用在同一任务内同步完成，中间不产生绘制，故不会闪 ——
 * 但 hide 会跑一次「焦点归还」（若焦点在被隐藏的元素内），因此**只对不含可聚焦内容的元素使用**：
 * 目前唯一的使用者是 vTooltip 的单例浮层（`pointer-events: none`，永不可聚焦）。
 * BasePopover 的同类需求（hover 再次进入时置顶）刻意不做，理由见那里的注释。
 */
export const raiseInTopLayer = (el: HTMLElement | null): void => {
  if (!el?.isConnected) return;
  if (!el.matches(':popover-open')) {
    el.showPopover();
    return;
  }
  el.hidePopover();
  el.showPopover();
};
