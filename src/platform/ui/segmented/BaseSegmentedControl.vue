<template>
  <div
    :aria-label
    :aria-disabled="disabled || undefined"
    :class="controlClasses"
    :style="resolvedWidth ? { width: resolvedWidth } : undefined"
    @click.capture="handleClickCapture($event)"
    @keydown="handleKeydown($event)"
    @pointerdown="handlePointerDown($event)"
    aria-orientation="horizontal"
    class="segmented-control relative inline-flex items-center select-none"
    ref="containerRef"
    role="radiogroup"
  >
    <span
      v-if="showSlider"
      :class="[...sliderClasses, { 'transition-all duration-200 ease-out': isInitialized && transitionEnabled }]"
      :style="indicatorStyle"
      aria-hidden="true"
      class="segmented-slider"
    />

    <template v-for="(opt, i) in normalizedOptions" :key="String(opt.value)">
      <button
        v-wave="{ disabled: disabled || opt.disabled }"
        :aria-checked="isSelected(opt.value)"
        :aria-label="isOptionIconOnly(opt) ? opt.label : undefined"
        :class="itemClasses(opt, i)"
        :disabled="disabled || opt.disabled"
        :ref="el => setItemRef(el, i)"
        :tabindex="getTabindex(opt, i)"
        :title="opt.label"
        @click="select(opt, i)"
        class="segmented-item relative z-float inline-flex h-full items-center justify-center self-stretch bg-transparent leading-none font-bold whitespace-nowrap text-fg-muted shadow-none transition-all duration-200 ease-out outline-none focus-visible:ring-2 focus-visible:ring-primary/70 enabled:cursor-pointer enabled:hover:text-fg-title disabled:cursor-not-allowed disabled:opacity-40"
        role="radio"
        type="button"
      >
        <slot :index="i" :option="opt" name="item-icon">
          <BaseIcon
            v-if="opt.icon"
            :class="{ 'mr-1.5': !isOptionIconOnly(opt) && opt.label }"
            :icon-size="resolvedIconSize"
            :icon-stroke="opt.iconStroke ?? iconStroke"
            :name="opt.icon"
            class="shrink-0"
          />
        </slot>
        <span
          v-if="!isOptionIconOnly(opt)"
          class="segmented-item-label inline-flex items-center justify-center leading-none"
          >{{ opt.label }}</span
        >
        <slot :index="i" :option="opt" name="item-suffix" />
      </button>
    </template>
  </div>
</template>

<script setup generic="T extends string | number | boolean, C extends boolean = false" lang="ts">
import {
  computed,
  inject,
  nextTick,
  onBeforeUnmount,
  onBeforeUpdate,
  onMounted,
  ref,
  useTemplateRef,
  watch,
} from 'vue';

import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import { FORM_CONTROL_CONTEXT_KEY } from '@/platform/ui/form/formControlContext';
import { resolveComponentWidth } from '@/platform/utils/constants';
import { useRafThrottle } from '@/platform/utils/useRafThrottle';

import {
  COMPACTED_SIZE_MAP,
  DEFAULT_ICON_SIZES,
  hitDragIndexOf as hitDragIndexPure,
  resolveIndicatorGeometry as resolveIndicatorGeometryOf,
  SIZE_MAP,
  toEl,
} from './BaseSegmentedControl.logic';

import type { ComponentSize } from '@/platform/types';
import type { FormControlContext } from '@/platform/ui/form/formControlContext';
import type { IconName } from '@/platform/ui/icons/icons.registry';
import type { IconSizeValue, IconStrokeValue } from '@/platform/ui/icons/iconSizes';
import type { FormComponentWidth } from '@/platform/utils/constants';

export interface SegmentOption<T> {
  label: string;
  value: T;
  disabled?: boolean;
  /** 可选图标名称 */
  icon?: IconName;
  /** 单选项是否仅展示图标（此时隐藏文字，保留 aria-label 与 title） */
  iconOnly?: boolean;
  /** 单选项图标描边粗细（优先级高于组件级 iconStroke） */
  iconStroke?: IconStrokeValue;
  /** 选项附带数量角标（如分组条目数），组件不消费，仅透传给 item-suffix 插槽供调用方渲染 */
  count?: number;
}

