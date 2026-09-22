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
      <!-- 项只需压过自己的滑块（z-0）→ z-content(1) 足够。**不要**改成 z-float：那是
           「面板内浮起元件」档（滑块把手 / 数值气泡 / 悬停操作按钮这类瞬时浮起件），
           而折叠面板的吸附头也用这一档 —— 本控件在 DOM 里位于折叠标题之后，同层时后出现的赢，
           分段控件就会盖住吸附中的折叠标题（DevPanel 的标题只有 z-panel，更是被恒定压住）。
           本控件是常驻在流内容，不占浮起档，层叠只在控件内部成立 -->
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
        data-focusable-outline
        class="segmented-item relative z-content inline-flex h-full items-center justify-center self-stretch bg-transparent leading-none font-bold whitespace-nowrap text-fg-muted shadow-none transition-all duration-200 ease-out outline-none enabled:cursor-pointer enabled:hover:text-fg-title disabled:cursor-not-allowed disabled:opacity-40"
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

<script
  setup
  generic="
    O extends SegmentOption<unknown> | string | number | boolean,
    C extends boolean = false,
    V = SegmentOptionValue<O>
  "
  lang="ts"
>
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
import { useSegmentedDrag } from '@/platform/ui/segmented/useSegmentedDrag';
import { resolveComponentWidth } from '@/platform/utils/constants';

import {
  COMPACTED_SIZE_MAP,
  DEFAULT_ICON_SIZES,
  resolveIndicatorGeometry as resolveIndicatorGeometryOf,
  SIZE_MAP,
  toEl,
} from './BaseSegmentedControl.logic';

import type { SegmentOption, SegmentOptionValue } from './segmentOption';
import type { ComponentSize } from '@/platform/types';
import type { FormControlContext } from '@/platform/ui/form/formControlContext';
import type { IconSizeValue, IconStrokeValue } from '@/platform/ui/icons/iconSizes';
import type { FormComponentWidth } from '@/platform/utils/constants';

/**
 * 绑值类型 V **只由选项推导**，不从 modelValue 反推：
 *
 * 用 NoInfer 挡住 modelValue 这一路推断的原因——closeable 下 modelValue 的形态是
 * `V | undefined`，若放任 TS 从它反推，调用方传 `undefined`（清空的初始态）会把 V 直接
 * 推成 `undefined`，选项携带的品数/枚举信息全被覆盖。挡掉之后 V 恒等于
 * SegmentOptionValue<O>：`3 | 4 | 5` 这类字面量联合不会被抹平成 number。
 */
const model = defineModel<NoInfer<C extends true ? V | undefined : V>>({ required: true });

