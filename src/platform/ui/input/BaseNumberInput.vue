<template>
  <div
    :aria-disabled="disabled || undefined"
    :aria-valuemax="max"
    :aria-valuemin="min"
    :aria-valuenow="modelValue"
    :aria-valuetext="displayText"
    :class="[currentConfig.wrapperClass, { 'w-full': resolvedWidth === '100%' }]"
    :style="resolvedWidth ? { width: resolvedWidth } : undefined"
    :tabindex="disabled ? -1 : 0"
    @keydown="handleWrapperKeydown"
    @wheel="handleWheel"
    class="group bg-bg-body border-border-light duration-fast hover:border-border-base focus-within:border-primary focus-within:ring-primary/70 box-border inline-flex items-center justify-between rounded-full border transition-all select-none focus-within:ring-2"
    ref="wrapperRef"
    role="spinbutton"
  >
    <button
      v-wave="{ disabled }"
      :class="currentConfig.btnClass"
      :disabled="disabled || (modelValue <= min && !loopable)"
      @click.prevent
      @pointercancel="stopContinuousStep"
      @pointerdown="startContinuousStep(-1, $event)"
      @pointerleave="stopContinuousStep"
      @pointerup="stopContinuousStep"
      aria-label="减少数值"
      class="text-text-muted group-hover:enabled:text-text-title duration-fast hover:enabled:bg-bg-panel-hover flex shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-0 font-extrabold transition-all outline-none active:enabled:scale-90 disabled:cursor-not-allowed disabled:opacity-30"
      tabindex="-1"
      type="button"
    >
      <slot name="minus">
        {{ minusText }}
      </slot>
    </button>

    <input
      v-if="editable && isEditing"
      v-model="tempValue"
      :placeholder
      :class="currentConfig.textClass"
      @blur="commitInput"
      @keydown.enter="commitInput"
      @keydown.esc="cancelInput"
      class="text-primary m-0 box-border w-0 flex-1 [appearance:textfield] border-none bg-transparent p-0 text-center font-[inherit] font-bold outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      inputmode="numeric"
      ref="inputRef"
      type="text"
    />
    <span
      v-else
      :class="[
        currentConfig.textClass,
        disabled
          ? 'text-text-disabled cursor-not-allowed'
          : editable
            ? 'text-text-title hover:text-primary cursor-pointer'
            : 'text-text-title',
      ]"
      @click="startEditing"
      class="w-0 flex-1 text-center font-bold whitespace-nowrap outline-none"
    >
      {{ displayText }}
    </span>

    <button
      v-wave="{ disabled }"
      :class="currentConfig.btnClass"
      :disabled="disabled || (modelValue >= max && !loopable)"
      @click.prevent
      @pointercancel="stopContinuousStep"
      @pointerdown="startContinuousStep(1, $event)"
      @pointerleave="stopContinuousStep"
      @pointerup="stopContinuousStep"
      aria-label="增加数值"
      class="text-text-muted group-hover:enabled:text-text-title duration-fast hover:enabled:bg-bg-panel-hover flex shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-0 font-extrabold transition-all outline-none active:enabled:scale-90 disabled:cursor-not-allowed disabled:opacity-30"
      tabindex="-1"
      type="button"
    >
      <slot name="plus"> {{ plusText }} </slot>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';

import type { ComponentSize } from '@/platform/types';
import { CONTROL_HEIGHT_CLASSES } from '@/platform/ui/controlSizes';
import { resolveComponentWidth, type FormComponentWidth } from '@/platform/utils/constants';

