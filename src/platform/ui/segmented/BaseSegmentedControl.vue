<template>
  <div
    :aria-label
    :aria-disabled="disabled || undefined"
    :class="controlClasses"
    :style="resolvedWidth ? { width: resolvedWidth } : undefined"
    @keydown="handleKeydown($event)"
    aria-orientation="horizontal"
    class="segmented-control relative box-border inline-flex items-center select-none"
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
        :class="itemClasses(opt)"
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
import { computed, nextTick, onBeforeUnmount, onBeforeUpdate, onMounted, ref, useTemplateRef, watch } from 'vue';

import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import { CONTROL_HEIGHT_CLASSES } from '@/platform/ui/controlSizes';
import { resolveComponentWidth } from '@/platform/utils/constants';
import { useRafThrottle } from '@/platform/utils/useRafThrottle';

import type { ComponentSize } from '@/platform/types';
import type { IconName } from '@/platform/ui/icons/icons.registry';
import type { IconSizePreset, IconSizeValue, IconStrokeValue } from '@/platform/ui/icons/iconSizes';
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
    /** 宽度：auto / full 或具体 CSS 宽度值 */
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
  }>(),
  {
    size: 'md',
    variant: 'pill',
    tabbed: false,
    disabled: false,
    iconOnly: false,
    iconStroke: 'regular',
    block: false,
    width: 'auto',
    compacted: false,
    fullHeight: false,
    showInactiveBorder: false,
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

const SIZE_MAP: Record<'sm' | 'md' | 'lg', { wrapper: string; item: string; textItem: string }> = {
  sm: { wrapper: `${CONTROL_HEIGHT_CLASSES.sm}`, item: 'px-2 text-2xs', textItem: 'px-2 py-1 text-2xs' },
  md: { wrapper: `${CONTROL_HEIGHT_CLASSES.md}`, item: 'px-3 text-2xs', textItem: 'px-2.5 py-1 text-xs' },
  lg: { wrapper: `${CONTROL_HEIGHT_CLASSES.lg}`, item: 'px-3 text-xs', textItem: 'px-3 py-1.5 text-sm' },
};

/** 紧凑模式尺寸：进一步缩小按钮左右内边距（超紧凑） */
const COMPACTED_SIZE_MAP: Record<'sm' | 'md' | 'lg', { wrapper: string; item: string; textItem: string }> = {
  sm: { wrapper: `${CONTROL_HEIGHT_CLASSES.sm}`, item: 'px-1 text-2xs', textItem: 'px-1 py-1 text-2xs' },
  md: { wrapper: `${CONTROL_HEIGHT_CLASSES.md}`, item: 'px-1.5 text-2xs', textItem: 'px-1.5 py-1 text-xs' },
  lg: { wrapper: `${CONTROL_HEIGHT_CLASSES.lg}`, item: 'px-1.5 text-xs', textItem: 'px-1.5 py-1.5 text-sm' },
};

const sizeConfig = computed(() => (props.compacted ? COMPACTED_SIZE_MAP[props.size] : SIZE_MAP[props.size]));

const DEFAULT_ICON_SIZES: Record<'sm' | 'md' | 'lg', IconSizePreset> = {
  sm: 'sm',
  md: 'md',
  lg: 'xl',
};

const resolvedIconSize = computed(() => props.iconSize ?? DEFAULT_ICON_SIZES[props.size]);

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
 * left/top 与按钮走同一渲染路径，任意缩放比下严格重合（元素极小，过渡时的重排开销可忽略） */
const indicatorStyle = computed(() => ({
  width: `${indicatorPosition.value.width}px`,
  height: `${indicatorPosition.value.height}px`,
  left: `${indicatorPosition.value.x}px`,
  top: `${indicatorPosition.value.y}px`,
  opacity: indicatorPosition.value.opacity,
}));

const controlClasses = computed(() => [
  props.fullHeight ? 'h-full' : sizeConfig.value.wrapper,
  visualVariant.value === 'pill'
    ? 'bg-surface-body border border-border-light rounded-full p-1 gap-1 transition-opacity'
    : visualVariant.value === 'tabbed' && props.showInactiveBorder
      ? 'bg-transparent gap-xs border-b-2 border-border-light' // 容器级贯穿底线：保留 tab 间距，激活主色线叠加其上
      : 'bg-transparent gap-xs',
  props.disabled ? 'opacity-50 cursor-not-allowed' : '',
  isFullWidth.value ? 'w-full' : '',
]);

/** 滑块外观：pill 为覆盖整段的圆角胶囊（浅主色底 + 描边），tabbed 为贴底主色下划线 */
const sliderClasses = computed(() => [
  'segmented-slider pointer-events-none absolute top-0 left-0 z-0 box-border',
  visualVariant.value === 'tabbed'
    ? 'bg-primary'
    : 'bg-tint-primary-88 border-tint-primary-60 rounded-full border shadow-[0_1px_3px_rgba(var(--color-primary-rgb),0.12)]',
]);

/** 下划线高度（px）：tabbed 形态贴段底部的主色细线 */
const TAB_LINE_HEIGHT = 2;

/** 选项类名：按生效形态（pill / text / tabbed）与选中态拼装（整体禁用时不显示激活样式） */
const itemClasses = (opt: SegmentOption<T>): (string | Record<string, boolean>)[] => {
  const active = !props.disabled && isSelected(opt.value);
  const isExpand = isFullWidth.value;

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

// 兼容组件实例（$el）与原生元素（el）
const toEl = (raw: unknown): HTMLElement | null => {
  if (!raw) return null;
  if (raw instanceof HTMLElement) return raw;
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    if (r['$el'] instanceof HTMLElement) return r['$el'];
    if (r['el'] instanceof HTMLElement) return r['el'];
  }
  return null;
};

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
  // 回退到 transform 免疫的 offset 布局坐标；缩放比≈1 的正常态用 rect 分数级测量，
  // 消除页面缩放下 offset 整数舍入导致的滑块边缘错位闪烁
  const scaleX = containerRect.width / container.offsetWidth;
  const scaleY = containerRect.height / container.offsetHeight;
  const ancestorScaled = Math.abs(scaleX - 1) > 0.005 || Math.abs(scaleY - 1) > 0.005;

  // 边框补偿必须用 computed 的分数级边框宽度：clientTop/clientLeft 返回四舍五入整数，
  // 分数 DPR（如 150% 缩放下 1px 边框实为 0.667 CSS px）时会引入 ~0.3px 的定位误差
  const containerStyle = getComputedStyle(container);
  const borderWidthX = parseFloat(containerStyle.borderLeftWidth) || 0;
  const borderWidthY = parseFloat(containerStyle.borderTopWidth) || 0;

  const x = buttonRect.left - containerRect.left - borderWidthX;
  const y = buttonRect.top - containerRect.top - borderWidthY;
  const width = ancestorScaled ? activeButton.offsetWidth : buttonRect.width;
  const height = ancestorScaled ? activeButton.offsetHeight : buttonRect.height;
  if (width === 0 && height === 0) {
    return;
  }

  if (visualVariant.value === 'tabbed') {
    // 下划线形态：滑块是一条贴段底部的主色细线，宽度随选中段
    // 开启 showInactiveBorder 时，容器底部有 border-b 贯穿线（位于内容区下方 2px），
    // 滑块需下移到该 border 区与之重合，才能盖住浅色线、形成连续同厚的激活段
    const lineShift = props.showInactiveBorder ? TAB_LINE_HEIGHT : 0;
    indicatorPosition.value = {
      width,
      height: TAB_LINE_HEIGHT,
      x,
      y: y + height - TAB_LINE_HEIGHT + lineShift,
      opacity: 1,
    };
  } else {
    indicatorPosition.value = {
      width,
      height,
      x,
      y,
      opacity: 1,
    };
  }

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