type OptionInput<T> = T | SegmentOption<T>;

const model = defineModel<C extends true ? T | undefined : T>({ required: true });

const props = withDefaults(
  defineProps<{
    /** 选项数组：支持原始值（字符串/数字等）或 SegmentOption 对象 */
    options: OptionInput<T>[];
    /** 尺寸档位：sm/md/lg */
    size?: ComponentSize;
    /** 视觉形态：pill 胶囊底板 / text 纯文字 */
    variant?: 'pill' | 'text';
    /** 下划线 Tab 形态：等价于 variant 的第三种视觉——无外框，选中项底部一条滑动主色下划线（浏览器标签风格）。
     *  与 variant 互斥优先级：tabbed=true 时覆盖 variant */
    tabbed?: boolean;
    /** 禁用交互并置灰（整组不可点击） */
    disabled?: boolean;
    /** 全局仅显示图标模式：若为 true 且选项配置了 icon，则隐藏 label 文本（保留 title / aria-label） */
    iconOnly?: boolean;
    /** 自定义图标尺寸，默认跟随尺寸档位（sm -> 'xs' / md -> 'sm' / lg -> 'md'） */
    iconSize?: IconSizeValue;
    /** 自定义图标描边粗细，默认 regular（与系统全局 ActionButton / BaseCheckbox 图标粗细对齐） */
    iconStroke?: IconStrokeValue;
    /** 可取消选中：开启后点击已选项会把 v-model 置为 undefined */
    closeable?: C;
    /** 是否撑满父容器宽度 */
    block?: boolean;
    /** 宽度：预设档位（sm/md/lg/xl/auto/full）或具体 CSS 宽度值，默认 md */
    width?: FormComponentWidth;
    /** 根容器 radiogroup 的无障碍标签 */
    ariaLabel?: string;
    /** 紧凑模式：缩小按钮左右内边距，默认 true */
    compacted?: boolean;
    /** 通高拉伸：根容器高度用 h-full 取代尺寸档固定高度（需父容器有确定高度），
     *  配合 tabbed 可做整条撑满父容器的 Tab栏，指示器/文字自动随高度适配 */
    fullHeight?: boolean;
    /** 在 tabbed 形态下，始终为每个未激活 tab 显示底部边框（浅色分隔线）；
     *  激活项以透明占位保留 2px 高度、露出主色下划线。默认 false（仅激活项有下划线）。
     *  与 pill/text 形态无关，非 tabbed 下忽略 */
    showInactiveBorder?: boolean;
    /** 是否启用拖动滑块切换（默认 true）：仅「激活块（滑块所在段）」按下才进入拖动——
     *  按住横向跟手、松手落定到指针所在选项；其他段按下仍走普通点击，避免横向滑过误切选项 */
    draggable?: boolean;
  }>(),
  {
    size: undefined,
    variant: 'pill',
    tabbed: false,
    disabled: false,
    iconOnly: false,
    iconStroke: 'regular',
    block: false,
    width: 'md',
    compacted: false,
    fullHeight: false,
    showInactiveBorder: false,
    draggable: true,
  }
);

const emit = defineEmits<{
  (e: 'change', value: C extends true ? T | undefined : T): void;
}>();
/** 内部读写别名：closeable 时模型允许 undefined，仅在别名处集中断言 */
const modelValue = computed({
  get: () => model.value as T | undefined,
  set: (v: T | undefined) => {
    model.value = v as C extends true ? T | undefined : T;
  },
});
/** 对外派发值类型收窄：把统一视图断言回对外泛型形态 */
const emitValue = (v: T | undefined): C extends true ? T | undefined : T => v as C extends true ? T | undefined : T;

const containerRef = useTemplateRef<HTMLElement>('containerRef');
const items = ref<(HTMLElement | null)[]>([]);

