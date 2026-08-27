<template>
  <div
    v-if="texted"
    ref="containerRef"
    v-grid-nav="options.length"
    class="relative inline-flex items-center rounded-full box-border select-none max-w-full gap-1 p-0 bg-transparent border-0"
    :class="[
      currentConfig.wrapperClass,
      {
        'opacity-50 cursor-not-allowed': disabled,
        'w-full': isFullWidth,
      },
    ]"
    :style="resolvedWidth ? { width: resolvedWidth } : undefined"
  >
    <ActionButton
      v-for="item in options"
      :key="`${item.label}-${item.value}`"
      ref="itemRefs"
      :size
      :texted="1"
      :disabled="disabled || item.disabled"
      :variant="modelValue === item.value ? 'subtle' : 'ghost'"
      :primary="modelValue === item.value"
      :class="[
        modelValue === item.value ? 'font-bold text-primary' : 'font-medium text-text-muted',
        { 'flex-1': isFullWidth },
      ]"
      data-focusable-inline
      @click="handleSelect(item)"
    >
      <slot name="label" :item> {{ item.label }} </slot>
    </ActionButton>
  </div>

  <div
    v-else
    ref="containerRef"
    v-grid-nav="options.length"
    class="relative inline-flex items-center rounded-full bg-bg-body border border-border-light box-border select-none max-w-full p-0.5 gap-1 transition-opacity"
    :class="[
      currentConfig.wrapperClass,
      {
        'opacity-50 cursor-not-allowed': disabled,
        'w-full': isFullWidth,
      },
    ]"
    :style="resolvedWidth ? { width: resolvedWidth } : undefined"
  >
    <div
      class="absolute left-0 top-0 rounded-full bg-tint-primary-88 shadow-[0_1px_3px_rgba(var(--color-primary-rgb),0.12)] pointer-events-none z-10 box-border border border-tint-primary-60 will-change-transform"
      :class="{ 'transition-all duration-base ease-spring': isInitialized }"
      :style="indicatorStyle"
    />

    <button
      v-for="item in options"
      :key="`${item.label}-${item.value}`"
      ref="itemRefs"
      v-wave="{ disabled: item.disabled }"
      class="relative z-20 font-bold text-text-muted rounded-full border-none bg-transparent shadow-none cursor-pointer whitespace-nowrap inline-flex items-center justify-center self-stretch h-full transition-colors outline-none hover:text-text-title"
      :class="[
        compact ? currentConfig.compactItemPadding : currentConfig.itemPadding,
        {
          '!text-primary font-extrabold': modelValue === item.value,
          'opacity-40 cursor-not-allowed pointer-events-auto': item.disabled || disabled,
          'flex-1': isFullWidth,
        },
      ]"
      :disabled="disabled || item.disabled"
      data-focusable-inline
      @click="handleSelect(item)"
    >
      <slot name="label" :item> {{ item.label }} </slot>
    </button>
  </div>
</template>

<script setup lang="ts" generic="T extends string | number">
import ActionButton from '@/components/base/ActionButton.vue';
import { type FormComponentWidth, resolveComponentWidth } from '@/utils/core/constants';
import { computed, nextTick, ref, useTemplateRef, watch, watchEffect } from 'vue';

export interface SegmentOption<ValueType = string | number> {
  label: string;
  value: ValueType;
  disabled?: boolean;
}

const {
  options,
  size = 'md',
  width = 'auto',
  block = false,
  disabled = false,
  compact = false,
  texted = false,
} = defineProps<{
  options: SegmentOption<T>[];
  size?: 'sm' | 'md' | 'lg';
  width?: FormComponentWidth;
  block?: boolean;
  disabled?: boolean;
  compact?: boolean;
  texted?: boolean;
}>();

const resolvedWidth = computed(() => (block ? '100%' : resolveComponentWidth(width)));
const isFullWidth = computed(() => block || resolvedWidth.value === '100%');

const modelValue = defineModel<T>({ required: true });

const emit = defineEmits<{
  (e: 'change', value: T): void;
}>();

const containerRef = useTemplateRef<HTMLDivElement>('containerRef');
const itemRefs = useTemplateRef<Array<HTMLElement | { $el?: HTMLElement }>>('itemRefs');

const isInitialized = ref(false);
const indicatorPosition = ref({ width: 0, height: 0, x: 0, y: 0, opacity: 0 });

const SEGMENT_CONFIG: Record<
  'sm' | 'md' | 'lg',
  { wrapperClass: string; itemPadding: string; compactItemPadding: string }
> = {
  sm: {
    wrapperClass: 'h-[1.6rem]',
    itemPadding: 'text-2xs px-2',
    compactItemPadding: 'text-2xs px-1',
  },
  md: {
    wrapperClass: 'h-[1.9rem]',
    itemPadding: 'text-2xs px-3',
    compactItemPadding: 'text-2xs px-2',
  },
  lg: {
    wrapperClass: 'h-[2.3rem]',
    itemPadding: 'text-xs px-3',
    compactItemPadding: 'text-xs px-2',
  },
};

const currentConfig = computed(() => SEGMENT_CONFIG[size] ?? SEGMENT_CONFIG.md);

const indicatorStyle = computed(() => ({
  width: `${indicatorPosition.value.width}px`,
  height: `${indicatorPosition.value.height}px`,
  transform: `translate(${indicatorPosition.value.x}px, ${indicatorPosition.value.y}px)`,
  opacity: indicatorPosition.value.opacity,
}));

const updateIndicatorPosition = async () => {
  if (texted) return;
  await nextTick();

  const containerEl = containerRef.value;
  if (!containerEl) return;

  const activeIndex = options.findIndex(opt => opt.value === modelValue.value);

  if (activeIndex === -1) {
    indicatorPosition.value.opacity = 0;
    return;
  }

  const rawEl = itemRefs.value?.[activeIndex];
  const activeEl = rawEl && 'el' in rawEl ? rawEl.el : rawEl;
  if (!(activeEl instanceof HTMLElement)) return;

  const { offsetLeft, offsetWidth, offsetTop, offsetHeight } = activeEl;

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

const handleSelect = (item: SegmentOption<T>) => {
  if (disabled || item.disabled) return;
  if (modelValue.value !== item.value) {
    modelValue.value = item.value;
    emit('change', item.value);
  }
};

let resizeRafId: number | null = null;

const debouncedUpdateIndicator = () => {
  if (texted) return;
  if (resizeRafId !== null) {
    cancelAnimationFrame(resizeRafId);
  }
  resizeRafId = requestAnimationFrame(() => {
    updateIndicatorPosition();
    resizeRafId = null;
  });
};

watchEffect(onCleanup => {
  if (!texted) {
    updateIndicatorPosition();
    const el = containerRef.value;

    if (el && typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => debouncedUpdateIndicator());
      observer.observe(el);

      onCleanup(() => {
        if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
        observer.disconnect();
      });
    }
  }
});

watch(modelValue, updateIndicatorPosition);
watch(() => options, updateIndicatorPosition);
</script>
