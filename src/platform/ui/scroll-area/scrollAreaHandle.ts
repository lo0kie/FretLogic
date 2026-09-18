/**
 * BaseScrollArea 的类型契约与宿主句柄。
 *
 * 滚动容器就是 BaseScrollArea 的组件根元素，宿主若需要原生能力
 * （scrollTop / contains / querySelector / 传给 useEdgeScroll 等 composable），
 * 经句柄取元素，而不是到处手写 `?.element`：
 *
 *   const areaRef = useTemplateRef<ScrollAreaHandle>('areaRef');
 *   const scrollRef = useScrollAreaElement(areaRef);   // Ref<HTMLElement | null>
 */
import { computed, toValue } from 'vue';

import type { EdgeFadeOptions } from '@/platform/directives/vEdgeFade';
import type { ScrollbarOptions } from '@/platform/directives/vScrollbar';
import type { WheelScrollOptions } from '@/platform/directives/vWheelScroll';
import type { MaybeRefOrGetter, Ref } from 'vue';

/** 生效轴向：'y' 纵向 | 'x' 横向 | 'both' 双轴（双轴由指令按溢出自动判定） */
export type ScrollAreaAxis = 'x' | 'y' | 'both';

/** 边缘羽化：true 按 axis 定向 | false 关闭 | 数值·CSS 长度·选项对象透传 v-edge-fade */
export type ScrollAreaFade = boolean | number | string | EdgeFadeOptions;

/** 自绘滚动条：true 按 axis 定向 | false 关闭（指令被动模式：仍注入 overflow 并隐藏原生滚动条，不挂 overlay） | 选项对象透传 v-scrollbar
 *  （选项对象可带 bubble 滚动气泡提示，见 v-scrollbar 的 ScrollbarBubbleOptions） */
export type ScrollAreaScrollbar = boolean | ScrollbarOptions;

/** 滚轮接管：true 默认档 | false 不接管（原生滚动） | 选项对象透传 v-wheel-scroll（smooth / overscroll / disabled 等） */
export type ScrollAreaWheel = boolean | WheelScrollOptions;

/** 响应式滚动状态快照：BaseScrollArea 内部维护（scroll 事件 + 容器/子元素尺寸观察兜底），宿主在 computed/watch 中直接消费 */
export interface ScrollAreaState {
  scrollLeft: number;
  scrollTop: number;
  scrollWidth: number;
  scrollHeight: number;
  clientWidth: number;
  clientHeight: number;
  /** 横向可滚动距离（scrollWidth - clientWidth，≤0 视为不可横向滚动） */
  scrollableX: number;
  /** 纵向可滚动距离（scrollHeight - clientHeight，≤0 视为不可纵向滚动） */
  scrollableY: number;
}

/** BaseScrollArea 经 defineExpose 暴露给宿主的句柄（ref 已解包为元素） */
export interface ScrollAreaHandle {
  /** 组件根节点，即真正的滚动容器元素 */
  element: HTMLElement | null;
  /** 响应式滚动状态（reactive 对象，模板 ref 解包后仍是代理，属性访问可被 computed/watch 追踪） */
  scrollState: ScrollAreaState;
  /** 强制同步一次滚动状态：内容尺寸变化（如缩放、页流增减）不触发 scroll 事件与容器 ResizeObserver 时按需调用 */
  sync: () => void;
}

/** 由 BaseScrollArea 组件 ref 派生元素 ref：滚动类 composable 与原生事件绑定只认元素本身 */
export const useScrollAreaElement = (
  area: MaybeRefOrGetter<ScrollAreaHandle | null | undefined>
): Ref<HTMLElement | null> => computed(() => toValue(area)?.element ?? null);