/** 收集选项 DOM（函数式 ref），供选中后聚焦与指示器测量使用 */
const setItemRef = (el: unknown, index: number) => {
  if (el) {
    items.value[index] = toEl(el);
  }
};

onBeforeUpdate(() => {
  items.value = [];
});

// 首次渲染无动画，后续移动带平滑缓动
const isInitialized = ref(false);
/**
 * 指示器过渡开关：缩放/布局连续变化期间暂停（每帧重测量若仍带 200ms 缓动，
 * 滑块会持续追赶新位置 → 视觉抖动），静止后恢复，选中切换的平滑动画不受影响
 */
const transitionEnabled = ref(false);
const indicatorPosition = ref({ width: 0, height: 0, x: 0, y: 0, opacity: 0 });

const resolvedWidth = computed(() => (props.block ? '100%' : resolveComponentWidth(props.width)));
const isFullWidth = computed(() => props.block || resolvedWidth.value === '100%');

/** 某选项是否为当前选中值 */
const isSelected = (val: unknown) => Object.is(modelValue.value, val);

// 尺寸解析：行内 props > BaseForm 注入上下文 > 默认 md
const controlContext = inject<FormControlContext | null>(FORM_CONTROL_CONTEXT_KEY, null);
const resolvedSize = computed<ComponentSize>(() => props.size ?? controlContext?.size ?? 'md');

const sizeConfig = computed(() =>
  props.compacted ? COMPACTED_SIZE_MAP[resolvedSize.value] : SIZE_MAP[resolvedSize.value]
);

const resolvedIconSize = computed(() => props.iconSize ?? DEFAULT_ICON_SIZES[resolvedSize.value]);

const isOptionIconOnly = (opt: SegmentOption<T>): boolean => Boolean(opt.icon && (opt.iconOnly ?? props.iconOnly));

const normalizedOptions = computed<SegmentOption<T>[]>(() =>
  props.options.map(o => {
    if (o !== null && typeof o === 'object' && 'value' in (o as object)) {
      return o as SegmentOption<T>;
    }
    return { label: String(o), value: o as T };
  })
);

const activeIndex = computed(() => normalizedOptions.value.findIndex(o => isSelected(o.value)));
/** 生效视觉形态：tabbed 属性优先于 variant（tabbed 即第三种「下划线」形态） */
const visualVariant = computed<'pill' | 'text' | 'tabbed'>(() => (props.tabbed ? 'tabbed' : props.variant));
/** 需要滑动指示器：pill 与 tabbed 两种形态携带指示器；整体禁用时不显示指示器 */
const showSlider = computed(() => !props.disabled && visualVariant.value !== 'text' && activeIndex.value >= 0);

const firstFocusableIndex = computed(() => normalizedOptions.value.findIndex(o => !o.disabled && !props.disabled));

/** roving tabindex：无选中时首个可用项可聚焦，有选中时仅选中项可聚焦 */
const getTabindex = (opt: SegmentOption<T>, i: number): number => {
  if (props.disabled || opt.disabled) return -1;
  if (activeIndex.value >= 0) {
    return isSelected(opt.value) ? 0 : -1;
  }
  return i === firstFocusableIndex.value ? 0 : -1;
};

/** 滑块定位：用 left/top（布局属性）而非 transform——transform 合成层在分数 DPR
 * （如 Windows 150% 缩放）下会对齐整数设备像素，与流内渲染的按钮/聚焦圈错位约半像素；
 * left/top 与按钮走同一渲染路径，任意缩放比下严格重合（元素极小，过渡时的重排开销可忽略）。
 * 拖动中优先渲染 dragPosition（跟手位置，无过渡），松手后回落到测量位置并恢复过渡 */
