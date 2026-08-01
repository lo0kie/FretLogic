<template>
  <div class="base-number-input" @wheel="handleWheel">
    <button type="button" class="step-btn" :disabled="disabled || modelValue <= min" @click="handleStep(-step)">
      -
    </button>

    <span class="readout-text">
      {{ displayText }}
    </span>

    <button type="button" class="step-btn" :disabled="disabled || modelValue >= max" @click="handleStep(step)">
      +
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const {
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  labelPrefix = '',
  labelSuffix = '',
  formatter,
} = defineProps<{
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  labelPrefix?: string;
  labelSuffix?: string;
  formatter?: (val: number) => string;
}>();

// 🌟 使用 defineModel 接管双向绑定
const modelValue = defineModel<number>({ required: true });

const emit = defineEmits<{
  // 🌟 移除 update:modelValue，由 defineModel 内部自动处理
  (e: 'change', value: number): void;
}>();

// 🌟 默认格式化展示文本
const displayText = computed(() => {
  if (formatter) {
    return formatter(modelValue.value); // 🌟 修复：script 中必须使用 .value
  }
  return `${labelPrefix}${modelValue.value}${labelSuffix}`; // 🌟 修复：script 中必须使用 .value
});

const clamp = (val: number) => Math.min(max, Math.max(min, val));

const handleStep = (delta: number) => {
  if (disabled) return;
  const nextVal = clamp(modelValue.value + delta);
  if (nextVal !== modelValue.value) {
    modelValue.value = nextVal; // 🌟 修改：直接赋值，替代 emit('update:modelValue')
    emit('change', nextVal);
  }
};

const handleWheel = (e: WheelEvent) => {
  if (disabled) return;
  e.preventDefault();
  if (e.deltaY < 0) {
    handleStep(step);
  } else if (e.deltaY > 0) {
    handleStep(-step);
  }
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.base-number-input {
  display: flex;
  align-items: center;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  border-radius: 9999px;
  height: 1.5rem;
  padding: 0 0.2rem;
  gap: 0.2rem;
  box-sizing: border-box;
  user-select: none;
}

/* 🌟 加减按钮修改为圆形 */
.step-btn {
  border: none;
  background: transparent;
  width: 1.1rem;
  height: 1.1rem;
  font-weight: 800;
  font-size: 0.75rem;
  color: var(--text-title);
  cursor: pointer;
  border-radius: 50%; /* 🌟 强制圆形 */
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: @transition-fast;

  &:hover:not(:disabled) {
    background-color: var(--bg-panel-hover);
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
}

/* 🌟 数值展示取消强调色，使用常规标题/正文颜色 */
.readout-text {
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--text-title); /* 🌟 取消 var(--color-primary) */
  min-width: 3.5rem;
  text-align: center;
  white-space: nowrap;
}

@media (max-width: 768px) {
  .base-number-input {
    height: 2rem;
    padding: 0 0.3rem;
  }

  .step-btn {
    width: 1.6rem;
    height: 1.6rem;
    font-size: 0.95rem;
  }

  .readout-text {
    font-size: 0.78rem;
    min-width: 4.5rem;
  }
}
</style>
