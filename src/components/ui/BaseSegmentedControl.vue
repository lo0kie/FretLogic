<template>
  <div
    ref="containerRef"
    class="segmented-control relative inline-flex items-center box-border select-none"
    :class="controlClasses"
    :style="resolvedWidth ? { width: resolvedWidth } : undefined"
    role="radiogroup"
    aria-orientation="horizontal"
    :aria-disabled="disabled || undefined"
    :aria-label
    @keydown="handleKeydown"
  >
    <span
      v-if="showSlider"
      class="segmented-slider absolute left-0 top-0 rounded-full bg-tint-primary-88 border border-tint-primary-60 shadow-[0_1px_3px_rgba(var(--color-primary-rgb),0.12)] pointer-events-none z-0 box-border will-change-transform"
      :class="{ 'transition-all duration-200 ease-out': isInitialized }"
      :style="indicatorStyle"
      aria-hidden="true"
    />

    <template v-for="(opt, i) in normalizedOptions" :key="String(opt.value)">
      <button
        :ref="el => setItemRef(el, i)"
        v-wave="{ disabled: disabled || opt.disabled }"
        type="button"
        class="segmented-item relative z-20 font-bold text-text-muted rounded-full border-none bg-transparent shadow-none whitespace-nowrap inline-flex items-center justify-center self-stretch h-full transition-all duration-200 ease-out outline-none focus-visible:ring-2 focus-visible:ring-primary/70 leading-none enabled:cursor-pointer enabled:hover:text-text-title disabled:cursor-not-allowed disabled:opacity-40"
        :class="itemClasses(opt)"
        role="radio"
        :aria-checked="isSelected(opt.value)"
        :disabled="disabled || opt.disabled"
        :tabindex="getTabindex(opt, i)"
        @click="select(opt, i)"
      >
        <slot name="item-icon" :option="opt" :index="i" />
        <span class="segmented-item-label inline-flex items-center justify-center leading-none">{{ opt.label }}</span>
        <slot name="item-suffix" :option="opt" :index="i" />
      </button>
    </template>
  </div>
</template>

<script setup lang="ts" generic="T extends string | number | boolean, C extends boolean = false">
import { type FormComponentWidth, resolveComponentWidth } from '@/utils/core/constants';
import { computed, nextTick, onBeforeUnmount, onBeforeUpdate, onMounted, ref, useTemplateRef, watch } from 'vue';

export interface SegmentOption<T> {
  label: string;
  value: T;
  disabled?: boolean;
}

type OptionInput<T> = T | SegmentOption<T>;

const props = withDefaults(
  defineProps<{
    options: OptionInput<T>[];
    size?: 'sm' | 'md' | 'lg';
    variant?: 'pill' | 'text';
    disabled?: boolean;
    /** 可取消选中：开启后点击已选项会把 v-model 置为 undefined */
    closeable?: C;
    block?: boolean;
    width?: FormComponentWidth;
    ariaLabel?: string;
    /** 紧凑模式：缩小按钮左右内边距，默认 true */
    compacted?: boolean;
  }>(),
  {
    size: 'md',
    variant: 'pill',
    disabled: false,
    block: false,
    width: 'auto',
    compacted: false,
  }
);

const model = defineModel<C extends true ? T | undefined : T>({ required: true });
/** 内部读写别名：closeable 时模型允许 undefined，仅在别名处集中断言 */
const modelValue = computed({
  get: () => model.value as T | undefined,
  set: (v: T | undefined) => {
    model.value = v as C extends true ? T | undefined : T;
  },
});
/** 对外派发值类型收窄：把统一视图断言回对外泛型形态 */
const emitValue = (v: T | undefined): C extends true ? T | undefined : T => v as C extends true ? T | undefined : T;

const emit = defineEmits<{
  (e: 'change', value: C extends true ? T | undefined : T): void;
}>();

const containerRef = useTemplateRef<HTMLElement>('containerRef');
const items = ref<Array<HTMLElement | null>>([]);

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
const indicatorPosition = ref({ width: 0, height: 0, x: 0, y: 0, opacity: 0 });

const resolvedWidth = computed(() => (props.block ? '100%' : resolveComponentWidth(props.width)));
const isFullWidth = computed(() => props.block || resolvedWidth.value === '100%');

/** 某选项是否为当前选中值 */
const isSelected = (val: unknown) => Object.is(modelValue.value, val);

const SIZE_MAP: Record<'sm' | 'md' | 'lg', { wrapper: string; item: string; textItem: string }> = {
  sm: { wrapper: 'h-[1.6rem]', item: 'text-2xs px-2', textItem: 'px-2 py-1 text-2xs' },
  md: { wrapper: 'h-[1.9rem]', item: 'text-2xs px-3', textItem: 'px-2.5 py-1 text-xs' },
  lg: { wrapper: 'h-[2.3rem]', item: 'text-xs px-3', textItem: 'px-3 py-1.5 text-sm' },
};