const indicatorStyle = computed(() => {
  const drag = dragPosition.value;
  if (drag) {
    return {
      width: `${drag.width}px`,
      height: `${drag.height}px`,
      left: `${drag.x}px`,
      top: `${drag.y}px`,
      opacity: 1,
      // 位置（left）逐帧跟手不加过渡；几何（宽/高/纵）变化过渡平滑贴合预览项
      transition: 'width 200ms ease-out, height 200ms ease-out, top 200ms ease-out',
    };
  }
  return {
    width: `${indicatorPosition.value.width}px`,
    height: `${indicatorPosition.value.height}px`,
    left: `${indicatorPosition.value.x}px`,
    top: `${indicatorPosition.value.y}px`,
    opacity: indicatorPosition.value.opacity,
    // 回落非拖动态：清掉拖动期的几何过渡，交还给类的 transition-all（贴合/弹回动画）
    transition: undefined,
  };
});

const controlClasses = computed(() => [
  props.fullHeight ? 'h-full' : sizeConfig.value.wrapper,
  visualVariant.value === 'pill'
    ? 'bg-surface-body border border-border-light rounded-full p-1 gap-1 transition-opacity'
    : visualVariant.value === 'tabbed' && props.showInactiveBorder
      ? 'bg-transparent gap-xs border-b-2 border-border-light' // 容器级贯穿底线：保留 tab 间距，激活主色线叠加其上
      : 'bg-transparent gap-xs',
  props.disabled ? 'opacity-50 cursor-not-allowed' : '',
  isFullWidth.value ? 'w-full' : '',
  // 横向拖动由组件消费（拖动滑块切换），纵向滚动仍交还页面
  'touch-pan-y',
]);

/** 滑块外观：pill 为覆盖整段的圆角胶囊（浅主色底 + 描边），tabbed 为贴底主色下划线 */
const sliderClasses = computed(() => [
  'segmented-slider pointer-events-none absolute top-0 left-0 z-0',
  visualVariant.value === 'tabbed'
    ? 'bg-primary'
    : 'bg-tint-primary-88 border-tint-primary-60 rounded-full border shadow-[0_1px_3px_rgba(var(--color-primary-rgb),0.12)]',
]);

/** 下划线高度与滑块几何换算：见 BaseSegmentedControl.logic.ts */
const resolveIndicatorGeometry = (item: { width: number; height: number; top: number }) =>
  resolveIndicatorGeometryOf(item, visualVariant.value, props.showInactiveBorder);

/** 选项类名：按生效形态（pill / text / tabbed）与选中态拼装（整体禁用时不显示激活样式）；
 *  拖动滑块经过的可用选项以选中态文字色做落点预览高亮 */
const itemClasses = (opt: SegmentOption<T>, index: number): (string | Record<string, boolean>)[] => {
  const dragHover = isDragging.value && dragOverIndex.value === index && !opt.disabled;
  const active = dragHover || (!props.disabled && isSelected(opt.value));
  // 容器有显式宽度（档位 / block / 自定义值）即让选项均分拉伸铺满；仅 auto（内容自适应）不拉伸
  const isExpand = resolvedWidth.value !== undefined;

  if (visualVariant.value === 'pill') {
    return [
      sizeConfig.value.item,
      'rounded-full',
      active ? 'text-primary! font-extrabold' : '',
      { 'flex-1': isExpand },
    ];
  }
  if (visualVariant.value === 'tabbed') {
    // 下划线 Tab：无填充底，仅选中项加主色文字强调
    // 底边框贯穿线由容器 border-b 提供（showInactiveBorder 时），激活主色线由滑块叠加其上，
    // 故此处 tab 自身不再单独加边框（否则会与容器线重叠成双线）
    return [sizeConfig.value.item, active ? 'text-primary! font-extrabold' : '', { 'flex-1': isExpand }];
  }
  // text variant
  return [
    sizeConfig.value.textItem,
    'rounded-lg font-medium',
    active
      ? 'text-primary font-semibold bg-primary/10'
      : 'text-fg-muted enabled:hover:text-fg-title enabled:hover:bg-surface-panel-hover/50',
    { 'flex-1': isExpand },
  ];
};

// 兼容组件实例（$el）与原生元素（el）的解包逻辑见 BaseSegmentedControl.logic.ts

/** 测量选中项位置并更新滑块指示器；无选中时隐藏。
 *  animate=false（ResizeObserver 路径）时暂停过渡直接贴合，避免连续布局变化下的缓动追赶抖动 */
