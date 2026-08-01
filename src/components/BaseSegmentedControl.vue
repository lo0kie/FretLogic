<template>
  <div ref="containerRef" class="base-segmented-control" :class="{ 'is-disabled': disabled }">
    <!-- 🌟 滑动背景胶囊 -->
    <div class="indicator-pill" :class="{ 'is-animated': isInitialized }" :style="indicatorStyle"></div>

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
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, useTemplateRef, watch } from 'vue';

export interface SegmentOption<ValueType = string | number> {
  label: string;
  value: ValueType;
  disabled?: boolean;
}

const {
  modelValue,
  options,
  disabled = false,
} = defineProps<{
  modelValue: T;
  options: SegmentOption<T>[];
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: T): void;
  (e: 'change', value: T): void;
}>();

const containerRef = useTemplateRef<HTMLDivElement>('containerRef');
const itemRefs = useTemplateRef<HTMLButtonElement[]>('itemRefs');

const isInitialized = ref(false);

const indicatorStyle = reactive({
  width: '0px',
  transform: 'translateX(0px)',
  opacity: 0,
});

let resizeObserver: ResizeObserver | null = null;

// 🌟 精准更新胶囊滑块位置（含安全容错）
const updateIndicatorPosition = () => {
  nextTick(() => {
    requestAnimationFrame(() => {
      const activeIndex = options.findIndex(opt => opt.value === modelValue);

      // 防御：若没匹配到选中的 index，保持之前的逻辑或默认取第一个
      if (activeIndex === -1) {
        indicatorStyle.opacity = 0;
        return;
      }

      const activeEl = itemRefs.value?.[activeIndex];
      const containerEl = containerRef.value;

      if (activeEl && containerEl) {
        const offsetLeft = activeEl.offsetLeft;
        const width = activeEl.offsetWidth;

        // 如果 DOM 节点刚刚挂载还没有测量到宽度，延迟一帧重试
        if (width === 0) {
          setTimeout(updateIndicatorPosition, 30);
          return;
        }

        indicatorStyle.width = `${width}px`;
        indicatorStyle.transform = `translateX(${offsetLeft}px)`;
        indicatorStyle.opacity = 1; // 🌟 确保显示

        if (!isInitialized.value) {
          setTimeout(() => {
            isInitialized.value = true;
          }, 50);
        }
      }
    });
  });
};

const handleSelect = (item: SegmentOption<T>) => {
  if (disabled || item.disabled) return;
  if (modelValue !== item.value) {
    emit('update:modelValue', item.value);
    emit('change', item.value);
  }
};

watch(() => modelValue, updateIndicatorPosition);
watch(() => options, updateIndicatorPosition, { deep: true });

onMounted(() => {
  updateIndicatorPosition();

  if (containerRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      updateIndicatorPosition();
    });
    resizeObserver.observe(containerRef.value);
  }
});

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});
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
