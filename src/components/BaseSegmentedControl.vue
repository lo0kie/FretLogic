<template>
  <div ref="containerRef" class="base-segmented-control" :class="{ 'is-disabled': disabled }">
    <div class="indicator-pill" :class="{ 'is-animated': isInitialized }"></div>

    <button
      v-for="item in options"
      :key="String(item.value)"
      ref="itemRefs"
      class="segmented-item"
      :class="{
        'is-active': modelValue === item.value,
        'is-item-disabled': item.disabled || disabled,
      }"
      :disabled="disabled || item.disabled"
      @click="handleSelect(item)"
    >
      <slot name="label" :item="item">
        {{ item.label }}
      </slot>
    </button>
  </div>
</template>

<script setup lang="ts" generic="T extends string | number">
import { nextTick, ref, useTemplateRef, watch, watchEffect } from 'vue';

export interface SegmentOption<ValueType = string | number> {
  label: string;
  value: ValueType;
  disabled?: boolean;
}

const { options, disabled = false } = defineProps<{
  options: SegmentOption<T>[];
  disabled?: boolean;
}>();

const modelValue = defineModel<T | null>({ required: true });

const emit = defineEmits<{
  (e: 'change', value: T): void;
}>();

const containerRef = useTemplateRef<HTMLDivElement>('containerRef');
const itemRefs = useTemplateRef<HTMLButtonElement[]>('itemRefs');

const isInitialized = ref(false);

const updateIndicatorPosition = async () => {
  await nextTick();

  const containerEl = containerRef.value;
  if (!containerEl) return;

  const activeIndex = options.findIndex(opt => opt.value === modelValue.value);

  if (activeIndex === -1) {
    containerEl.style.setProperty('--indicator-opacity', '0');
    return;
  }

  const activeEl = itemRefs.value?.[activeIndex];
  if (!activeEl) return;

  const { offsetLeft, offsetWidth } = activeEl;

  containerEl.style.setProperty('--indicator-width', `${offsetWidth}px`);
  containerEl.style.setProperty('--indicator-x', `${offsetLeft}px`);
  containerEl.style.setProperty('--indicator-opacity', '1');

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
  if (resizeRafId !== null) {
    cancelAnimationFrame(resizeRafId);
  }
  resizeRafId = requestAnimationFrame(() => {
    updateIndicatorPosition();
    resizeRafId = null;
  });
};

watchEffect(onCleanup => {
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
});

// 监听数据变化更新位置
watch(modelValue, updateIndicatorPosition);
watch(() => options, updateIndicatorPosition, { deep: true });
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.base-segmented-control {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.15rem;
  background-color: var(--bg-body);
  padding: 0.12rem;
  border-radius: 9999px;
  border: 1px solid var(--border-light);
  box-sizing: border-box;
  user-select: none;
  transition: opacity @duration-fast ease;

  // 🌟 定义 CSS 变量的默认值
  --indicator-width: 0px;
  --indicator-x: 0px;
  --indicator-opacity: 0;

  &.is-disabled {
    opacity: 0.5;
    cursor: not-allowed;

    .segmented-item {
      cursor: not-allowed;
    }
  }
}

/* 🌟 滑块胶囊元素 */
.indicator-pill {
  position: absolute;
  top: 0.12rem;
  bottom: 0.12rem;
  left: 0;
  border-radius: 9999px;
  background-color: var(--bg-panel);
  box-shadow: @shadow-sm;
  pointer-events: none;
  z-index: 1;
  transition: none; /* 默认无动画，首次定位不闪烁 */
  will-change: transform, width, opacity;

  // 🌟 读取 CSS 变量控制位置和大小
  width: var(--indicator-width);
  transform: translateX(var(--indicator-x));
  opacity: var(--indicator-opacity);

  &.is-animated {
    transition:
      transform @duration-slow @bezier-sidebar,
      width @duration-slow @bezier-sidebar,
      opacity @duration-fast ease;
  }
}

.segmented-item {
  position: relative;
  z-index: 2; /* 保证按钮文字浮在胶囊滑块上方 */
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--text-disabled);
  padding: 0.15rem 0.6rem;
  border-radius: 9999px;
  border: none;
  background: transparent !important; /* 背景交由胶囊滑块渲染 */
  box-shadow: none !important;
  cursor: pointer;
  transition:
    color @duration-fast ease,
    opacity @duration-fast ease;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  justify-content: center;

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
