/**
 * useSortableList 的常量契约与对外选项类型。
 *
 * 从 useSortableList.ts 抽出（原 49~101 行）。
 * 纯声明、零运行时依赖（对 sortablejs 只取 type），被 order / preview / index 共同引用。
 */

import { EASE_STANDARD } from '@/platform/utils/constants';

import type Sortable from 'sortablejs';
import type { ComponentPublicInstance, MaybeRefOrGetter } from 'vue';

/** 交给 Sortable 的占位类名契约：它在 start 时必定往被拖元素上挂一个类，这里给无样式类，视觉由内联 opacity 控制 */
export const PLACEHOLDER_CLASS = 'drag-placeholder';
/** 被拖元素本体（跟随指针的那个）；Sortable 的 chosenClass，无样式定义 */
export const CHOSEN_CLASS = 'drag-chosen-style';
/** 拖拽激活态；Sortable 的 dragClass，无样式定义 */
export const ACTIVE_CLASS = 'drag-active-style';
/**
 * 起拖阈值（px）：越过它才认定为拖拽。
 * fallback 通道下 mousedown 会立刻触发 start，而把手往往同时是点击目标
 * （面板折叠头、分组标题行），不设阈值就会「点一下」闪出幽灵影像。
 */
export const DRAG_ACTIVATE_THRESHOLD = 5;
/** 自建拖拽影像：拖拽期间挂在 body 上跟随指针，样式见 main.scss 的 .drag-preview */
export const PREVIEW_CLASS = 'drag-preview';
/** 复位动画缓动：取全局标准曲线（JS 侧唯一的字面量定义在 EASE_STANDARD，见其注释）。
 *  本常量有两个通道：order.ts 用它拼 CSS transition 串、preview.ts 用它喂 WAAPI —— 同源一份 */
export const PREVIEW_SETTLE_EASING = EASE_STANDARD;
/** 拖拽时影像的放大倍数；由 applyPreviewTransform 写进 transform，main.scss 不再设独立 scale 属性 */
export const PREVIEW_SCALE = 1.02;
/** Sortable 自带 fallback 克隆的隐藏类：只用它做几何载体，视觉一律交给 .drag-preview */
export const FALLBACK_HIDDEN_CLASS = 'drag-fallback-hidden';
/** 拖拽期间的全局类：光标与文本选择（main.scss 已有对应样式，供各处拖拽共用） */
export const GLOBAL_DRAGGING_CLASS = 'is-global-dragging';
/**
 * v-wave 注入的波纹容器（它自己的内部标记）。
 * 折叠头既是按钮又是拖拽把手，按下时 v-wave 已经起了波纹，见 activatePreview。
 */
export const WAVE_CONTAINER_SELECTOR = '[data-v-wave-container-internal]';

export interface UseSortableListOptions<T> {
  /**
   * 拖拽容器 ref：其直接子元素即为可排序项。
   * 元素 ref 与组件实例 ref 都可以 —— 组件（如 TransitionGroup）会自动取 $el；
   * 若组件是 Fragment 根（$el 非 Element）则解析不出，建不了实例。
   */
  target: MaybeRefOrGetter<HTMLElement | ComponentPublicInstance | null | undefined>;
  /** 当前数据源（同时用于空列表守卫） */
  items: MaybeRefOrGetter<T[]>;
  /** 是否允许拖拽（响应式）：false 时 Sortable 整体禁用 */
  enabled: MaybeRefOrGetter<boolean>;
  /** 拖拽落定后的新顺序（已按 oldIndex / newIndex 重排），由宿主持久化 */
  onReorder: (next: T[], event: Sortable.SortableEvent) => void;
  /** 拖拽把手选择器；不传则整项可拖 */
  handle?: string;
  /** 动画时长（ms），默认 200 */
  animation?: number;
  /**
   * 交换阈值（占目标尺寸的比例）。保持 Sortable 官方默认 1：指针进入目标即交换。
   * 不要调小（如 0.5）——那会给每个条目上下各留 25% 的「死区」（_getSwapDirection
   * 的正则判定带收缩到中间 50%），横向绕远拖回来悬停在条目顶部/底部时永远不触发交换，
   * 表现为「移回上一个 Item 的顶部却挤不下去」。
   */
  swapThreshold?: number;
}
