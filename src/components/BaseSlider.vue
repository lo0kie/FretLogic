<template>
  <div class="base-slider" :class="[`size-${size}`, { 'is-disabled': disabled }]" @wheel.prevent="handleWheel">
    <span
      v-if="label && labelPosition === 'left'"
      class="slider-label"
      role="button"
      tabindex="0"
      :aria-label="`重置 ${label} 为默认值`"
      data-focusable-inline
      @click="resetToDefault"
      @keydown.enter.prevent="resetToDefault"
      @keydown.space.prevent="resetToDefault"
    >
      {{ label }}
    </span>

    <span
      v-if="showReadout && readoutPosition === 'left'"
      class="readout-text"
      role="button"
      tabindex="0"
      :title="`当前数值: ${displayText}，点击恢复默认值`"
      :aria-label="`当前数值 ${displayText}，点击重置`"
      data-focusable-inline
      @click="resetToDefault"
      @keydown.enter.prevent="resetToDefault"
      @keydown.space.prevent="resetToDefault"
    >
      {{ displayText }}
    </span>

    <button
      v-if="showButtons"
      type="button"
      class="icon-btn"
      :disabled="disabled || modelValue <= min"
      title="减少"
      aria-label="减少"
      data-focusable-inline
      @click="stepDown"
    >
      <Minus :size="14" stroke-width="2.2" aria-hidden="true" />
    </button>

    <div class="slider-track-wrapper">
      <input
        :min
        :max
        :step
        :disabled
        type="range"
        :value="modelValue"
        :aria-label="label || '数值调节'"
        :aria-valuemin="min"
        :aria-valuemax="max"
        :aria-valuenow="modelValue"
        :aria-valuetext="displayText"
        class="slider-input"
        @input="handleInput"
        @change="handleNativeCommit"
        @dblclick="resetToDefault"
      />
    </div>

    <button
      v-if="showButtons"
      type="button"
      class="icon-btn"
      :disabled="disabled || modelValue >= max"
      title="增加"
      aria-label="增加"
      data-focusable-inline
      @click="stepUp"
    >
      <Plus :size="14" stroke-width="2.2" aria-hidden="true" />
    </button>

    <span
      v-if="showReadout && readoutPosition === 'right'"
      class="readout-text"
      role="button"
      tabindex="0"
      :title="`当前数值: ${displayText}，点击恢复默认值`"
      :aria-label="`当前数值 ${displayText}，点击重置`"
      data-focusable-inline
      @click="resetToDefault"
      @keydown.enter.prevent="resetToDefault"
      @keydown.space.prevent="resetToDefault"
    >
      {{ displayText }}
    </span>

    <span
      v-if="label && labelPosition === 'right'"
      class="slider-label"
      role="button"
      tabindex="0"
      :aria-label="`重置 ${label} 为默认值`"
      data-focusable-inline
      @click="resetToDefault"
      @keydown.enter.prevent="resetToDefault"
      @keydown.space.prevent="resetToDefault"
    >
      {{ label }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { HEIGHT_LG, HEIGHT_MD, HEIGHT_SM } from '@/utils/constants';
import { Minus, Plus } from '@lucide/vue';
import { computed } from 'vue';

const {
  min = 0,
  max = 100,
  step = 1,
  defaultValue = 0,
  size = 'md',
  disabled = false,
  wheelable = true,
  showButtons = true,
  showReadout = true,
  readoutPosition = 'right',
  labelPosition = 'left',
  formatter = undefined,
  label = '',
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
  /** 用户完成一次离散/拖拽结束的提交（拖动时仅在松手触发一次，键盘/步进/滚轮每次触发） */
  (e: 'commit', value: number): void;
}>();

const displayText = computed(() => {
  if (formatter) return formatter(modelValue.value);
  return String(modelValue.value);
});

const getPrecision = (num: number) => {
  const parts = String(num).split('.');
  return parts[1] ? parts[1].length : 0;
};

const clamp = (val: number) => {
  const precision = getPrecision(step);
  const clamped = Math.min(max, Math.max(min, val));
  return Number(clamped.toFixed(precision));
};

const updateValue = (nextVal: number, options?: { commit?: boolean }) => {
  if (disabled) return;
  const target = clamp(nextVal);
  if (target !== modelValue.value) {
    modelValue.value = target;
    emit('change', target);
    if (options?.commit) emit('commit', target);
  }
};

const handleInput = (e: Event) => {
  const val = parseFloat((e.target as HTMLInputElement).value);
  updateValue(val);
};

// 原生 change 在拖动释放（及键盘步进）时触发一次，作为拖动的提交信号
const handleNativeCommit = () => {
  emit('commit', modelValue.value);
};

const stepUp = () => updateValue(modelValue.value + step, { commit: true });
const stepDown = () => updateValue(modelValue.value - step, { commit: true });

const resetToDefault = () => updateValue(defaultValue, { commit: true });

const handleWheel = (e: WheelEvent) => {
  if (disabled || !wheelable) return;

  if (e.deltaY > 0) {
    stepUp();
  } else if (e.deltaY < 0) {
    stepDown();
  }
};
</script>

<style scoped lang="scss">
.base-slider {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  border-radius: $radius-pill;
  box-sizing: border-box;
  user-select: none;
  gap: $space-sm;

  &.is-disabled {
    opacity: 0.45;
    cursor: not-allowed;

    .slider-label,
    .readout-text {
      cursor: not-allowed;

      &:hover {
        color: inherit;
      }
    }
  }

  &.size-sm {
    height: v-bind('HEIGHT_SM');
    padding: 0 $space-xs;
  }

  &.size-md {
    height: v-bind('HEIGHT_MD');
    padding: 0 $space-sm;
  }

  &.size-lg {
    height: v-bind('HEIGHT_LG');
    padding: 0 $space-sm;
  }
}

/* 滑动 / 聚焦滑块时，给整个组件加聚焦环（仅滑块 input 聚焦时触发，不误伤内部标签/步进按钮） */
.base-slider:has(.slider-input:focus) {
  box-shadow: var(--focus-ring);
}

.slider-label {
  font-size: $fs-2xs;
  font-weight: 600;
  color: var(--text-disabled);
  white-space: nowrap;
  cursor: pointer;
  padding: 0 $space-xs;
  outline: none;
  border-radius: $radius-sm;

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
  transition: $transition-fast;
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
  height: 20px; /* 1. 撑高整体区域，吸收滑块放大带来的溢出，避免布局抖动 */
  appearance: none;
  background: transparent; /* 2. 背景透明，交由 track 渲染 */
  outline: none;
  cursor: pointer;

  /* 3. 规范化：单独渲染 Webkit 轨道 */
  &::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 2px;
    background: var(--border-base);
  }

  &::-webkit-slider-thumb {
    appearance: none;
    width: 12px;
    height: 12px;
    margin-top: -4px; /* 4. 关键：(轨道高4px - 滑块高12px) / 2 = -4px，完美居中 */
    border-radius: 50%;
    background: var(--color-primary);
    box-shadow: var(--shadow-sm);
    transition:
      transform $duration-base $bezier-spring,
      box-shadow $duration-fast $bezier-standard;
  }

  &:not(:disabled):hover::-webkit-slider-thumb {
    transform: scale(1.25);
  }
  &:not(:disabled):active::-webkit-slider-thumb {
    transform: scale(1.35);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary), transparent 45%);
  }

  /* 5. 补充 Firefox 的轨道与滑块支持 */
  &::-moz-range-track {
    height: 4px;
    border-radius: 2px;
    background: var(--border-base);
  }
  &::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border: none;
    border-radius: 50%;
    background: var(--color-primary);
    box-shadow: var(--shadow-sm);
    transition:
      transform $duration-base $bezier-spring,
      box-shadow $duration-fast $bezier-standard;
  }
  &:not(:disabled):hover::-moz-range-thumb {
    transform: scale(1.25);
  }
  &:not(:disabled):active::-moz-range-thumb {
    transform: scale(1.35);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary), transparent 45%);
  }
}

.readout-text {
  font-size: $fs-2xs;
  font-weight: 700;
  color: var(--text-title);
  text-align: center;
  font-family: monospace;
  cursor: pointer;
  outline: none;
  border-radius: $radius-sm;
  font-variant-numeric: tabular-nums;
  display: inline-block;
  min-width: 2rem;

  &:hover {
    color: var(--color-primary);
  }
}
</style>
