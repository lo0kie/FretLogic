<template>
  <div class="base-number-input" :class="`size-${size}`" @wheel.prevent="handleWheel">
    <button
      v-wave
      type="button"
      class="step-btn"
      :disabled="disabled || (modelValue <= min && !loopable)"
      @click="handleStep(-step)"
    >
      <slot name="minus">{{ minusText }}</slot>
    </button>

    <span class="readout-text">
      {{ displayText }}
    </span>

    <button
      v-wave
      type="button"
      class="step-btn"
      :disabled="disabled || (modelValue >= max && !loopable)"
      @click="handleStep(step)"
    >
      <slot name="plus">{{ plusText }}</slot>
    </button>
  </div>
</template>

<script setup lang="ts">
import { HEIGHT_LG, HEIGHT_MD, HEIGHT_SM } from '@/constants';
import { computed } from 'vue';

const {
  min = 0,
  max = 100,
  step = 1,
  size = 'md',
  disabled = false,
  wheelable = true,
  loopable = true,
  plusText = '+',
  minusText = '-',
  labelPrefix = '',
  labelSuffix = '',
  formatter,
} = defineProps<{
  min?: number;
  max?: number;
  step?: number;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  wheelable?: boolean;
  loopable?: boolean;
  plusText?: string;
  minusText?: string;
  labelPrefix?: string;
  labelSuffix?: string;
  formatter?: (val: number) => string;
}>();

const modelValue = defineModel<number>({ required: true });

const emit = defineEmits<{
  (e: 'change', value: number): void;
}>();

const displayText = computed(() => {
  if (formatter) {
    return formatter(modelValue.value);
  }
  return `${labelPrefix}${modelValue.value}${labelSuffix}`;
});

const handleStep = (delta: number) => {
  if (disabled) return;
  let nextVal = modelValue.value + delta;

  if (loopable) {
    if (nextVal > max) {
      nextVal = min;
    } else if (nextVal < min) {
      nextVal = max;
    }
  } else {
    nextVal = Math.min(max, Math.max(min, nextVal));
  }

  if (nextVal !== modelValue.value) {
    modelValue.value = nextVal;
    emit('change', nextVal);
  }
};

const handleWheel = (e: WheelEvent) => {
  if (disabled || !wheelable) return;

  if (e.deltaY > 0) {
    handleStep(step);
  } else if (e.deltaY < 0) {
    handleStep(-step);
  }
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.base-number-input {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  border-radius: 9999px;
  box-sizing: border-box;
  user-select: none;

  &.size-sm {
    height: v-bind(HEIGHT_SM);
    padding: 0 0.15rem;
    gap: 0.15rem;

    .step-btn {
      width: 1.1rem;
      height: 1.1rem;
      font-size: 0.7rem;
    }

    .readout-text {
      font-size: 0.65rem;
      min-width: 3rem;
    }
  }

  &.size-md {
    height: v-bind(HEIGHT_MD);
    padding: 0 0.2rem;
    gap: 0.2rem;

    .step-btn {
      width: 1.3rem;
      height: 1.3rem;
      font-size: 0.78rem;
    }

    .readout-text {
      font-size: 0.7rem;
      min-width: 3.5rem;
    }
  }

  &.size-lg {
    height: v-bind(HEIGHT_LG);
    padding: 0 0.25rem;
    gap: 0.25rem;

    .step-btn {
      width: 1.6rem;
      height: 1.6rem;
      font-size: 0.88rem;
    }

    .readout-text {
      font-size: 0.78rem;
      min-width: 4rem;
    }
  }
}

.step-btn {
  border: none;
  background: transparent;
  font-weight: 800;
  color: var(--text-title);
  cursor: pointer;
  border-radius: 50%;
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

.readout-text {
  font-weight: 700;
  color: var(--text-title);
  text-align: center;
  white-space: nowrap;
}

@media (max-width: 768px) {
  .base-number-input {
    &.size-sm {
      height: 1.85rem;
    }
    &.size-md {
      height: 2.15rem;
    }
    &.size-lg {
      height: 2.5rem;
    }
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
