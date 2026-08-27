<template>
  <div
    class="group inline-flex items-center justify-between bg-bg-body border border-border-light rounded-full box-border select-none transition-all duration-fast hover:border-border-base focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/70"
    :class="[currentConfig.wrapperClass, { 'w-full': resolvedWidth === '100%' }]"
    :style="resolvedWidth ? { width: resolvedWidth } : undefined"
    @wheel.prevent="handleWheel"
  >
    <button
      v-wave="{ disabled }"
      data-focusable-inline
      type="button"
      class="border-none bg-transparent font-extrabold text-text-muted group-hover:enabled:text-text-title cursor-pointer rounded-full flex items-center justify-center p-0 outline-none transition-all duration-fast active:enabled:scale-90 hover:enabled:bg-bg-panel-hover disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
      :class="currentConfig.btnClass"
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
      class="font-bold text-primary text-center bg-transparent border-none outline-none p-0 m-0 font-[inherit] box-border [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none flex-1 w-0"
      :class="currentConfig.textClass"
      @blur="commitInput"
      @keydown.enter="commitInput"
      @keydown.esc="cancelInput"
    />
    <span
      v-else
      class="font-bold text-center whitespace-nowrap outline-none flex-1 w-0"
      :class="[
        currentConfig.textClass,
        disabled
          ? 'text-text-disabled cursor-not-allowed'
          : editable
            ? 'text-text-title cursor-pointer hover:text-primary'
            : 'text-text-title',
      ]"
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
      class="border-none bg-transparent font-extrabold text-text-muted group-hover:enabled:text-text-title cursor-pointer rounded-full flex items-center justify-center p-0 outline-none transition-all duration-fast active:enabled:scale-90 hover:enabled:bg-bg-panel-hover disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
      :class="currentConfig.btnClass"
      :disabled="disabled || (modelValue >= max && !loopable)"
      @click="handleStep(step)"
    >
      <slot name="plus"> {{ plusText }} </slot>
    </button>
  </div>
</template>

<script setup lang="ts">
import { type FormComponentWidth, resolveComponentWidth } from '@/utils/core/constants';
import { computed, nextTick, ref, useTemplateRef } from 'vue';

const {
  min = 0,
  max = 100,
  step = 1,
  size = 'md',
  width = 'auto',
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
  width?: FormComponentWidth;
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
const resolvedWidth = computed(() => resolveComponentWidth(width));

const NUMBER_INPUT_CONFIG: Record<'sm' | 'md' | 'lg', { wrapperClass: string; btnClass: string; textClass: string }> = {
  sm: {
    wrapperClass: 'h-[1.6rem] px-xs gap-xs',
    btnClass: 'w-[1.1rem] h-[1.1rem] text-xs',
    textClass: 'text-2xs min-w-[3rem]',
  },
  md: {
    wrapperClass: 'h-[1.9rem] px-xs gap-xs',
    btnClass: 'w-[1.3rem] h-[1.3rem] text-xs',
    textClass: 'text-xs min-w-[3.5rem]',
  },
  lg: {
    wrapperClass: 'h-[2.3rem] px-xs gap-xs',
    btnClass: 'w-[1.3rem] h-[1.3rem] text-xs',
    textClass: 'text-xs min-w-[4rem]',
  },
};

const currentConfig = computed(() => NUMBER_INPUT_CONFIG[size] ?? NUMBER_INPUT_CONFIG.md);

const displayText = computed(() => {
  if (formatter) {
    return formatter(modelValue.value);
  }
  return `${labelPrefix}${modelValue.value}${labelSuffix}`;
});

const stepDecimals = computed(() => {
  const stepStr = String(step);
  const dotIndex = stepStr.indexOf('.');
  return dotIndex === -1 ? 0 : stepStr.length - dotIndex - 1;
});

const roundToPrecision = (val: number) => {
  if (stepDecimals.value === 0) return Math.round(val);
  return Number(val.toFixed(stepDecimals.value));
};

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

  let nextVal = roundToPrecision(Math.min(max, Math.max(min, parsed)));
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
  let nextVal = roundToPrecision(modelValue.value + delta);

  if (loopable) {
    if (nextVal > max) {
      nextVal = min;
    } else if (nextVal < min) {
      nextVal = max;
    }
  } else {
    nextVal = roundToPrecision(Math.min(max, Math.max(min, nextVal)));
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