const updateIndicatorPosition = async (animate = true) => {
  transitionEnabled.value = animate;
  if (visualVariant.value === 'text') return;
  await nextTick();

  if (props.disabled || activeIndex.value < 0) {
    indicatorPosition.value.opacity = 0;
    return;
  }

  const activeButton = toEl(items.value[activeIndex.value]);
  if (!activeButton || !containerRef.value) {
    return;
  }

  const container = containerRef.value;
  const containerRect = container.getBoundingClientRect();
  const buttonRect = activeButton.getBoundingClientRect();
  if (containerRect.width === 0 && containerRect.height === 0 && buttonRect.width === 0 && buttonRect.height === 0) {
    return;
  }

  // 双路测量：祖先存在 scale 动画时（BaseModal / BasePopover 进场），rect 含祖先缩放而失真，
  // 回退为「rect 差值 ÷ 缩放比」还原布局坐标——滑块与按钮同源布局坐标，缩放全程自洽，
  // 动画结束（scale→1）无需重测也不会偏移；缩放比≈1 的正常态直接用 rect 分数级测量，
  // 消除页面缩放下 offset 整数舍入导致的滑块边缘错位闪烁。两式在 scale=1 时严格等价，
  // 缩放判定偶有误差也不会引入可见错位
  const scaleX = containerRect.width / container.offsetWidth;
  const scaleY = containerRect.height / container.offsetHeight;
  const ancestorScaled = Math.abs(scaleX - 1) > 0.005 || Math.abs(scaleY - 1) > 0.005;

  // 边框补偿必须用 computed 的分数级边框宽度：clientTop/clientLeft 返回四舍五入整数，
  // 分数 DPR（如 150% 缩放下 1px 边框实为 0.667 CSS px）时会引入 ~0.3px 的定位误差
  const containerStyle = getComputedStyle(container);
  const borderWidthX = parseFloat(containerStyle.borderLeftWidth) || 0;
  const borderWidthY = parseFloat(containerStyle.borderTopWidth) || 0;

  const x = ancestorScaled
    ? (buttonRect.left - containerRect.left) / scaleX - borderWidthX
    : buttonRect.left - containerRect.left - borderWidthX;
  const y = ancestorScaled
    ? (buttonRect.top - containerRect.top) / scaleY - borderWidthY
    : buttonRect.top - containerRect.top - borderWidthY;
  const width = ancestorScaled ? activeButton.offsetWidth : buttonRect.width;
  const height = ancestorScaled ? activeButton.offsetHeight : buttonRect.height;
  if (width === 0 && height === 0) {
    return;
  }

  // 几何按生效形态换算：pill 取整段，tabbed 取贴段底部的主色细线（见 resolveIndicatorGeometry）
  const geometry = resolveIndicatorGeometry({ width, height, top: y });
  indicatorPosition.value = { ...geometry, x, opacity: 1 };

  if (!isInitialized.value) {
    requestAnimationFrame(() => {
      isInitialized.value = true;
    });
  }
};

/** 选中选项：closeable 时再点已选项取消选中；随后聚焦并更新指示器 */
const select = async (opt: SegmentOption<T>, index: number) => {
  if (props.disabled || opt.disabled) return;
  if (isSelected(opt.value)) {
    if (props.closeable) {
      modelValue.value = undefined;
      emit('change', emitValue(undefined));
      await nextTick();
      updateIndicatorPosition();
      items.value[index]?.focus();
    }
    return;
  }
  modelValue.value = opt.value;
  emit('change', emitValue(opt.value));
  await nextTick();
  updateIndicatorPosition();
  items.value[index]?.focus();
};

/** 方向键在可用选项间循环移动并选中 */
const handleKeydown = (e: KeyboardEvent) => {
  if (props.disabled) return;
  const opts = normalizedOptions.value;
  if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return;
  e.preventDefault();
  const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown';
  const curIdx = activeIndex.value < 0 ? 0 : activeIndex.value;
  const len = opts.length;
  for (let k = 1; k <= len; k++) {
    const idx = forward ? (curIdx + k) % len : (curIdx - k + len) % len;
    const opt = opts[idx];
    if (opt && !opt.disabled) {
      select(opt, idx);
      return;
    }
  }
};

