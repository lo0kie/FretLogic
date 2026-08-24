<template>
  <div
    v-if="texted"
    ref="containerRef"
    class="base-segmented-control is-texted"
    :class="[`size-${size}`, { 'is-disabled': disabled, 'is-compact': compact }]"
    @keydown="handleKeydown"
  >
    <ActionButton
      v-for="item in options"
      :key="`${item.label}-${item.value}`"
      ref="itemRefs"
      :size
      :texted
      :disabled="disabled || item.disabled"
      :variant="modelValue === item.value ? 'subtle' : 'ghost'"
      :primary="modelValue === item.value"
      data-focusable-inline
      @click="handleSelect(item)"
    >
      <slot name="label" :item>
        {{ item.label }}
      </slot>
    </ActionButton>
  </div>

  <div
    v-else
    ref="containerRef"
    class="base-segmented-control"
    :class="[`size-${size}`, { 'is-disabled': disabled, 'is-compact': compact }]"
    @keydown="handleKeydown"
  >
    <div class="indicator-pill" :class="{ 'is-animated': isInitialized }" />

    <button
      v-for="item in options"
      :key="`${item.label}-${item.value}`"
      ref="itemRefs"
      v-wave="{ disabled: item.disabled }"
      class="segmented-item"
      :class="{
        'is-active': modelValue === item.value,
        'is-item-disabled': item.disabled || disabled,
      }"
      :disabled="disabled || item.disabled"
      data-focusable-inline
      @click="handleSelect(item)"
    >
      <slot name="label" :item>
        {{ item.label }}
      </slot>
    </button>
  </div>
</template>

<script setup lang="ts" generic="T extends string | number">
import ActionButton from '@/components/ActionButton.vue';
import { HEIGHT_LG, HEIGHT_MD, HEIGHT_SM } from '@/utils/constants';
import { useGridNavigation } from '@/composables/useGridNavigation';
import { nextTick, ref, useTemplateRef, watch, watchEffect } from 'vue';

export interface SegmentOption<ValueType = string | number> {
  label: string;
  value: ValueType;
  disabled?: boolean;
}

const props = withDefaults(
  defineProps<{
    options: SegmentOption<T>[];
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    compact?: boolean;
    texted?: boolean;
  }>(),
  {
    size: 'md',
    disabled: false,
    compact: false,
    texted: false,
  }
);

const modelValue = defineModel<T>({ required: true });

const emit = defineEmits<{
  (e: 'change', value: T): void;
}>();

const containerRef = useTemplateRef<HTMLDivElement>('containerRef');
// itemRefs 需要同时兼容原生 button 和 ActionButton 组件实例
const itemRefs = useTemplateRef<Array<HTMLElement | { $el?: HTMLElement }>>('itemRefs');

const { handleKeydown } = useGridNavigation(props.options.length, containerRef);
const isInitialized = ref(false);

const updateIndicatorPosition = async () => {
  if (props.texted) return;
  await nextTick();

  const containerEl = containerRef.value;
  if (!containerEl) return;

  const activeIndex = props.options.findIndex(opt => opt.value === modelValue.value);

  if (activeIndex === -1) {
    containerEl.style.setProperty('--indicator-opacity', '0');
    return;
  }

  const rawEl = itemRefs.value?.[activeIndex];
  const activeEl = rawEl && 'el' in rawEl ? rawEl.el : rawEl;
  if (!(activeEl instanceof HTMLElement)) return;

  const { offsetLeft, offsetWidth, offsetTop, offsetHeight } = activeEl;

  containerEl.style.setProperty('--indicator-width', `${offsetWidth}px`);
  containerEl.style.setProperty('--indicator-x', `${offsetLeft}px`);
  containerEl.style.setProperty('--indicator-height', `${offsetHeight}px`);
  containerEl.style.setProperty('--indicator-y', `${offsetTop}px`);
  containerEl.style.setProperty('--indicator-opacity', '1');

  if (!isInitialized.value) {
    requestAnimationFrame(() => {
      isInitialized.value = true;
    });
  }
};

