<template>
  <!-- 🌟 如果开启了 texted 模式，直接渲染整齐排列的 ActionButton 组合 -->
  <div
    v-if="texted"
    ref="containerRef"
    class="base-segmented-control is-texted"
    :class="[`size-${size}`, { 'is-disabled': disabled, 'is-compact': compact }]"
    @keydown="handleKeydown"
  >
    <ActionButton
      :size
      :texted
      v-for="item in options"
      :key="`${item.label}-${item.value}`"
      ref="itemRefs"
      :disabled="disabled || item.disabled"
      :variant="modelValue === item.value ? 'subtle' : 'ghost'"
      :primary="modelValue === item.value"
      @click="handleSelect(item)"
      data-focusable-inline
    >
      <slot name="label" :item>
        {{ item.label }}
      </slot>
    </ActionButton>
  </div>

  <!-- 🌟 原有的滑块式 SegmentedControl 保持不变 -->
  <div
    v-else
    ref="containerRef"
    class="base-segmented-control"
    :class="[`size-${size}`, { 'is-disabled': disabled, 'is-compact': compact }]"
    @keydown="handleKeydown"
  >
    <div class="indicator-pill" :class="{ 'is-animated': isInitialized }"></div>

    <button
      v-wave="{ disabled: item.disabled }"
      v-for="item in options"
      :key="`${item.label}-${item.value}`"
      ref="itemRefs"
      class="segmented-item"
      :class="{
        'is-active': modelValue === item.value,
        'is-item-disabled': item.disabled || disabled,
      }"
      :disabled="disabled || item.disabled"
      @click="handleSelect(item)"
      data-focusable-inline
    >
      <slot name="label" :item>
        {{ item.label }}
      </slot>
    </button>
  </div>
</template>

<script setup lang="ts" generic="T extends string | number">
import ActionButton from '@/components/ActionButton.vue';
import { HEIGHT_LG, HEIGHT_MD, HEIGHT_SM } from '@/constants';
import { useGridNavigation } from '@/services/useGridNavigation';
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
const itemRefs = useTemplateRef<any[]>('itemRefs');

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
  const activeEl = rawEl?.$el ?? rawEl;
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

watch(modelValue, updateIndicatorPosition);
watch(() => props.options, updateIndicatorPosition, { deep: true });
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.base-segmented-control {
  position: relative;
  display: inline-flex;
  align-items: center;
  background-color: var(--bg-body);
  border-radius: 9999px;
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

  /* 🌟 texted 模式：无外框背景，直接以 ActionButton 组合呈现 */
  &.is-texted {
    background-color: transparent;
    border: none;
    padding: 0;
    gap: 0.2rem;
  }

  &.size-sm {
    height: v-bind(HEIGHT_SM);
    padding: 0.12rem;
    gap: 0.1rem;

    .segmented-item {
      font-size: 0.62rem;
      padding: 0 0.45rem;
    }
  }

  &.size-md {
    height: v-bind(HEIGHT_MD);
    padding: 0.15rem;
    gap: 0.15rem;

    .segmented-item {
      font-size: 0.68rem;
      padding: 0 0.6rem;
    }
  }

  &.size-lg {
    height: v-bind(HEIGHT_LG);
    padding: 0.18rem;
    gap: 0.2rem;

    .segmented-item {
      font-size: 0.75rem;
      padding: 0 0.8rem;
    }
  }

  &.is-compact {
    padding: 0.08rem;
    gap: 0.08rem;

    &.size-sm .segmented-item {
      padding: 0 0.3rem;
    }

    &.size-md .segmented-item {
      padding: 0 0.4rem;
    }

    &.size-lg .segmented-item {
      padding: 0 0.55rem;
    }
  }
}

.indicator-pill {
  position: absolute;
  left: 0;
  top: 0;
  border-radius: 9999px;
  background-color: var(--bg-panel);
  box-shadow: @shadow-sm;
  pointer-events: none;
  z-index: 1;
  transition: none;
  will-change: transform, width, height, opacity;

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
  z-index: 2;
  font-weight: 600;
  color: var(--text-disabled);
  border-radius: 9999px;
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
