/**
 * 排列区 canvas 的「正在构建」标志 —— 顶栏构建指示器读的就是它。
 *
 * 为什么是模块级单例：写侧在 score 域的排列区里、读侧在 app 层的顶栏里，两者不是父子，
 * 走 props / emit 要穿四层。同域已有先例 —— `scorePreviewCache` 导出的 `isPreviewRendering`
 * 同样由顶栏直接 import（见 app/layouts/useHeaderDocActions），本模块与它并列。
 *
 * 为什么不在「排完」的那一刻立刻置 false：构建本身是**同步**的（重排与逐行重绘都在 Vue 的
 * patch 里跑完），一置一清之间没有任何可观察的中间态 —— 指示器的滑入动画会被当场打断，
 * 观感就是「闪一下」。故这里用两帧收口（等 patch 提交、等位图落屏）再叠一个最小时长。
 */
import { ref } from 'vue';

/** 排列区正在构建（顶栏据此显示指示条） */
export const isArrangeCanvasBuilding = ref(false);

/**
 * 指示条的**最短可见时长**（ms）。
 *
 * 取值要让「滑入 + 滑出」两段过渡都播得完（各 `$duration-base`），又不至于在连续重排时
 * 一直挂在顶栏上。
 */
const MIN_VISIBLE_MS = 400;

let hideTimer: ReturnType<typeof setTimeout> | null = null;
let rafHandle: number | null = null;

/**
 * 登记一次构建（重排口径变化 / 换歌 / 首次挂载时调用）。
 *
 * 连续调用会把收口时刻**顺延**（清掉在途的计时与帧），故一段连续的构建只对应一次完整的
 * 指示器显示，中途不会闪断。
 */
export const markArrangeCanvasBuilding = (): void => {
  isArrangeCanvasBuilding.value = true;
  if (hideTimer !== null) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (rafHandle !== null) cancelAnimationFrame(rafHandle);
  // 两帧：第一帧等 Vue 把这次 patch 提交（行组件重渲染 + canvas 重绘都在那里跑完），
  // 第二帧等这一批位图落屏。之后才开始计最短可见时长。
  rafHandle = requestAnimationFrame(() => {
    rafHandle = requestAnimationFrame(() => {
      rafHandle = null;
      hideTimer = setTimeout(() => {
        hideTimer = null;
        isArrangeCanvasBuilding.value = false;
      }, MIN_VISIBLE_MS);
    });
  });
};
