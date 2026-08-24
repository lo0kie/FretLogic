<template>
  <div class="base-number-input" :class="`size-${size}`" @wheel.prevent="handleWheel">
    <button
      v-wave="{ disabled }"
      data-focusable-inline
      type="button"
      class="step-btn"
      :disabled="disabled || (modelValue <= min && !loopable)"
      @click="handleStep(-step)"
    >
      <slot name="minus">
        {{ minusText }}
      </slot>
    </button>

    <input
      v-if="editable && isEditing"
      ref="inputRef"
      v-model="tempValue"
      type="text"
      inputmode="numeric"
      class="readout-input"
      @blur="commitInput"
      @keydown.enter="commitInput"
      @keydown.esc="cancelInput"
    />
    <span
      v-else
      class="readout-text"
      :class="{ 'is-disabled': disabled, 'is-editable': editable && !disabled }"
      role="button"
      data-focusable-inline
      :tabindex="disabled || !editable ? -1 : 0"
      @click="startEditing"
      @keydown.enter="startEditing"
      @keydown.space.prevent="startEditing"
    >
      {{ displayText }}
    </span>

    <button
      v-wave="{ disabled }"
      data-focusable-inline
      type="button"
      class="step-btn"
      :disabled="disabled || (modelValue >= max && !loopable)"
      @click="handleStep(step)"
    >
      <slot name="plus">
        {{ plusText }}
      </slot>
    </button>
  </div>
</template>

<script setup lang="ts">
import { HEIGHT_LG, HEIGHT_MD, HEIGHT_SM } from '@/utils/constants';
import { computed, nextTick, ref, useTemplateRef } from 'vue';

const {
  min = 0,
  max = 100,
  step = 1,
  size = 'md',
  disabled = false,
  wheelable = true,
  loopable = true,
  editable = true,
  plusText = '+',
  minusText = '-',
  labelPrefix = '',
  labelSuffix = '',
  formatter = undefined,
} = defineProps<{
  min?: number;
  max?: number;
  step?: number;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  wheelable?: boolean;
  loopable?: boolean;
  editable?: boolean;
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

const isEditing = ref(false);
const tempValue = ref('');
const inputRef = useTemplateRef<HTMLInputElement>('inputRef');

const displayText = computed(() => {
  if (formatter) {
    return formatter(modelValue.value);
  }
  return `${labelPrefix}${modelValue.value}${labelSuffix}`;
});

const startEditing = () => {
  if (disabled || !editable) return;
  tempValue.value = String(modelValue.value);
  isEditing.value = true;
  nextTick(() => {
    inputRef.value?.focus();
    inputRef.value?.select();
  });
};

const commitInput = () => {
  if (!isEditing.value) return;
  isEditing.value = false;
  const parsed = parseFloat(tempValue.value);
  if (isNaN(parsed)) return;

  let nextVal = Math.min(max, Math.max(min, parsed));
  if (nextVal !== modelValue.value) {
    modelValue.value = nextVal;
    emit('change', nextVal);
  }
};

const cancelInput = () => {
  isEditing.value = false;
};

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
  if (disabled || !wheelable || isEditing.value) return;

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
  border-radius: @radius-pill;
  box-sizing: border-box;
  user-select: none;

  &.size-sm {
    height: v-bind('HEIGHT_SM');
    padding: 0 @space-xs;
    gap: @space-xs;

    .step-btn {
      width: 1.1rem;
      height: 1.1rem;
      font-size: @fs-xs;
    }

    .readout-text,
    .readout-input {
      font-size: @fs-2xs;
      min-width: 3rem;
      flex: 1;
      width: 0;
    }
  }

  &.size-md {
    height: v-bind('HEIGHT_MD');
    padding: 0 @space-xs;
    gap: @space-xs;

    .step-btn {
      width: 1.3rem;
      height: 1.3rem;
      font-size: @fs-xs;
    }

    .readout-text,
    .readout-input {
      font-size: @fs-xs;
      min-width: 3.5rem;
      flex: 1;
      width: 0;
    }
  }

  &.size-lg {
    height: v-bind('HEIGHT_LG');
    padding: 0 @space-xs;
    gap: @space-xs;

    .readout-text,
    .readout-input {
      font-size: @fs-xs;
      min-width: 4rem;
      flex: 1;
      width: 0;
    }
  }

  &:hover {
    .step-btn:not(:disabled) {
      color: var(--text-title);
    }
  }
}

.step-btn {
  border: none;
  background: transparent;
  font-weight: 800;
  color: var(--text-muted);
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

  &.is-editable {
    cursor: pointer;

    &:hover {
      color: var(--color-primary);
    }
  }

  &.is-disabled {
    color: var(--text-disabled);
    cursor: not-allowed;
  }
}

.readout-input {
  font-weight: 700;
  color: var(--color-primary);
  text-align: center;
  background: transparent;
  border: none;
  outline: none;
  padding: 0;
  margin: 0;
  font-family: inherit;
  box-sizing: border-box;

  &::-webkit-inner-spin-button,
  &::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
}
</style>