const handleSelect = (item: SegmentOption<T>) => {
  if (props.disabled || item.disabled) return;
  if (modelValue.value !== item.value) {
    modelValue.value = item.value;
    emit('change', item.value);
  }
};

let resizeRafId: number | null = null;

const debouncedUpdateIndicator = () => {
  if (props.texted) return;
  if (resizeRafId !== null) {
    cancelAnimationFrame(resizeRafId);
  }
  resizeRafId = requestAnimationFrame(() => {
    updateIndicatorPosition();
    resizeRafId = null;
  });
};

watchEffect(onCleanup => {
  if (!props.texted) {
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

// updateIndicatorPosition 首行即 await，watchEffect 追踪不到其内部读取，需显式 watch；
// options 是静态选项数组，引用变化已足够触发，无需 deep 遍历
watch(modelValue, updateIndicatorPosition);
watch(() => props.options, updateIndicatorPosition);
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.base-segmented-control {
  position: relative;
  display: inline-flex;
  align-items: center;
  background-color: var(--bg-body);
  border-radius: @radius-pill;
  border: 1px solid var(--border-light);
  box-sizing: border-box;
  user-select: none;
  transition: opacity @duration-fast ease;

  --indicator-width: 0px;
  --indicator-x: 0px;
  --indicator-height: 0px;
  --indicator-y: 0px;
  --indicator-opacity: 0;

  &.is-disabled {
    opacity: 0.5;
    cursor: not-allowed;

    .segmented-item {
      cursor: not-allowed;
    }
  }

  &.is-texted {
    background-color: transparent;
    border: none;
    padding: 0;
    gap: @space-xs;
  }

  &.size-sm {
    height: v-bind('HEIGHT_SM');
    padding: @space-2xs;
    gap: @space-xs;

    .segmented-item {
      font-size: @fs-2xs;
      padding: 0 @space-sm;
    }
  }

  &.size-md {
    height: v-bind('HEIGHT_MD');
    padding: @space-2xs;
    gap: @space-xs;

    .segmented-item {
      font-size: @fs-2xs;
      padding: 0 @space-md;
    }
  }

  &.size-lg {
    height: v-bind('HEIGHT_LG');
    padding: @space-2xs;
    gap: @space-xs;

    .segmented-item {
      font-size: @fs-xs;
      padding: 0 @space-md;
    }
  }

  &.is-compact {
    padding: @space-xs;
    gap: @space-xs;

    &.size-sm .segmented-item {
      padding: 0 @space-xs;
    }

    &.size-md .segmented-item {
      padding: 0 @space-sm;
    }

    &.size-lg .segmented-item {
      padding: 0 @space-sm;
    }
  }
}

.indicator-pill {
  position: absolute;
  left: 0;
  top: 0;
  border-radius: @radius-pill;
  background-color: var(--bg-panel);
  box-shadow: @shadow-sm;
  pointer-events: none;
  z-index: var(--z-content);
  transition: none;
  will-change: transform, width, height, opacity;
  box-sizing: border-box;
  border: 1px solid var(--border-light);

  width: var(--indicator-width);
  height: var(--indicator-height);
  transform: translate(var(--indicator-x), var(--indicator-y));
  opacity: var(--indicator-opacity);

  &.is-animated {
    transition:
      transform @duration-slow @bezier-sidebar,
      width @duration-slow @bezier-sidebar,
      height @duration-slow @bezier-sidebar,
      opacity @duration-fast ease;
  }
}

.segmented-item {
  position: relative;
  z-index: var(--z-inner);
  font-weight: 600;
  color: var(--text-disabled);
  border-radius: @radius-pill;
  border: none;
  background: transparent !important;
  box-shadow: none !important;
  cursor: pointer;
  transition:
    color @duration-fast ease,
    opacity @duration-fast ease,
    background-color @duration-fast ease;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: stretch;
  height: 100%;

  &:hover:not(:disabled):not(.is-item-disabled) {
    color: var(--text-title);
  }

  &.is-active {
    color: var(--color-primary);
    font-weight: 700;
  }

  &.is-item-disabled {
    opacity: 0.4;
    cursor: not-allowed !important;
    pointer-events: auto;
  }
}
</style>