// ─── 拖动滑块切换：仅在激活块按下并拖动时滑块跟手，松手落定到指针所在选项 ───
// 位移超过阈值才算拖动（阈值内仍走原生 click 选择）；拖动期间暂停滑块过渡跟手移动、
// v-model 不变，松手才提交一次 change；落点在禁用项/空白时滑块弹回原选中项。
// 非激活块按下不进入拖动（见 handlePointerDown 的按下位置判定），仅响应点击选择。
const DRAG_THRESHOLD_PX = 4;
let dragStartX: number | null = null;
/** 拖动已激活（位移超阈值）：滑块脱离选项测量位置跟手移动 */
const isDragging = ref(false);
/** 拖动中滑块的实时位置（indicatorStyle 优先渲染此值）；null = 非拖动态 */
const dragPosition = ref<{ x: number; width: number; height: number; y: number } | null>(null);
/** 拖动中指针悬停的选项下标（落点预览高亮），-1 = 无 */
const dragOverIndex = ref(-1);
/** 拖动松手后浏览器会向起点按钮补发 click：抑制一次，防止落定选择被 click 的起点选择覆盖 */
let suppressClick = false;
/** 拖动激活时快照的滑块几何（尺寸/纵向位置保持选中段，仅横向跟手） */
let dragSnapshot = { width: 0, height: 0, y: 0 };
/** 拖动激活时缓存的选项完整几何（padding-box 局部坐标）：拖动期间布局不变，一次测量全程使用。
 *  供落点判定（left/right）与预览滑块贴合悬停项（width/height/top） */
let dragItemRects: { left: number; right: number; width: number; height: number; top: number; index: number }[] = [];
/** 拖动激活时测量的容器左右内边距（分数级）：滑块横向钳制在内边距内侧，
 *  与流内按钮的可达范围一致，不会拖到胶囊底板 padding 区之上 */
let dragPadding = { left: 0, right: 0 };
/** 拖动激活时测量的容器边框（分数级）：滑块 left/top 是 absolute 的 padding-box 定位基准，
 *  选项/指针的 border-box 坐标须扣除边框才与滑块同系——否则错开一个边框宽（滑块「超出一点点」的根因） */
let dragInset = { left: 0, top: 0, right: 0 };
/** 拖动激活时记录的抓取偏移（指针相对滑块左缘，padding-box 坐标）：拖动中 x = 指针 − 偏移，
 *  与宽度过渡完全解耦——若按「指针居中于滑块」随目标宽度重算 x，宽度渐变期间左右缘会
 *  先跳后滑（悬停在选项边界抖动时即抽动）；抓取偏移让 x 连续、宽度独立渐变 */
let dragGrabOffset = 0;

/** 落点判定（纯函数见 BaseSegmentedControl.logic.ts） */
const hitDragIndex = (localX: number): number => hitDragIndexPure(localX, dragItemRects);

const cleanupDragListeners = () => {
  window.removeEventListener('pointermove', handleDragPointerMove);
  window.removeEventListener('pointerup', handleDragPointerUp);
  window.removeEventListener('pointercancel', handleDragPointerUp);
};

const handlePointerDown = (e: PointerEvent) => {
  if (props.disabled || !props.draggable || e.button !== 0) return;
  // text 形态无滑块、无选中段时无从拖起
  if (visualVariant.value === 'text' || !showSlider.value) return;
  // 仅激活块（滑块覆盖的选中段，滑块本身 pointer-events-none 由底下的按钮承接事件）可发起拖动：
  // 其余段按下一律走原生 click 选择，横向滑过控件不会再被误判为拖动手势
  const activeButton = toEl(items.value[activeIndex.value]);
  if (!activeButton?.contains(e.target as Node)) return;
  dragStartX = e.clientX;
  window.addEventListener('pointermove', handleDragPointerMove);
  window.addEventListener('pointerup', handleDragPointerUp);
  window.addEventListener('pointercancel', handleDragPointerUp);
};