/** 紧凑模式尺寸：进一步缩小按钮左右内边距（超紧凑） */
const COMPACTED_SIZE_MAP: Record<'sm' | 'md' | 'lg', { wrapper: string; item: string; textItem: string }> = {
  sm: { wrapper: 'h-[1.6rem]', item: 'text-2xs px-1', textItem: 'px-1 py-1 text-2xs' },
  md: { wrapper: 'h-[1.9rem]', item: 'text-2xs px-1.5', textItem: 'px-1.5 py-1 text-xs' },
  lg: { wrapper: 'h-[2.3rem]', item: 'text-xs px-1.5', textItem: 'px-1.5 py-1.5 text-sm' },
};

const sizeConfig = computed(() => (props.compacted ? COMPACTED_SIZE_MAP[props.size] : SIZE_MAP[props.size]));

const normalizedOptions = computed<SegmentOption<T>[]>(() =>
  props.options.map(o => {
    if (o !== null && typeof o === 'object' && 'value' in (o as object)) {
      return o as SegmentOption<T>;
    }
    return { label: String(o), value: o as T };
  })
);

const activeIndex = computed(() => normalizedOptions.value.findIndex(o => isSelected(o.value)));
const showSlider = computed(() => props.variant === 'pill' && activeIndex.value >= 0);

const firstFocusableIndex = computed(() => normalizedOptions.value.findIndex(o => !o.disabled && !props.disabled));

/** roving tabindex：无选中时首个可用项可聚焦，有选中时仅选中项可聚焦 */
const getTabindex = (opt: SegmentOption<T>, i: number): number => {
  if (props.disabled || opt.disabled) return -1;
  if (activeIndex.value >= 0) {
    return isSelected(opt.value) ? 0 : -1;
  }
  return i === firstFocusableIndex.value ? 0 : -1;
};

const indicatorStyle = computed(() => ({
  width: `${indicatorPosition.value.width}px`,
  height: `${indicatorPosition.value.height}px`,
  transform: `translate(${indicatorPosition.value.x}px, ${indicatorPosition.value.y}px)`,
  opacity: indicatorPosition.value.opacity,
}));

const controlClasses = computed(() => [
  sizeConfig.value.wrapper,
  props.variant === 'pill'
    ? 'bg-bg-body border border-border-light rounded-full p-1 gap-1 transition-opacity'
    : 'bg-transparent gap-xs',
  props.disabled ? 'opacity-50 cursor-not-allowed' : '',
  isFullWidth.value ? 'w-full' : '',
]);

/** 选项类名：按 variant（pill / text）与选中态拼装 */
const itemClasses = (opt: SegmentOption<T>): (string | Record<string, boolean>)[] => {
  const active = isSelected(opt.value);
  const isExpand = isFullWidth.value;

  if (props.variant === 'pill') {
    return [sizeConfig.value.item, active ? '!text-primary font-extrabold' : '', { 'flex-1': isExpand }];
  }
  // text variant
  return [
    sizeConfig.value.textItem,
    'rounded-lg font-medium',
    active
      ? 'text-primary font-semibold bg-primary/10'
      : 'text-text-muted enabled:hover:text-text-title enabled:hover:bg-bg-panel-hover/50',
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

/** 测量选中项位置并更新滑块指示器；无选中时隐藏 */
const updateIndicatorPosition = async () => {
  if (props.variant !== 'pill') return;
  await nextTick();

  if (activeIndex.value < 0) {
    indicatorPosition.value.opacity = 0;
    return;
  }

  const activeButton = toEl(items.value[activeIndex.value]);
  if (!activeButton || !containerRef.value) {
    return;
  }

  const { offsetLeft, offsetWidth, offsetTop, offsetHeight } = activeButton;
  if (offsetWidth === 0 && offsetHeight === 0) {
    return;
  }

  indicatorPosition.value = {
    width: offsetWidth,
    height: offsetHeight,
    x: offsetLeft,
    y: offsetTop,
    opacity: 1,
  };

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

// 监听值变化实时更新滑块位置
watch(
  () => modelValue.value,
  () => {
    updateIndicatorPosition();
  },
  { immediate: true }
);

// 同时观察容器与每个子项，使用 requestAnimationFrame 进行防抖合并
let resizeRafId: number | null = null;
let ro: ResizeObserver | null = null;

/** 用 rAF 合并同一帧内的多次尺寸变化，避免重复测量 */
const debouncedUpdate = () => {
  if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
  resizeRafId = requestAnimationFrame(() => {
    updateIndicatorPosition();
    resizeRafId = null;
  });
};

/** （重）建 ResizeObserver：观察容器与全部选项，尺寸变化时更新指示器 */
const observeItems = () => {
  if (typeof ResizeObserver === 'undefined') return;
  ro?.disconnect();
  ro = new ResizeObserver(() => debouncedUpdate());
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
  if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
  ro?.disconnect();
});
</script>
