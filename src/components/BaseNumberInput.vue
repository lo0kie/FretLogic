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

const props = withDefaults(
  defineProps<{
    modelValue: number;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    labelPrefix?: string;
    labelSuffix?: string;
    formatter?: (val: number) => string;
  }>(),
  {
    min: 0,
    max: 100,
    step: 1,
    disabled: false,
    labelPrefix: '',
    labelSuffix: '',
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void;
  (e: 'change', value: number): void;
}>();

// 🌟 默认格式化展示文本
const displayText = computed(() => {
  if (props.formatter) {
    return props.formatter(props.modelValue);
  }
  return `${props.labelPrefix}${props.modelValue}${props.labelSuffix}`;
});

const clamp = (val: number) => Math.min(props.max, Math.max(props.min, val));

const handleStep = (delta: number) => {
  if (props.disabled) return;
  const nextVal = clamp(props.modelValue + delta);
  if (nextVal !== props.modelValue) {
    emit('update:modelValue', nextVal);
    emit('change', nextVal);
  }
};

const handleWheel = (e: WheelEvent) => {
  if (props.disabled) return;
  e.preventDefault();
  if (e.deltaY < 0) {
    handleStep(props.step);
  } else if (e.deltaY > 0) {
    handleStep(-props.step);
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
