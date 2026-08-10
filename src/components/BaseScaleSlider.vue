<template>
  <div class="base-scale-slider" :class="[`size-${size}`, { 'is-disabled': disabled }]" @wheel.prevent="handleWheel">
    <!-- 1. 左侧 Label (点击重置) -->
    <span
      v-if="label && labelPosition === 'left'"
      class="slider-label"
      role="button"
      tabindex="0"
      :aria-label="`重置 ${label} 为默认值`"
      @click="resetToDefault"
      @keydown.enter.prevent="resetToDefault"
      @keydown.space.prevent="resetToDefault"
      data-focusable-inline
    >
      {{ label }}
    </span>

    <!-- 2. 左侧数值读出 (点击重置) -->
    <span
      v-if="showReadout && readoutPosition === 'left'"
      class="readout-text"
      role="button"
      tabindex="0"
      :title="`当前缩放: ${displayText}，点击恢复默认值`"
      :aria-label="`当前数值 ${displayText}，点击重置`"
      @click="resetToDefault"
      @keydown.enter.prevent="resetToDefault"
      @keydown.space.prevent="resetToDefault"
      data-focusable-inline
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
      aria-label="缩小"
      @click="stepDown"
      data-focusable-inline
    >
      <AArrowDown :size="14" stroke-width="2.2" aria-hidden="true" />
    </button>

    <!-- 4. 滑块核心 Input -->
    <div class="slider-track-wrapper">
      <input
        :min
        :max
        :step
        :disabled
        type="range"
        :value="modelValue"
        :aria-label="label || '缩放调节'"
        :aria-valuemin="min"
        :aria-valuemax="max"
        :aria-valuenow="modelValue"
        :aria-valuetext="displayText"
        class="slider-input"
        @input="handleInput"
        @dblclick="resetToDefault"
        data-focusable-outline
      />
    </div>

    <!-- 5. 放大按钮 -->
    <button
      v-if="showButtons"
      type="button"
      class="icon-btn"
      :disabled="disabled || modelValue >= max"
      title="放大"
      aria-label="放大"
      @click="stepUp"
    >
      <AArrowUp :size="14" stroke-width="2.2" aria-hidden="true" />
    </button>

    <!-- 6. 右侧数值读出 (点击重置) -->
    <span
      v-if="showReadout && readoutPosition === 'right'"
      class="readout-text"
      role="button"
      tabindex="0"
      :title="`当前缩放: ${displayText}，点击恢复默认值`"
      :aria-label="`当前数值 ${displayText}，点击重置`"
      @click="resetToDefault"
      @keydown.enter.prevent="resetToDefault"
      @keydown.space.prevent="resetToDefault"
    >
      {{ displayText }}
    </span>

    <!-- 7. 右侧 Label (点击重置) -->
    <span
      v-if="label && labelPosition === 'right'"
      class="slider-label"
      role="button"
      tabindex="0"
      :aria-label="`重置 ${label} 为默认值`"
      @click="resetToDefault"
      @keydown.enter.prevent="resetToDefault"
      @keydown.space.prevent="resetToDefault"
    >
      {{ label }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { HEIGHT_LG, HEIGHT_MD, HEIGHT_SM } from '@/constants';
import { AArrowDown, AArrowUp } from '@lucide/vue';
import { computed } from 'vue';

const {
  min = 0.6,
  max = 1.5,
  step = 0.05,
  defaultValue = 1.0,
  size = 'md',
  disabled = false,
  wheelable = true,
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
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  wheelable?: boolean;
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

const handleWheel = (e: WheelEvent) => {
  if (disabled || !wheelable) return;

  if (e.deltaY > 0) {
    stepUp();
  } else if (e.deltaY < 0) {
    stepDown();
  }
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.base-scale-slider {
  display: inline-flex;
  align-items: center;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  border-radius: 9999px;
  box-sizing: border-box;
  user-select: none;

  &.is-disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &.size-sm {
    height: v-bind(HEIGHT_SM);
    padding: 0 0.3rem;
  }

  &.size-md {
    height: v-bind(HEIGHT_MD);
    padding: 0 0.4rem;
  }

  &.size-lg {
    height: v-bind(HEIGHT_LG);
    padding: 0 0.5rem;
  }
}

.slider-label {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--text-disabled);
  white-space: nowrap;
  cursor: pointer;
  padding: 0 0.1rem;
  outline: none;
  border-radius: @radius-sm;

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
  outline: none;
  border-radius: 50%;

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
    transition:
      transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1),
      box-shadow @duration-fast ease;

    &:hover {
      transform: scale(1.25);
    }

    &:active {
      transform: scale(1.4);
      box-shadow: 0 2px 6px color-mix(in srgb, var(--color-primary), transparent 50%);
    }
  }
}

.readout-text {
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--text-title);
  text-align: left;
  font-family: monospace;
  cursor: pointer;
  outline: none;
  border-radius: @radius-sm;
  font-variant-numeric: tabular-nums;
  display: inline-block;
  min-width: 2rem;

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