const handleDragPointerMove = (e: PointerEvent) => {
  if (dragStartX === null) return;
  const container = containerRef.value;
  if (!container) return;

  if (!isDragging.value) {
    if (Math.abs(e.clientX - dragStartX) < DRAG_THRESHOLD_PX) return;
    if (indicatorPosition.value.opacity === 0) return;
    // 激活拖动：快照当前滑块几何、缓存选项区间与容器内边距
    dragSnapshot = {
      width: indicatorPosition.value.width,
      height: indicatorPosition.value.height,
      y: indicatorPosition.value.y,
    };
    const rect = container.getBoundingClientRect();
    const containerStyle = getComputedStyle(container);
    // 分数级测量 padding 与 border（同指示器边框补偿策略）：选项/指针坐标统一换算到
    // 滑块 left/top 的 padding-box 基准，避免绝对定位滑块与测量值错开一个边框宽
    dragPadding = {
      left: parseFloat(containerStyle.paddingLeft) || 0,
      right: parseFloat(containerStyle.paddingRight) || 0,
    };
    dragInset = {
      left: parseFloat(containerStyle.borderLeftWidth) || 0,
      top: parseFloat(containerStyle.borderTopWidth) || 0,
      right: parseFloat(containerStyle.borderRightWidth) || 0,
    };
    // 抓取偏移：以激活时刻指针位置相对当前滑块左缘记录（若拖满整个拖动期不变，
    // 滑块随指针平移时保持抓取点相对位置自然），后续宽度伸缩不再反过来影响 x
    dragGrabOffset = e.clientX - rect.left - dragInset.left - indicatorPosition.value.x;
    dragItemRects = items.value
      .map((raw, index) => {
        const item = toEl(raw);
        if (!item) return null;
        const r = item.getBoundingClientRect();
        return {
          left: r.left - rect.left - dragInset.left,
          right: r.right - rect.left - dragInset.left,
          width: r.width,
          height: r.height,
          top: r.top - rect.top - dragInset.top,
          index,
        };
      })
      .filter(
        (v): v is { left: number; right: number; width: number; height: number; top: number; index: number } =>
          v !== null
      );
    isDragging.value = true;
    transitionEnabled.value = false;
  }

  e.preventDefault();
  const rect = container.getBoundingClientRect();
  // 统一到滑块的 padding-box 坐标系：指针的 border-box 坐标扣除左边框
  const localX = e.clientX - rect.left - dragInset.left;
  // 落点预览：禁用项不高亮、滑块也不贴合
  const hoverIdx = hitDragIndex(localX);
  const disabledHover = hoverIdx >= 0 && Boolean(normalizedOptions.value[hoverIdx]?.disabled);
  dragOverIndex.value = disabledHover ? -1 : hoverIdx;
  // 滑块几何贴合当前悬停的可用选项（pill：宽/高/纵随预览项变化，宽选项滑块变宽；
  // tabbed：高度恒为贴底细线，仅横向贴合）。无预览（禁用项上）时保持起始选中段快照。
  // x 以指针为中心跟手，钳制在 padding 范围内
  const preview = !disabledHover && hoverIdx >= 0 ? dragItemRects[hoverIdx] : undefined;
  const geometry = preview ? resolveIndicatorGeometry(preview) : dragSnapshot;
  const width = geometry.width;
  const height = geometry.height;
  const top = geometry.y;
  // padding-box 可用宽度 = border-box 宽 - 两侧边框；滑块右缘不得越过右 padding 内缘
  const paddingBoxWidth = rect.width - dragInset.left - dragInset.right;
  const minX = dragPadding.left;
  const maxX = Math.max(minX, paddingBoxWidth - dragPadding.right - width);
  dragPosition.value = {
    width,
    height,
    y: top,
    x: Math.min(Math.max(localX - dragGrabOffset, minX), maxX),
  };
};

