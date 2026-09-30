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
/**
 * 触摸端的长按门槛（ms）：手指按住这么久才认作拖拽。
 *
 * 触屏上「按住就拖」与「滑动滚动」是同一根手指的同一个手势 —— sortable 的 fallback 通道在
 * `_onTouchMove` 末句无条件 `preventDefault()`，不设门槛时手指一落下、稍一移动就进入拖拽，
 * 列表（乃至整页）从此滚不动。鼠标不受影响（`delayOnTouchOnly`）。
 *
 * 口径与歌词拖拽一致（`useLyricsDragDrop` 的 `LONG_PRESS_DELAY`）：两处都是
 * 「鼠标阈值起拖、触摸长按起拖」，改一处要看另一处。
 */
export const DRAG_LONG_PRESS_DELAY = 280;
/**
 * 触摸端的**漂移容差**（px）：手势开始后手指在玻璃上自然抖动的量级，两个窗口共用同一个数。
 *
 * 1) **起拖之前**（仅长按档）：长按等待期内滑动超过它即判定「用户想滚动」，放弃本次起拖，手势交回浏览器。
 *    比 `DRAG_ACTIVATE_THRESHOLD` 宽一倍是有意的：那条是**起拖之后**「算拖拽还是算点击」的分界，
 *    这条管的是**起拖之前**，而手指按在玻璃上等 280ms 本来就会漂几像素，门槛太紧会把长按自己否掉。
 * 2) **起拖之后**（触摸端一律）：触摸端「算拖拽还是算点击」的判定也用它，不用 5px —— 一次正常的
 *    点按在手机上就会漂 5~10px，按 5px 判会让「点标题栏展开/收起」被误判成拖拽（影像闪一下、
 *    点击被吞掉）。故触摸端把这一档放宽到本值，与上面那条同口径。
 *
 * 两处必须同值：它们量的是同一件事（手指在这块玻璃上「没动」的容忍度），分开取值就会在
 * 「长按起来了、但一抬手又被判成点击」这种缝里出错。
 */
export const DRAG_TOUCH_SLOP = 10;

/**
 * 起拖阈值：按**指针类型**取。鼠标取 `DRAG_ACTIVATE_THRESHOLD`（5px，鼠标不存在漂移），
 * 触摸取 `DRAG_TOUCH_SLOP`（10px，理由见其注释）。
 *
 * 只此一处判定：「算拖拽还是算点击」的落定（见 settleClickAfterDrop）读的是影像那边的
 * **锁存结果**（见 preview.isActive），不自己再量一遍位移。两处各量各的时候，判据会分叉 ——
 * 松手点按「离按下点多远」量，拖出去再拖回原位就量成纯点击，于是出现「卡片已经浮起、
 * 抬手却按点击处理」这种自相矛盾（松手处补派的 click 还会点开折叠头）。
 */
export const dragThresholdFor = (pointerType: string | undefined): number =>
  pointerType === 'touch' ? DRAG_TOUCH_SLOP : DRAG_ACTIVATE_THRESHOLD;
/** 自建拖拽影像：拖拽期间挂在 body 上跟随指针，样式见 main.scss 的 .drag-preview */
export const PREVIEW_CLASS = 'drag-preview';
/** 复位动画缓动：取全局标准曲线（JS 侧唯一的字面量定义在 EASE_STANDARD，见其注释）。
 *  本常量有两个通道：order.ts 用它拼 CSS transition 串、preview.ts 用它喂 WAAPI —— 同源一份 */
export const PREVIEW_SETTLE_EASING = EASE_STANDARD;
/** 拖拽时影像的放大倍数；由 applyPreviewTransform 写进 transform，main.scss 不再设独立 scale 属性。
 *  取 1.04 而非更保守的 1.02：那点幅度与阴影渐入叠在一起仍「看不出被拎起来了」 */
export const PREVIEW_SCALE = 1.04;
/** 影像浮现（抬起放大）的时长：必须与 main.scss 里 `.drag-preview` 的
 *  `animation: drag-preview-in 160ms $bezier-standard` **同值** —— 阴影渐入与抬起放大是同一次
 *  「浮起」的两个分量，错开就成了两件事。时长是本模块与 CSS 之间唯一重复的字面量，
 *  改那条 animation 时须同步改这里（浮起的缩放由 WAAPI 补，见 preview.ts 的 activatePreview）。 */
