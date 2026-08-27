<template>
  <div
    class="inline-flex items-center justify-center bg-bg-body border border-border-light rounded-full box-border select-none gap-sm transition-all duration-fast hover:border-border-base has-[:focus-visible]:border-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/70"
    :class="[
      currentConfig.wrapperClass,
      { 'opacity-45 cursor-not-allowed': disabled, 'w-full': resolvedWidth === '100%' },
    ]"
    :style="resolvedWidth ? { width: resolvedWidth } : undefined"
    @wheel.prevent="handleWheel"
  >
    <span
      v-if="label && labelPosition === 'left'"
      class="text-2xs font-semibold text-text-disabled whitespace-nowrap px-xs outline-none rounded-sm"
      :class="disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:text-text-title'"
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
      class="text-2xs font-bold text-text-title text-center font-mono outline-none rounded-sm tabular-nums inline-block min-w-8"
      :class="disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:text-primary'"
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
      class="border-none bg-transparent p-0 flex items-center justify-center text-text-disabled cursor-pointer outline-none rounded-full hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
      :disabled="disabled || modelValue <= min"
      title="减少"
      aria-label="减少"
      data-focusable-inline
      @click="stepDown"
    >
      <Minus :size="14" stroke-width="2.2" aria-hidden="true" />
    </button>

    <div class="flex items-center" :class="isCustomWidth ? 'flex-1 min-w-16 w-full' : 'w-20'">
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
        class="w-full h-5 appearance-none bg-transparent outline-none cursor-pointer [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-border-base [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-base [&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-border-base [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary hover:enabled:[&::-webkit-slider-thumb]:scale-125 active:enabled:[&::-webkit-slider-thumb]:scale-135 hover:enabled:[&::-moz-range-thumb]:scale-125 active:enabled:[&::-moz-range-thumb]:scale-135"
        @input="handleInput"
        @change="handleNativeCommit"
        @dblclick="resetToDefault"
      />
    </div>

    <button
      v-if="showButtons"
      type="button"
      class="border-none bg-transparent p-0 flex items-center justify-center text-text-disabled cursor-pointer outline-none rounded-full hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
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
      class="text-2xs font-bold text-text-title text-center font-mono outline-none rounded-sm tabular-nums inline-block min-w-8"
      :class="disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:text-primary'"
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
      class="text-2xs font-semibold text-text-disabled whitespace-nowrap px-xs outline-none rounded-sm"
      :class="disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:text-text-title'"
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
import { type FormComponentWidth, resolveComponentWidth } from '@/utils/core/constants';
import { Minus, Plus } from '@lucide/vue';
import { computed } from 'vue';

const {
  min = 0,
  max = 100,
  step = 1,
  size = 'md',
  width = 'auto',
  label = '',
  labelPosition = 'left',
  showButtons = true,
  showReadout = true,
  readoutPosition = 'right',
  defaultValue = 0,
  disabled = false,
  wheelable = true,
  formatter = undefined,
} = defineProps<{
  min?: number;
  max?: number;
  step?: number;
  size?: 'sm' | 'md' | 'lg';
  width?: FormComponentWidth;
  label?: string;
  labelPosition?: 'left' | 'right';
  showButtons?: boolean;
  showReadout?: boolean;
  readoutPosition?: 'left' | 'right';
  defaultValue?: number;
  disabled?: boolean;
  wheelable?: boolean;
  formatter?: (val: number) => string;
}>();

const modelValue = defineModel<number>({ required: true });

const emit = defineEmits<{
  (e: 'change', value: number): void;
}>();

const resolvedWidth = computed(() => resolveComponentWidth(width));
const isCustomWidth = computed(() => width !== 'auto' && resolvedWidth.value !== undefined);

const SLIDER_CONFIG: Record<'sm' | 'md' | 'lg', { wrapperClass: string }> = {
  sm: { wrapperClass: 'h-[1.6rem] px-xs' },
  md: { wrapperClass: 'h-[1.9rem] px-sm' },
  lg: { wrapperClass: 'h-[2.3rem] px-sm' },
};

const currentConfig = computed(() => SLIDER_CONFIG[size] ?? SLIDER_CONFIG.md);

const stepDecimals = computed(() => {
  const stepStr = String(step);
  const dotIndex = stepStr.indexOf('.');
  return dotIndex === -1 ? 0 : stepStr.length - dotIndex - 1;
});

const roundToPrecision = (val: number) => {
  if (stepDecimals.value === 0) return Math.round(val);
  return Number(val.toFixed(stepDecimals.value));
};

const displayText = computed(() => {
  if (formatter) return formatter(modelValue.value);
  return String(modelValue.value);
});

const updateValue = (rawNextVal: number, options?: { commit?: boolean }) => {
  if (disabled) return;
  const clamped = Math.min(max, Math.max(min, rawNextVal));
  const rounded = roundToPrecision(clamped);

  if (rounded !== modelValue.value) {
    modelValue.value = rounded;
  }
  if (options?.commit) {
    emit('change', rounded);
  }
};

const handleInput = (e: Event) => {
  const val = Number((e.target as HTMLInputElement).value);
  updateValue(val, { commit: false });
};

const handleNativeCommit = (e: Event) => {
  const val = Number((e.target as HTMLInputElement).value);
  updateValue(val, { commit: true });
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
