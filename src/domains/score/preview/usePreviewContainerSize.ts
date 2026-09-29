/**
 * 预览滚动容器的尺寸记忆：可视高宽 + 上次测量值的实例级兜底。
 *
 * 从 `ScorePreviewPane.vue` 里切出来，判据是这两条度量**只服务于布局计算**，与页流、渲染轮次
 * 都无关；而它们各自带着一条容易踩掉的成因（见下方注释），混在组件里时容易被当成普通 ref 改动。
 */
import { computed, watch } from 'vue';

import { useElementSize } from '@vueuse/core';

import type { ComputedRef, Ref } from 'vue';

export interface PreviewContainerSizeApi {
  /** 滚动容器可视高度（px，content-box）：自适应页高与超高判定的基准（重挂载首帧用记忆值兜底） */
  containerHeight: ComputedRef<number>;
  /** 滚动容器可视宽度（px，content-box）：单页档的页宽上限与页流步长都以它为准 */
  containerWidth: ComputedRef<number>;
}

/**
 * 预览页 v-if 重挂载（切 tab 回来）时 ResizeObserver 的异步测量滞后于首帧渲染，若首帧拿到 0
 * 会令自适应页高回退整页高——页面先放大再回落产生闪动。用上次测量值兜底，保证重挂载首帧即正确比例。
 *
 * 记忆是**实例级**（闭包里的局部变量）而不是模块级，这是刻意的：
 * 它要覆盖的场景是模板内的 v-if 重挂载，那不会重跑 setup，实例级足够；而组件真被整体卸载再挂载时
 * 记忆自然丢失 —— 首帧回退测量值，测量结果下一帧即到，自愈且不残留上一个实例的状态。
 */
export const usePreviewContainerSize = (previewScrollRef: Ref<HTMLElement | null>): PreviewContainerSizeApi => {
  let rememberedContainerHeight = 0;
  let rememberedContainerWidth = 0;

  const { height: measuredContainerHeight, width: measuredContainerWidth } = useElementSize(previewScrollRef);

  /** 测量结果写回实例级记忆，供下次重挂载的首帧使用（宽高各一份，理由同 height） */
  watch(measuredContainerHeight, h => {
    if (h > 0) rememberedContainerHeight = h;
  });
  watch(measuredContainerWidth, w => {
    if (w > 0) rememberedContainerWidth = w;
  });

  const containerHeight = computed(() => measuredContainerHeight.value || rememberedContainerHeight);

  // 与 containerHeight 同款记忆兜底 —— v-if 重挂载的首帧拿不到测量值，没有兜底就会先按桌面口径
  // 渲染一帧「比屏幕还宽」的页再缩回来
  const containerWidth = computed(() => measuredContainerWidth.value || rememberedContainerWidth);

  return { containerHeight, containerWidth };
};
