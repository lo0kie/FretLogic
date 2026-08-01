<template>
  <div ref="containerRef" class="base-segmented-control">
    <!-- 🌟 滑动背景胶囊：未初始化前禁用 transition，防止弹窗刚打开时从左滑到右 -->
    <div class="indicator-pill" :class="{ 'is-animated': isInitialized }" :style="indicatorStyle"></div>

    <button
      v-for="(item, index) in options"
      :key="String(item.value)"
      :ref="el => setItemRef(el, index)"
      class="segmented-item"
      :class="{ 'is-active': modelValue === item.value }"
      @click="handleSelect(item.value)"
    >
      <slot name="label" :item="item">
        {{ item.label }}
      </slot>
    </button>
  </div>
</template>

<script setup lang="ts" generic="T extends string | number">
import { nextTick, onBeforeUnmount, onBeforeUpdate, onMounted, reactive, ref, watch } from 'vue';

export interface SegmentOption<ValueType = string | number> {
  label: string;
  value: ValueType;
}

const props = defineProps<{
  modelValue: T;
  options: SegmentOption<T>[];
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: T): void;
  (e: 'change', value: T): void;
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const itemRefs = ref<(HTMLButtonElement | null)[]>([]);

// 🌟 标记是否初始化完成，未完成前静止瞬移，完成后开启平滑动画
const isInitialized = ref(false);

const indicatorStyle = reactive({
  width: '0px',
  transform: 'translateX(0px)',
  opacity: 0,
});

let resizeObserver: ResizeObserver | null = null;

const setItemRef = (el: unknown, index: number) => {
  if (el) {
    itemRefs.value[index] = el as HTMLButtonElement;
  }
};

onBeforeUpdate(() => {
  itemRefs.value = [];
});

// 🌟 核心：改用 offsetLeft 与 offsetWidth 计算，彻底不受 Parent Transform/Scale 影响
const updateIndicatorPosition = () => {
  nextTick(() => {
    requestAnimationFrame(() => {
      const activeIndex = props.options.findIndex(opt => opt.value === props.modelValue);
      const activeEl = itemRefs.value[activeIndex];
      const containerEl = containerRef.value;

      if (activeEl && containerEl) {
        // 使用物理 offset 计算，不受 父级 CSS Scale 缩放影响，精准贴合左右边距
        const offsetLeft = activeEl.offsetLeft;
        const width = activeEl.offsetWidth;

        if (width === 0) return;

        indicatorStyle.width = `${width}px`;
        indicatorStyle.transform = `translateX(${offsetLeft}px)`;
        indicatorStyle.opacity = 1;

        if (!isInitialized.value) {
          setTimeout(() => {
            isInitialized.value = true;
          }, 50);
        }
      }
    });
  });
};

const handleSelect = (val: T) => {
  if (props.modelValue !== val) {
    emit('update:modelValue', val);
    emit('change', val);
  }
};

watch(() => props.modelValue, updateIndicatorPosition);
watch(() => props.options, updateIndicatorPosition, { deep: true });

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
}

/* 🌟 滑块胶囊元素：默认不带 transition（瞬间定位），只有加上 .is-animated 才开启滑动过渡 */
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
  transition: none; /* 默认无动画 */
  will-change: transform, width;

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
  background: transparent !important; /* 背景交由滑块渲染 */
  box-shadow: none !important;
  cursor: pointer;
  transition: color @duration-fast ease;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:hover {
    color: var(--text-title);
  }

  &.is-active {
    color: var(--color-primary);
    font-weight: 700;
  }
}
</style>
