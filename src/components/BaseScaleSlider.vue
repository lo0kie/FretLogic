<template>
  <div class="base-scale-slider" :class="{ 'is-disabled': disabled }">
    <!-- 1. 左侧文字标签（可选） -->
    <span v-if="label && labelPosition === 'left'" class="slider-label" @click="resetToDefault">
      {{ label }}
    </span>

    <!-- 2. 数值显示在左侧 -->
    <span
      v-if="showReadout && readoutPosition === 'left'"
      class="readout-text"
      :title="`当前缩放: ${displayText}，点击恢复默认值`"
      @click="resetToDefault"
    >
      {{ displayText }}
    </span>

    <!-- 3. 缩小按钮 -->
    <button
      v-if="showButtons"
      type="button"
      class="icon-btn"
      :disabled="disabled || modelValue <= min"
      title="缩小"
      @click="stepDown"
    >
      <AArrowDown :size="14" stroke-width="2.2" />
    </button>

    <!-- 4. 滑块轨道主体 -->
    <div class="slider-track-wrapper">
      <input
        type="range"
        :min="min"
        :max="max"
        :step="step"
        :value="modelValue"
        :disabled="disabled"
        class="slider-input"
        @input="handleInput"
        @dblclick="resetToDefault"
      />
    </div>

    <!-- 5. 放大按钮 -->
    <button
      v-if="showButtons"
      type="button"
      class="icon-btn"
      :disabled="disabled || modelValue >= max"
      title="放大"
      @click="stepUp"
    >
      <AArrowUp :size="14" stroke-width="2.2" />
    </button>

    <!-- 6. 数值显示在右侧（默认） -->
    <span
      v-if="showReadout && readoutPosition === 'right'"
      class="readout-text"
      :title="`当前缩放: ${displayText}，点击恢复默认值`"
      @click="resetToDefault"
    >
      {{ displayText }}
    </span>

    <!-- 7. 右侧文字标签（可选） -->
    <span v-if="label && labelPosition === 'right'" class="slider-label" @click="resetToDefault">
      {{ label }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { AArrowDown, AArrowUp } from '@lucide/vue';
import { computed } from 'vue';

const {
  min = 0.6,
  max = 1.5,
  step = 0.05,
  defaultValue = 1.0,
  disabled = false,
  showButtons = true,
  showReadout = true,
  readoutPosition = 'right',
  labelPosition = 'left',
  formatter,
  label,
} = defineProps<{
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number;
  disabled?: boolean;
  showButtons?: boolean;
  showReadout?: boolean;
  readoutPosition?: 'left' | 'right';
  formatter?: (val: number) => string;
  label?: string;
  labelPosition?: 'left' | 'right';
}>();

const modelValue = defineModel<number>({ required: true });

const emit = defineEmits<{
  (e: 'change', value: number): void;
}>();

const displayText = computed(() => {
  if (formatter) return formatter(modelValue.value);
  return `${Math.round(modelValue.value * 100)}%`;
});

const clamp = (val: number) => {
  const precision = 100;
  const clamped = Math.min(max, Math.max(min, val));
  return Math.round(clamped * precision) / precision;
};

const updateValue = (nextVal: number) => {
  if (disabled) return;
  const target = clamp(nextVal);
  if (target !== modelValue.value) {
    modelValue.value = target;
    emit('change', target);
  }
};

const handleInput = (e: Event) => {
  const val = parseFloat((e.target as HTMLInputElement).value);
  updateValue(val);
};

const stepUp = () => updateValue(modelValue.value + step);
const stepDown = () => updateValue(modelValue.value - step);

const resetToDefault = () => updateValue(defaultValue);
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.base-scale-slider {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  height: 1.6rem;
  padding: 0 0.4rem;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  border-radius: 9999px;
  box-sizing: border-box;
  user-select: none;

  &.is-disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.slider-label {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--text-disabled);
  white-space: nowrap;
  cursor: pointer;
  padding: 0 0.1rem;

  &:hover {
    color: var(--text-title);
  }
}

.icon-btn {
  border: none;
  background: transparent;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-disabled);
  cursor: pointer;
  transition: @transition-fast;

  &:hover:not(:disabled) {
    color: var(--color-primary);
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
}

.slider-track-wrapper {
  display: flex;
  align-items: center;
  width: 5rem;
}

.slider-input {
  width: 100%;
  height: 4px;
  appearance: none;
  background: var(--border-base);
  border-radius: 2px;
  outline: none;
  cursor: pointer;

  &::-webkit-slider-thumb {
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--color-primary);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
    transition: transform @duration-fast ease;

    &:hover {
      transform: scale(1.2);
    }
  }
}

.readout-text {
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--text-title);
  text-align: center;
  font-family: monospace;
  cursor: pointer;

  &:hover {
    color: var(--color-primary);
  }
}

@media (max-width: 768px) {
  .slider-track-wrapper {
    width: 4rem;
  }
}
</style>