const handleDragPointerUp = (e: PointerEvent) => {
  const wasDragging = isDragging.value;
  cleanupDragListeners();
  dragStartX = null;
  if (!wasDragging) return;

  const container = containerRef.value;
  const idx = container ? hitDragIndex(e.clientX - container.getBoundingClientRect().left) : -1;
  const target = idx >= 0 ? normalizedOptions.value[idx] : undefined;
  if (target && !target.disabled && !props.disabled && !isSelected(target.value)) {
    modelValue.value = target.value;
    emit('change', emitValue(target.value));
    items.value[idx]?.focus();
  }
  dragOverIndex.value = -1;
  dragPosition.value = null;
  isDragging.value = false;
  // 恢复过渡：滑块从跟手位置动画贴合到最终选中项（落定提交或弹回）
  transitionEnabled.value = true;
  void nextTick(() => updateIndicatorPosition());
  // 拖动手势吞掉浏览器可能补发的 click（down/up 同元素时 up 后会补发并触发 select，
  // 拖回原位松手会在 closeable 下误触取消选中）。
  // 兜底复位：拖出容器松手时 up 目标在组件外、click 不派发，flag 若不清除会吞掉
  // 用户下一次真实点击（第一次点击不生效的根因）——补发 click 事件任务先于 timer
  // 执行，先到则由 capture 处理器消耗，timer 仅清理未发生场景
  suppressClick = true;
  window.setTimeout(() => {
    suppressClick = false;
  }, 0);
};

/** 捕获阶段拦截拖动松手后浏览器补发的 click，吞掉一次防止触发起点选项的 select */
const handleClickCapture = (e: MouseEvent) => {
  if (!suppressClick) return;
  suppressClick = false;
  e.stopPropagation();
  e.preventDefault();
};

// 监听值与禁用状态变化实时更新滑块位置
watch(
  [() => modelValue.value, () => props.disabled],
  () => {
    updateIndicatorPosition();
  },
  { immediate: true }
);

// 同时观察容器与每个子项，使用 requestAnimationFrame 进行防抖合并
let ro: ResizeObserver | null = null;

/** 用 rAF 合并同一帧内的多次尺寸变化，避免重复测量（ResizeObserver 路径不带动画） */
const { schedule: debouncedUpdate, cancel: cancelPendingUpdate } = useRafThrottle(() => updateIndicatorPosition(false));

/** 布局静止多少毫秒后恢复指示器过渡 */
const RESUME_TRANSITION_DELAY_MS = 200;
let resumeTransitionTimer: ReturnType<typeof setTimeout> | null = null;

/** （重）建 ResizeObserver：观察容器与全部选项，尺寸变化时更新指示器 */
const observeItems = () => {
  if (typeof ResizeObserver === 'undefined') return;
  ro?.disconnect();
  ro = new ResizeObserver(() => {
    // 连续缩放/布局变化期间暂停过渡；最后一次变化静止后延迟恢复，
    // 恢复时位置与当前渲染一致，不会产生多余动画
    transitionEnabled.value = false;
    if (resumeTransitionTimer) clearTimeout(resumeTransitionTimer);
    resumeTransitionTimer = setTimeout(() => {
      resumeTransitionTimer = null;
      transitionEnabled.value = true;
    }, RESUME_TRANSITION_DELAY_MS);
    debouncedUpdate();
  });
  if (containerRef.value) ro.observe(containerRef.value);
  items.value.forEach(dom => {
    if (dom) ro!.observe(dom);
  });
  updateIndicatorPosition();
};

watch(normalizedOptions, async () => {
  await nextTick();
  observeItems();
  updateIndicatorPosition();
});

onMounted(async () => {
  await nextTick();
  observeItems();
  updateIndicatorPosition();
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready;
    await nextTick();
    updateIndicatorPosition();
  }
});

onBeforeUnmount(() => {
  cleanupDragListeners();
  cancelPendingUpdate();
  if (resumeTransitionTimer) clearTimeout(resumeTransitionTimer);
  ro?.disconnect();
});
</script>
