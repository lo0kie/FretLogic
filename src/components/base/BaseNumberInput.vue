<template>
  <div
    ref="wrapperRef"
    class="group inline-flex items-center justify-between bg-bg-body border border-border-light rounded-full box-border select-none transition-all duration-fast hover:border-border-base focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/70"
    :class="[currentConfig.wrapperClass, { 'w-full': resolvedWidth === '100%' }]"
    :style="resolvedWidth ? { width: resolvedWidth } : undefined"
    role="spinbutton"
    :aria-valuenow="modelValue"
    :aria-valuemin="min"
    :aria-valuemax="max"
    :aria-valuetext="displayText"
    :aria-disabled="disabled || undefined"
    :tabindex="disabled ? -1 : 0"
    @wheel="handleWheel"
    @keydown="handleWrapperKeydown"
  >
    <button
      v-wave="{ disabled }"
      type="button"
      tabindex="-1"
      aria-label="减少数值"
      class="border-none bg-transparent font-extrabold text-text-muted group-hover:enabled:text-text-title cursor-pointer rounded-full flex items-center justify-center p-0 outline-none transition-all duration-fast active:enabled:scale-90 hover:enabled:bg-bg-panel-hover disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
      :class="currentConfig.btnClass"
      :disabled="disabled || (modelValue <= min && !loopable)"
      @pointerdown="startContinuousStep(-1, $event)"
      @pointerup="stopContinuousStep"
      @pointerleave="stopContinuousStep"
      @pointercancel="stopContinuousStep"
      @click.prevent
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
      :placeholder="placeholder"
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
      @click="startEditing"
    >
      {{ displayText }}
    </span>

    <button
      v-wave="{ disabled }"
      type="button"
      tabindex="-1"
      aria-label="增加数值"
      class="border-none bg-transparent font-extrabold text-text-muted group-hover:enabled:text-text-title cursor-pointer rounded-full flex items-center justify-center p-0 outline-none transition-all duration-fast active:enabled:scale-90 hover:enabled:bg-bg-panel-hover disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
      :class="currentConfig.btnClass"
      :disabled="disabled || (modelValue >= max && !loopable)"
      @pointerdown="startContinuousStep(1, $event)"
      @pointerup="stopContinuousStep"
      @pointerleave="stopContinuousStep"
      @pointercancel="stopContinuousStep"
      @click.prevent
    >
      <slot name="plus"> {{ plusText }} </slot>
    </button>
  </div>
</template>

<script setup lang="ts">
import { type FormComponentWidth, resolveComponentWidth } from '@/utils/core/constants';
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef } from 'vue';

const props = withDefaults(
  defineProps<{
    min?: number;
    max?: number;
    step?: number;
    size?: 'sm' | 'md' | 'lg';
    width?: FormComponentWidth;
    disabled?: boolean;
    wheelable?: boolean;
    loopable?: boolean;
    editable?: boolean;
    /** 是否开启严格步长对齐：强制限制数值必须落在 min + k * step 上 */
    stepStrictly?: boolean;
    /** 是否开启长按持续自增/自减，默认 true */
    autoIncrement?: boolean;
    placeholder?: string;
    plusText?: string;
    minusText?: string;
    labelPrefix?: string;
    labelSuffix?: string;
    formatter?: (val: number) => string;
    parser?: (raw: string) => number | null;
    precision?: number;
  }>(),
  {
    min: 0,
    max: 100,
    step: 1,
    size: 'md',
    width: 'auto',
    disabled: false,
    wheelable: false,
    loopable: false,
    editable: true,
    stepStrictly: false,
    autoIncrement: true,
    placeholder: '',
    plusText: '+',
    minusText: '-',
    labelPrefix: '',
    labelSuffix: '',
    formatter: undefined,
    parser: undefined,
    precision: undefined,
  }
);

const modelValue = defineModel<number>({ required: true });

const emit = defineEmits<{
  (e: 'change', value: number): void;
}>();

const isEditing = ref(false);
const tempValue = ref('');
const inputRef = useTemplateRef<HTMLInputElement>('inputRef');
const wrapperRef = useTemplateRef<HTMLDivElement>('wrapperRef');
const resolvedWidth = computed(() => resolveComponentWidth(props.width));

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

const currentConfig = computed(() => NUMBER_INPUT_CONFIG[props.size] ?? NUMBER_INPUT_CONFIG.md);

// 健壮的小数位推导：兼容小写/大写科学计数法（如 1e-5 或 1E-5）
const countDecimals = (n: number): number => {
  if (!isFinite(n)) return 0;
  const s = String(n).toLowerCase();
  if (s.includes('e')) {
    const [mantissa, expStr] = s.split('e');
    const exp = parseInt(expStr ?? '0', 10);
    const mantissaDecimals = mantissa?.includes('.') ? mantissa.split('.')[1]!.length : 0;
    return Math.max(0, mantissaDecimals - exp);
  }
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
};