const props = withDefaults(
  defineProps<{
    min?: number;
    max?: number;
    step?: number;
    size?: ComponentSize;
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

// 仅在开发环境中提示非法区间，生产构建时被完全 Tree-shaking
if (import.meta.env.DEV) {
  watch(
    () => [props.min, props.max] as const,
    ([min, max]) => {
      if (min > max) {
        console.warn(
          `[BaseNumberInput] min (${min}) 不应大于 max (${max})，此时 clamp 结果将恒为 max，步进与循环行为均不可预期。`
        );
      }
    },
    { immediate: true }
  );
}

const isEditing = ref(false);
const tempValue = ref('');
const inputRef = useTemplateRef<HTMLInputElement>('inputRef');
const wrapperRef = useTemplateRef<HTMLDivElement>('wrapperRef');
const resolvedWidth = computed(() => resolveComponentWidth(props.width));

const NUMBER_INPUT_CONFIG: Record<'sm' | 'md' | 'lg', { wrapperClass: string; btnClass: string; textClass: string }> = {
  sm: {
    wrapperClass: `${CONTROL_HEIGHT_CLASSES.sm} px-xs gap-xs`,
    btnClass: 'w-[1.1rem] h-[1.1rem] text-xs',
    textClass: 'text-2xs min-w-[1.5rem]',
  },
  md: {
    wrapperClass: `${CONTROL_HEIGHT_CLASSES.md} px-xs gap-xs`,
    btnClass: 'w-[1.3rem] h-[1.3rem] text-xs',
    textClass: 'text-xs min-w-[1.75rem]',
  },
  lg: {
    wrapperClass: `${CONTROL_HEIGHT_CLASSES.lg} px-xs gap-xs`,
    btnClass: 'w-[1.3rem] h-[1.3rem] text-xs',
    textClass: 'text-xs min-w-[2.25rem]',
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

/** 严格步长对齐：把值吸附到 min + k * step */
const alignToStep = (val: number): number => {
  if (!props.stepStrictly) return val;
  const stepVal = props.step;
  const base = props.min;
  const count = Math.round((val - base) / stepVal);
  return roundToPrecision(base + count * stepVal);
};

/** 夹紧到 [min, max]，按需对齐步长并按精度取整 */
const clampValue = (val: number): number => {
  let v = Math.min(props.max, Math.max(props.min, val));
  if (props.stepStrictly) {
    v = alignToStep(v);
  }
  return roundToPrecision(v);
};

/** 编辑态初值：指定 precision 时固定位数展示 */
const formatForEdit = (val: number) => (props.precision != null ? val.toFixed(props.precision) : String(val));

const displayText = computed(() => {
  if (props.formatter) return props.formatter(modelValue.value);
  if (props.precision != null)
    return `${props.labelPrefix}${modelValue.value.toFixed(props.precision)}${props.labelSuffix}`;
  return `${props.labelPrefix}${modelValue.value}${props.labelSuffix}`;
});

/** 解析输入文本为数值：自定义 parser 优先，非法返回 null */
const parseValue = (raw: string): number | null => {
  if (props.parser) {
    const r = props.parser(raw);
    return r == null || isNaN(r) ? null : r;
  }
  const n = parseFloat(raw);
  return isNaN(n) ? null : n;
};

/** 进入编辑：预填当前值并聚焦全选 */
const startEditing = () => {
  if (props.disabled || !props.editable) return;
  tempValue.value = formatForEdit(modelValue.value);
  isEditing.value = true;
  nextTick(() => {
    inputRef.value?.focus();
    inputRef.value?.select();
  });
};

/** 提交编辑：解析失败回退原值，成功则夹紧写回并派发 change */
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

/** 取消编辑，丢弃未提交内容 */
const cancelInput = () => {
  isEditing.value = false;
};

/** 修饰键步进倍率：Alt 精调 ×0.1，Shift 粗调 ×10 */
const resolveMultiplier = (e?: { shiftKey?: boolean; altKey?: boolean }) => {
  if (e?.altKey) return 0.1;
  if (e?.shiftKey) return 10;
  return 1;
};

/** 步进核心：loopable 时环形回绕，否则夹紧边界 */
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

/** 停止长按连发：清理延时与 interval */
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

/** 长按连发：立即步进一次，延时后按固定间隔重复 */
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

/** 滚轮步进：仅在 wheelable 且组件持有焦点时生效 */
const handleWheel = (e: WheelEvent) => {
  if (props.disabled || !props.wheelable || isEditing.value) return;
  if (!wrapperRef.value?.contains(document.activeElement)) return;
  e.preventDefault();
  if (e.deltaY < 0) handleStep(1, e);
  else if (e.deltaY > 0) handleStep(-1, e);
};

/** 键盘：方向键步进，回车 / 空格进入编辑 */
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