export const PREVIEW_ENTER_DURATION = 160;
/** 浮现动画缓动：与 PREVIEW_SETTLE_EASING 同一条曲线（都是 EASE_STANDARD，即 $bezier-standard /
 *  --bezier-standard 的 JS 镜像 —— WAAPI 不认 var()，那组令牌在 JS 侧只能镜像，见 tokens.scss） */
export const PREVIEW_ENTER_EASING = EASE_STANDARD;
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
  /**
   * **触摸端**的把手选择器（不传 = 触摸与鼠标共用 `handle`）。
   *
   * 存在的理由：同一个元素不可能既「按下即拖」又「滑动滚动」——「按下即拖」要的那一份
   * `touch-action: none` 正是关掉滚动的那一份（见 touchDelay）。所以「不设长按等待」与
   * 「这一处还能滚」只能落在**两个不同的元素**上：滚动留给整行本体，拖拽收进行里那个专用把手。
   * 把手本体通常很小（一个图标），命中面靠样式撑（内边距 + `self-stretch`）。
   *
   * 实现：`handle` 是 Sortable 的**静态**选项，但它在每次起手时才被读一次
   * （`_onTapStart` 里 `closest(target, options.handle)`），故本组合式在 document 捕获层的
   * pointerdown 里按 `pointerType` 现切 `option('handle', …)` —— 那一刻早于 Sortable 挂在容器上
   * 的起手判定（它在冒泡阶段），切换必定先生效。
   */
  touchHandle?: string;
  /**
   * 触摸端起拖前的**长按等待**（ms），默认 `DRAG_LONG_PRESS_DELAY`。
   *
   * 传 0 = 按下即起拖（与鼠标同档），只在**把手是专用元素**时用：那时列表不靠把手滚动，
   * 长按就成了纯粹的阻碍 —— 手指一按就往目标方向挪的用户会被 `touchStartThreshold` 判成
   * 「想滚动」而放弃起拖，表现为「怎么拖都没反应、继续拖就滚动页面」。
   * 传 0 的宿主必须同时把把手的 `touch-action` 关掉（`touch-none`），否则浏览器仍会把这次
   * 手势判成滚动并抢走它（连带 pointercancel 打断影像层的指针流）。
   *
   * 整行/整卡即把手的列表（侧栏乐谱列表、分组头）**不要传 0**：那里「按住拖动」与「滑动滚动」
   * 是同一根手指的同一个手势，去掉长按就会让列表滚不动。
   *
   * 若「按下即拖」的那一块**并不是**整行（宿主还想让行本体能滚），就用 `touchHandle`
   * 把触摸把手收进一个小元素：行本体照常滚动，只有那一小块 `touch-action: none`。
   */
  touchDelay?: number;
  /** 动画时长（ms），默认 200 */
  animation?: number;
  /**
   * 交换阈值（占目标尺寸的比例）。保持 Sortable 官方默认 1：指针进入目标即交换。
   * 不要调小（如 0.5）——那会给每个条目上下各留 25% 的「死区」（_getSwapDirection
   * 的正则判定带收缩到中间 50%），横向绕远拖回来悬停在条目顶部/底部时永远不触发交换，
   * 表现为「移回上一个 Item 的顶部却挤不下去」。
   */
  swapThreshold?: number;
  /**
   * 触摸端「长按 = 右键」（不给即关闭，见下）。
   *
   * 触屏没有右键，而卡片菜单（乐谱卡 / 和弦卡）只有 `contextmenu` 一个入口 —— 手机上本就没有
   * 打开它的手势。给出本项即由本组合式补上这一档：长按到点（与起拖同一时长，见
   * `DRAG_LONG_PRESS_DELAY`）时，在按下的那个元素上派发一个**合成 `contextmenu`**，
   * 宿主已有的容器级委托（按 `data-*` 反查目标 → 在坐标处打开）与菜单本身原样复用，
   * 本组合式不碰菜单实现。
   *
   * 手指随后开始移动（越过 `DRAG_ACTIVATE_THRESHOLD`）时调 `onDismiss`：拖拽接管了这次手势，
   * 刚弹出的菜单该收起来。**收起只有宿主做得到，且只该收自己那一个** —— 所以这里给回调而不是
   * 由平台代劳（全局关闭会把别人的浮层一起收掉）。
   *
   * 与起拖共用同一个长按时长是**有意**的：触屏上「按住」只可能表达一件事，菜单先弹出来、
   * 拖起来就收掉，比再引入一个更长的时间门槛更好猜。
   */
  longPressMenu?: {
    onDismiss: () => void;
  };
}