const stepDecimals = computed(() => countDecimals(props.step));
const effectiveDecimals = computed(() => (props.precision != null ? props.precision : stepDecimals.value));

// 消除负零（-0）展示异常
const roundToPrecision = (val: number): number => {
  const rounded = Number(val.toFixed(effectiveDecimals.value));
  return Object.is(rounded, -0) ? 0 : rounded;
};

const alignToStep = (val: number): number => {
  if (!props.stepStrictly) return val;
  const stepVal = props.step;
  const base = props.min;
  const count = Math.round((val - base) / stepVal);
  return roundToPrecision(base + count * stepVal);
};

const clampValue = (val: number): number => {
  let v = Math.min(props.max, Math.max(props.min, val));
  if (props.stepStrictly) {
    v = alignToStep(v);
  }
  return roundToPrecision(v);
};

const formatForEdit = (val: number) => (props.precision != null ? val.toFixed(props.precision) : String(val));

const displayText = computed(() => {
  if (props.formatter) return props.formatter(modelValue.value);
  if (props.precision != null)
    return `${props.labelPrefix}${modelValue.value.toFixed(props.precision)}${props.labelSuffix}`;
  return `${props.labelPrefix}${modelValue.value}${props.labelSuffix}`;
});

const parseValue = (raw: string): number | null => {
  if (props.parser) {
    const r = props.parser(raw);
    return r == null || isNaN(r) ? null : r;
  }
  const n = parseFloat(raw);
  return isNaN(n) ? null : n;
};

const startEditing = () => {
  if (props.disabled || !props.editable) return;
  tempValue.value = formatForEdit(modelValue.value);
  isEditing.value = true;
  nextTick(() => {
    inputRef.value?.focus();
    inputRef.value?.select();
  });
};

const commitInput = () => {
  if (!isEditing.value) return;
  const parsed = parseValue(tempValue.value);
  if (parsed === null) {
    tempValue.value = formatForEdit(modelValue.value);
    isEditing.value = false;
    return;
  }
  isEditing.value = false;
  const nextVal = clampValue(parsed);
  if (nextVal !== modelValue.value) {
    modelValue.value = nextVal;
    emit('change', nextVal);
  }
};

const cancelInput = () => {
  isEditing.value = false;
};

const resolveMultiplier = (e?: { shiftKey?: boolean; altKey?: boolean }) => {
  if (e?.altKey) return 0.1;
  if (e?.shiftKey) return 10;
  return 1;
};

const handleStep = (sign: number, e?: { shiftKey?: boolean; altKey?: boolean }) => {
  if (props.disabled) return;
  const delta = props.step * sign * resolveMultiplier(e);
  let nextVal = roundToPrecision(modelValue.value + delta);

  if (props.loopable) {
    if (nextVal > props.max) nextVal = props.min;
    else if (nextVal < props.min) nextVal = props.max;
  } else {
    nextVal = clampValue(nextVal);
  }

  if (nextVal !== modelValue.value) {
    modelValue.value = nextVal;
    emit('change', nextVal);
  }
};

// 长按连续步进支持
let stepTimer: ReturnType<typeof setTimeout> | null = null;
let stepInterval: ReturnType<typeof setInterval> | null = null;

const stopContinuousStep = () => {
  if (stepTimer) {
    clearTimeout(stepTimer);
    stepTimer = null;
  }
  if (stepInterval) {
    clearInterval(stepInterval);
    stepInterval = null;
  }
};

const startContinuousStep = (sign: number, e: PointerEvent) => {
  if (props.disabled || e.button !== 0) return;
  stopContinuousStep();
  handleStep(sign, e);

  if (!props.autoIncrement) return;

  stepTimer = setTimeout(() => {
    stepInterval = setInterval(() => {
      handleStep(sign, e);
    }, 80);
  }, 350);
};

const handleWheel = (e: WheelEvent) => {
  if (props.disabled || !props.wheelable || isEditing.value) return;
  if (!wrapperRef.value?.contains(document.activeElement)) return;
  e.preventDefault();
  if (e.deltaY < 0) handleStep(1, e);
  else if (e.deltaY > 0) handleStep(-1, e);
};

const handleWrapperKeydown = (e: KeyboardEvent) => {
  if (props.disabled || isEditing.value) return;
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
    e.preventDefault();
    handleStep(1, e);
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
    e.preventDefault();
    handleStep(-1, e);
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    startEditing();
  }
};

onBeforeUnmount(() => {
  stopContinuousStep();
});
</script>
