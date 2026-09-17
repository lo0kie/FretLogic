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
import { useRafThrottle } from '@/platform/composables/useRafThrottle';
import { FORM_CONTROL_CONTEXT_KEY } from '@/platform/ui/form/formControlContext';
import { resolveComponentWidth } from '@/platform/utils/constants';

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

/**
 * 滑块定位：用 left/top（布局属性）而非 transform——transform 合成层在分数 DPR
 * （如 Windows 150% 缩放）下会对齐整数设备像素，与流内渲染的按钮/聚焦圈错位约半像素；
 * left/top 与按钮走同一渲染路径，任意缩放比下严格重合（元素极小，过渡时的重排开销可忽略）。
 * 拖动中优先渲染 dragPosition（逐帧跟手；横向无过渡，仅跨段跳变的宽度带过渡），
 * 松手后回落到测量位置并恢复类的 transition-all 过渡 */
const indicatorStyle = computed(() => {
  const drag = dragPosition.value;
  if (drag) {
    return {
      width: `${drag.width}px`,
      height: `${drag.height}px`,
      left: `${drag.x}px`,
      top: `${drag.y}px`,
      opacity: 1,
      // 拖动中要不要过渡，按「该量是逐帧量还是跨段跳变量」分流，两种量不能混为一谈：
      // - 逐帧量（两种形态的 x）：指针在哪它就在哪，逐帧重写，绝不能过渡——加了就变成拖在指针
      //   之后的滞后尾巴（这也是上一轮「不跟鼠标」的成因之一）；
      // - 跨段跳变量：取值只在换段那一刻离散跳变，帧与帧之间是常量，加过渡才平滑。
      //   tabbed 的宽度正属此类（宽度取「指针所指那一段」的宽，跨段时 72px ↔ 48px 跳变），
      //   故拖动中给 width 加过渡：下划线是「变宽 / 变窄」过去，而不是瞬间换一根长度。
      //   其余两项无需列入：tabbed 的高/纵是常量（贴底等厚细线），pill 的宽/高/纵沿用原过渡。
      transition:
        visualVariant.value === 'tabbed'
          ? 'width 200ms ease-out'
          : 'width 200ms ease-out, height 200ms ease-out, top 200ms ease-out',
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
// 横向锚点按形态分流：pill = 抓取偏移搬运，tabbed = 以指针为几何中心（理由与钳制范围见 applyDragMove）
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
/** 选项完整几何（padding-box 局部坐标）：一次测量同时供落点判定（left/right）与预览滑块贴合（width/height/top） */
interface DragItemRect {
  left: number;
  right: number;
  width: number;
  height: number;
  top: number;
  index: number;
}

/** 拖动激活时缓存的选项区间（已跳过测量缺失项），供落点判定 hitDragIndex 使用 */
let dragItemRects: DragItemRect[] = [];
/** 同上但按**选项下标**稠密存放（缺失项为 undefined）：hitDragIndex 返回的是选项下标，
 *  用它索引上面那个已过滤的数组在有缺失项时会整体错位；滑块几何贴合一律走本数组 */
let dragRectByIndex: (DragItemRect | undefined)[] = [];
/** 拖动激活时测量的容器左右内边距（分数级）：仅在选项段实测失败（dragItemRects 为空）时，
 *  作为滑块横向钳制范围的兜底；正常一律取实测选项段的首/末边界（见 applyDragMove） */
let dragPadding = { left: 0, right: 0 };
/** 拖动激活时测量的容器边框（分数级）：滑块 left/top 是 absolute 的 padding-box 定位基准，
 *  选项/指针的 border-box 坐标须扣除边框才与滑块同系——否则错开一个边框宽（滑块「超出一点点」的根因） */
let dragInset = { left: 0, top: 0, right: 0 };
/** 拖动激活时记录的抓取偏移（指针相对滑块左缘，padding-box 坐标）：**仅 pill 形态使用**，
 *  拖动中 x = 指针 − 偏移，与宽度过渡完全解耦——若按「指针居中于滑块」随目标宽度重算 x，
 *  宽度渐变期间左右缘会先跳后滑（悬停在选项边界抖动时即抽动）；抓取偏移让 x 连续、宽度独立渐变。
 *  tabbed 下划线不用它：下划线宽度最大可达整段，用抓取偏移会让末尾的 tab 永远够不到——
 *  x = 指针 − 偏移 会先撞上 maxX 钳位，指针继续走而下划线停住（即「拖不动」）。
 *  tabbed 一律以指针为几何中心，见 applyDragMove 的 targetX */
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

/** 拖动跟手的一帧计算：处在本帧最后一次指针位置上的落点判定、预览高亮与滑块几何 */
const applyDragMove = (clientX: number) => {
  if (dragStartX === null) return;
  const container = containerRef.value;
  if (!container) return;

  if (!isDragging.value) {
    if (Math.abs(clientX - dragStartX) < DRAG_THRESHOLD_PX) return;
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
    dragGrabOffset = clientX - rect.left - dragInset.left - indicatorPosition.value.x;
    dragRectByIndex = items.value.map((raw, index) => {
      const item = toEl(raw);
      if (!item) return undefined;
      const r = item.getBoundingClientRect();
      return {
        left: r.left - rect.left - dragInset.left,
        right: r.right - rect.left - dragInset.left,
        width: r.width,
        height: r.height,
        top: r.top - rect.top - dragInset.top,
        index,
      };
    });
    dragItemRects = dragRectByIndex.filter((v): v is DragItemRect => v !== undefined);
    isDragging.value = true;
    transitionEnabled.value = false;
  }

  const rect = container.getBoundingClientRect();
  // 统一到滑块的 padding-box 坐标系：指针的 border-box 坐标扣除左边框
  const localX = clientX - rect.left - dragInset.left;
  // 落点判定：hoverIdx 是「指针所在选项」（禁用项也照常命中，是否可落定另行判定）
  const hoverIdx = hitDragIndex(localX);
  const disabledHover = hoverIdx >= 0 && Boolean(normalizedOptions.value[hoverIdx]?.disabled);
  dragOverIndex.value = disabledHover ? -1 : hoverIdx;
  // 滑块几何贴合哪一段：
  // - pill：只贴合「可落定的选项」——禁用项/空白上无预览，滑块保持起始选中段快照；
  // - tabbed 下划线：宽度取「指针所在选项」（禁用段也照取）——下划线长度即它要落进去的那一段的宽度，
  //   指针停在某段中点时下划线与该段严丝合缝；贴着禁用段但不给高亮，正是「此处不可落定」的表达。
  const previewIdx = visualVariant.value === 'tabbed' ? hoverIdx : disabledHover ? -1 : hoverIdx;
  const preview = previewIdx >= 0 ? dragRectByIndex[previewIdx] : undefined;
  const geometry = preview ? resolveIndicatorGeometry(preview) : dragSnapshot;
  const width = geometry.width;
  const height = geometry.height;
  const top = geometry.y;
  // 横向落点（两种形态语义不同，勿混用）：
  // - pill 是「按住并搬运一块实体」：保留抓取偏移（按下的点相对滑块恒定），滑块就跟在指针后
  //   grabOffset 处平移，宽度渐变不会反过来把 x 推来推去；
  // - tabbed 是「下划线以指针为几何中心」：x = 指针 − 半宽，指针恒落在下划线中点。这条是**必须**的，
  //   不是手感偏好：下划线宽度最大可达整段，若改用抓取偏移（x = 指针 − 偏移），向右拖时 x 会先撞上
  //   maxX 钳位，此后指针继续走而下划线停住——末尾的 tab 永远够不到，正是「拖不动了」。
  //   以指针为中心时每一段都可达（把指针压到任一段中点即正中该段）；钳制边界取首个/末个选项段的
  //   实测左右缘（见下），与静止态同源，故钳位只会在「下划线已经到位」时生效，不会半路卡住。
  const targetX = visualVariant.value === 'tabbed' ? localX - width / 2 : localX - dragGrabOffset;
  // 横向可动范围取**实测选项段**的首/末边界，而不是容器自身的盒子。原因：选项按钮是
  // whitespace-nowrap + min-width:auto，而 tabbed（下划线 Tab）容器带档位宽度（未显式传 width 时
  // 默认 8rem），tab 数量/文字一长就把容器撑破——容器不裁剪、静止下划线也照实测位置画到容器之外。
  // 若仍按容器宽度算 maxX，滑块会被钳死在容器右缘以内：选中末段时静止位置在容器外，一按下就被
  // 拽回容器内，其后末尾几段永远够不到（就是「拖不动」「下划线跳回去」）。按选项实测边界算，则
  // 跟手范围与静止态同源。正常情形（选项段恰好铺满容器 padding-box，pill 的 p-1 亦然）两种取法等价。
  const stripLeft = dragItemRects[0]?.left;
  const stripRight = dragItemRects[dragItemRects.length - 1]?.right;
  // padding-box 可用宽度 = border-box 宽 - 两侧边框（仅在选项段测不到时作为钳制兜底）
  const paddingBoxWidth = rect.width - dragInset.left - dragInset.right;
  const minX = stripLeft ?? dragPadding.left;
  const maxX = Math.max(minX, (stripRight ?? paddingBoxWidth - dragPadding.right) - width);
  dragPosition.value = {
    width,
    height,
    y: top,
    x: Math.min(Math.max(targetX, minX), maxX),
  };
};

/**
 * 拖动跟手按帧合帧：pointermove 在高回报率指针（120Hz 以上）下一次移动可派发多帧次，
 * 而每次都要读容器 rect 并写 dragPosition（= 触发一次渲染）。合并到帧末只保留最后一次指针位置，
 * 滑块仍是一帧一动、跟手感不变，帧内多余的计算与渲染则被吃掉。
 */
const {
  schedule: scheduleDragFrame,
  flush: flushDragFrame,
  cancel: cancelDragFrame,
} = useRafThrottle<number>(applyDragMove);

const handleDragPointerMove = (e: PointerEvent) => {
  if (dragStartX === null) return;
  // preventDefault 只能在事件派发期间调用（延后到帧回调里等同于没调）：
  // 超阈值起同步抑制文本选中/原生手势，阈值内的微小移动维持原有「不干预」行为
  if (isDragging.value || Math.abs(e.clientX - dragStartX) >= DRAG_THRESHOLD_PX) e.preventDefault();
  scheduleDragFrame(e.clientX);
};

const handleDragPointerUp = (e: PointerEvent) => {
  // 先冲刷待处理帧：起手与松手落在同一帧时（快速拖拽），drag 的激活判定在那帧里，
  // 不冲刷会被当作未拖动而漏掉本次落点提交
  flushDragFrame();
  const wasDragging = isDragging.value;
  cleanupDragListeners();
  dragStartX = null;
  if (!wasDragging) return;

  const container = containerRef.value;
  // 与拖动期同一坐标系：指针的 border-box 坐标须扣掉左边框（见 applyDragMove 的 localX），
  // 否则胶囊形态（容器带 1px 边框）的落点判定会比跟手预览偏移一个边框宽
  const idx = container ? hitDragIndex(e.clientX - container.getBoundingClientRect().left - dragInset.left) : -1;
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
  cancelDragFrame();
  cancelPendingUpdate();
  if (resumeTransitionTimer) clearTimeout(resumeTransitionTimer);
  ro?.disconnect();
});
</script>