const props = withDefaults(
  defineProps<{
    /** 选项数组：支持原始值（字符串/数字/布尔）或 SegmentOption 对象；
     *  元素类型 O 即绑值类型的推导来源（见 SegmentOptionValue）。声明为 readonly，
     *  便于直接传 `as const` 选项表 / 常量元组，无需调用方再拷贝一份可变数组 */
    options: readonly O[];
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
  (e: 'change', value: C extends true ? V | undefined : V): void;
}>();
/** 内部读写别名：closeable 时模型允许 undefined，仅在别名处集中断言 */
const modelValue = computed({
  get: () => model.value as V | undefined,
  set: (v: V | undefined) => {
    model.value = v as NoInfer<C extends true ? V | undefined : V>;
  },
});
/** 对外派发值类型收窄：把统一视图断言回对外泛型形态 */
const emitValue = (v: V | undefined): C extends true ? V | undefined : V => v as C extends true ? V | undefined : V;

const containerRef = useTemplateRef<HTMLElement>('containerRef');
const items = ref<(HTMLElement | null)[]>([]);

/** 收集选项 DOM（函数式 ref），供选中后聚焦与指示器测量使用 */
const setItemRef = (el: unknown, index: number) => {
  if (el) items.value[index] = toEl(el);
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

const isOptionIconOnly = (opt: SegmentOption<V>): boolean => Boolean(opt.icon && (opt.iconOnly ?? props.iconOnly));

/**
 * 归一化为对象选项：原始值补上 `label = String(value)`。
 * 形态判断与绑值类型都由运行时守卫后的断言承担——O 是调用方给的选项类型，
 * 编译器无从知道「O 里有 value」这件事（它只看得到约束 `SegmentOption<unknown> | 原始值`），
 * 故此处断言；O 与 V 的同源关系由 SegmentOptionValue 在类型层保证。
 */
const normalizedOptions = computed<SegmentOption<V>[]>(() =>
  props.options.map(o => {
    if (o !== null && typeof o === 'object' && 'value' in (o as object)) return o as unknown as SegmentOption<V>;

    return { label: String(o), value: o as unknown as V };
  })
);

const activeIndex = computed(() => normalizedOptions.value.findIndex(o => isSelected(o.value)));
/** 生效视觉形态：tabbed 属性优先于 variant（tabbed 即第三种「下划线」形态） */
const visualVariant = computed<'pill' | 'text' | 'tabbed'>(() => (props.tabbed ? 'tabbed' : props.variant));
/** 需要滑动指示器：pill 与 tabbed 两种形态携带指示器；整体禁用时不显示指示器 */
const showSlider = computed(() => !props.disabled && visualVariant.value !== 'text' && activeIndex.value >= 0);

const firstFocusableIndex = computed(() => normalizedOptions.value.findIndex(o => !o.disabled && !props.disabled));

/** roving tabindex：无选中时首个可用项可聚焦，有选中时仅选中项可聚焦 */
const getTabindex = (opt: SegmentOption<V>, i: number): number => {
  if (props.disabled || opt.disabled) return -1;
  if (activeIndex.value >= 0) return isSelected(opt.value) ? 0 : -1;

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
  if (drag)
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
const itemClasses = (opt: SegmentOption<V>, index: number): (string | Record<string, boolean>)[] => {
  const dragHover = isDragging.value && dragOverIndex.value === index && !opt.disabled;
  const active = dragHover || (!props.disabled && isSelected(opt.value));
  // 容器有显式宽度（档位 / block / 自定义值）即让选项均分拉伸铺满；仅 auto（内容自适应）不拉伸
  const isExpand = resolvedWidth.value !== undefined;

  if (visualVariant.value === 'pill')
    return [
      sizeConfig.value.item,
      'rounded-full',
      // 未选中段 hover 提亮底色做「悬浮胶囊」预览；选中段 hover 取更深一档的主色底
      // （tint-primary-82 即原「tint-primary-80 以 70% 压在滑块 tint-primary-88 上」的实色等效值，
      //   逐通道差 ≤2；改实色后不再随叠层底色漂移）
      active
        ? 'text-primary! font-extrabold enabled:hover:bg-tint-primary-82'
        : 'enabled:hover:bg-surface-panel-subtle',
      { 'flex-1': isExpand },
    ];

  if (visualVariant.value === 'tabbed')
    // 下划线 Tab：无填充底，仅选中项加主色文字强调
    // 底边框贯穿线由容器 border-b 提供（showInactiveBorder 时），激活主色线由滑块叠加其上，
    // 故此处 tab 自身不再单独加边框（否则会与容器线重叠成双线）
    return [sizeConfig.value.item, active ? 'text-primary! font-extrabold' : '', { 'flex-1': isExpand }];

  // text variant
  return [
    sizeConfig.value.textItem,
    'rounded-lg font-medium',
    active
      ? 'text-primary font-semibold bg-tint-primary-90'
      : 'text-fg-muted enabled:hover:text-fg-title enabled:hover:bg-surface-panel-subtle',
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
  if (!activeButton || !containerRef.value) return;

  const container = containerRef.value;
  const containerRect = container.getBoundingClientRect();
  const buttonRect = activeButton.getBoundingClientRect();
  if (containerRect.width === 0 && containerRect.height === 0 && buttonRect.width === 0 && buttonRect.height === 0)
    return;

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
  if (width === 0 && height === 0) return;

  // 几何按生效形态换算：pill 取整段，tabbed 取贴段底部的主色细线（见 resolveIndicatorGeometry）
  const geometry = resolveIndicatorGeometry({ width, height, top: y });
  indicatorPosition.value = { ...geometry, x, opacity: 1 };

  if (!isInitialized.value)
    requestAnimationFrame(() => {
      isInitialized.value = true;
    });
};

/** 选中选项：closeable 时再点已选项取消选中；随后聚焦并更新指示器 */
const select = async (opt: SegmentOption<V>, index: number) => {
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

// ─── 拖动滑块切换：生命周期（按下判定 / 帧合帧跟手 / 落点提交 / 补发 click 抑制）抽离至 useSegmentedDrag ───
// 指示器测量（updateIndicatorPosition）与选中提交（model 写回 + change 派发）留在本组件
const { isDragging, dragPosition, dragOverIndex, handlePointerDown, handleClickCapture } = useSegmentedDrag({
  containerRef,
  items,
  toEl,
  visualVariant: () => visualVariant.value,
  showSlider: () => showSlider.value,
  activeIndex: () => activeIndex.value,
  isDisabled: () => props.disabled,
  isDraggable: () => props.draggable,
  options: () => normalizedOptions.value,
  indicatorPosition,
  transitionEnabled,
  isSelected,
  commitSelect: value => {
    modelValue.value = value as V;
    emit('change', emitValue(value as V));
  },
  focusItem: index => {
    items.value[index]?.focus();
  },
  remeasure: () => updateIndicatorPosition(),
  resolveIndicatorGeometry,
});

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
  cancelPendingUpdate();
  if (resumeTransitionTimer) clearTimeout(resumeTransitionTimer);
  ro?.disconnect();
});
</script>
