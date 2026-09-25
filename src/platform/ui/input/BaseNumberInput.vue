<template>
  <div
    :aria-disabled="disabled || undefined"
    :aria-labelledby="rowLabelId"
    :aria-valuemax="max"
    :aria-valuemin="min"
    :aria-valuenow="modelValue"
    :aria-valuetext="displayText"
    :class="[
      currentConfig.wrapperClass,
      variant === 'glass'
        ? // 毛玻璃形态：常用于悬浮容器（如缩放胶囊）内部，自身不投影，阴影由外层容器统一提供
          'border-glass-border bg-surface-panel'
        : 'border-border-light bg-surface-body hover:border-border-base',
      { 'w-full': resolvedWidth === '100%' },
    ]"
    :style="resolvedWidth ? { width: resolvedWidth } : undefined"
    :tabindex="disabled ? -1 : 0"
    @keydown="handleWrapperKeydown($event)"
    @wheel="handleWheel($event)"
    data-focusable-outline
    class="group inline-flex items-center justify-between rounded-full border transition-all duration-fast select-none"
    ref="wrapperRef"
    role="spinbutton"
  >
    <button
      v-wave="{ disabled }"
      :class="currentConfig.btnClass"
      :disabled="disabled || (modelValue <= min && !loopable)"
      @click.prevent
      @pointercancel="stopContinuousStep()"
      @pointerdown="startContinuousStep(-1, $event)"
      @pointerleave="stopContinuousStep()"
      @pointerup="stopContinuousStep()"
      aria-label="减少数值"
      class="flex shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-0 font-extrabold text-fg-muted transition-all duration-fast outline-none group-hover:enabled:text-fg-title hover:enabled:bg-surface-panel-hover active:enabled:scale-90 disabled:cursor-not-allowed disabled:text-fg-disabled"
      tabindex="-1"
      type="button"
    >
      <slot name="minus">
        <BaseIcon v-if="useIcons" class="size-3" name="minus" />
        <template v-else>{{ minusText }}</template>
      </slot>
    </button>

    <input
      v-if="!readonly && isEditing"
      v-model="tempValue"
      :placeholder
      :class="currentConfig.textClass"
      @blur="commitInput()"
      @compositionend="isComposing = false"
      @compositionstart="isComposing = true"
      @keydown.enter="handleEnterKey($event)"
      @keydown.esc="handleEscapeKey($event)"
      class="m-0 w-0 flex-1 [appearance:textfield] border-none bg-transparent p-0 text-center font-[inherit] font-bold text-primary outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      inputmode="numeric"
      ref="inputRef"
      type="text"
    />
    <span
      v-else
      :class="[
        currentConfig.textClass,
        disabled
          ? 'cursor-not-allowed text-fg-disabled'
          : readonly
            ? 'text-fg-title'
            : 'cursor-pointer text-fg-title hover:text-primary',
      ]"
      @click="startEditing()"
      class="flex w-0 flex-1 items-center justify-center font-bold whitespace-nowrap outline-none"
    >
      <!-- 数值变化时逐字符翻页。关掉 aria-live：外层 spinbutton 已通过 aria-valuetext
           播报数值，组件内的 live region 会让屏幕阅读器重复朗读一遍 -->
      <BaseRollingText :text="displayText" aria-live="off" class="tabular-nums" />
    </span>

    <button
      v-wave="{ disabled }"
      :class="currentConfig.btnClass"
      :disabled="disabled || (modelValue >= max && !loopable)"
      @click.prevent
      @pointercancel="stopContinuousStep()"
      @pointerdown="startContinuousStep(1, $event)"
      @pointerleave="stopContinuousStep()"
      @pointerup="stopContinuousStep()"
      aria-label="增加数值"
      class="flex shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-0 font-extrabold text-fg-muted transition-all duration-fast outline-none group-hover:enabled:text-fg-title hover:enabled:bg-surface-panel-hover active:enabled:scale-90 disabled:cursor-not-allowed disabled:text-fg-disabled"
      tabindex="-1"
      type="button"
    >
      <slot name="plus">
        <BaseIcon v-if="useIcons" class="size-3" name="plus" />
        <template v-else>{{ plusText }}</template>
      </slot>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';

import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import BaseRollingText from '@/platform/ui/rolling-text/BaseRollingText.vue';
import { CONTROL_HEIGHT_CLASSES } from '@/platform/ui/controlSizes';
import { FORM_CONTROL_CONTEXT_KEY } from '@/platform/ui/form/formControlContext';
import { useFormRowLabelId } from '@/platform/ui/form/formRowContext';
import { countDecimals } from '@/platform/ui/slider/BaseSlider.logic';
import { clamp } from '@/platform/utils/common';
import { resolveComponentWidth } from '@/platform/utils/constants';

import type { ComponentSize } from '@/platform/types';
import type { FormControlContext } from '@/platform/ui/form/formControlContext';
import type { FormComponentWidth } from '@/platform/utils/constants';

const modelValue = defineModel<number>({ required: true });

const props = withDefaults(
  defineProps<{
    /** 允许的最小值 */
    min?: number;
    /** 允许的最大值 */
    max?: number;
    /** 步进增量（按钮点击/滚轮/方向键的步长） */
    step?: number;
    /** 尺寸档位（影响高度与字号） */
    size?: ComponentSize;
    /** 宽度：预设档位（sm/md/lg/xl/auto/full）或自定义值（数字按 px），默认 md */
    width?: FormComponentWidth;
    /** 视觉变体：default 实底 / glass 玻璃拟态 */
    variant?: 'default' | 'glass';
    /** 是否渲染加减按钮图标（false 时按钮无图标） */
    useIcons?: boolean;
    /** 禁用交互并置灰 */
    disabled?: boolean;
    /** 聚焦时允许滚轮步进 */
    wheelable?: boolean;
    /** 悬停即允许滚轮步进，无需聚焦（与 wheelable 独立；两者同时开启时本项优先，是否聚焦均可） */
    wheelOnHover?: boolean;
    /** 越界时循环到另一端（min/max 首尾相接） */
    loopable?: boolean;
    /** 只读：禁止手动键入编辑（开启后仅能通过按钮/滚轮/方向键步进） */
    readonly?: boolean;
    /** 是否开启严格步长对齐：强制限制数值必须落在 min + k * step 上 */
    stepStrictly?: boolean;
    /** 关闭长按持续自增/自减 */
    noAutoIncrement?: boolean;
    /** 编辑态占位文本 */
    placeholder?: string;
    /** 加号按钮自定义文本（useIcons=false 时生效） */
    plusText?: string;
    /** 减号按钮自定义文本（useIcons=false 时生效） */
    minusText?: string;
    /** 展示值的前缀文案 */
    labelPrefix?: string;
    /** 展示值的后缀文案 */
    labelSuffix?: string;
    /** 自定义展示格式化函数 */
    formatter?: (val: number) => string;
    /** 自定义输入解析函数；返回 null 视为非法并回退原值 */
    parser?: (raw: string) => number | null;
    /** 固定小数位数；未传时按 step 的小数位数取整 */
    precision?: number;
  }>(),
  {
    min: 0,
    max: 100,
    step: 1,
    width: 'md',
    variant: 'default',
    useIcons: false,
    disabled: false,
    wheelable: false,
    wheelOnHover: false,
    loopable: false,
    readonly: false,
    stepStrictly: false,
    noAutoIncrement: false,
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

const emit = defineEmits<{
  (e: 'change', value: number): void;
}>();

// 仅在开发环境中提示非法区间，生产构建时被完全 Tree-shaking
if (import.meta.env.DEV)
  watch(
    () => [props.min, props.max] as const,
    ([min, max]) => {
      if (min > max)
        console.warn(
          `[BaseNumberInput] min (${min}) 不应大于 max (${max})，此时 clamp 结果将恒为 max，步进与循环行为均不可预期。`
        );
    },
    { immediate: true }
  );

const isEditing = ref(false);
const tempValue = ref('');
/**
 * 输入法合成态。行内编辑的 Enter / Esc 都必须先看它：合成期按 Enter 是「确认候选词」，
 * 此时 `v-model` 尚未上屏（Vue 的 vModelText 在 composing 期间不更新），直接提交会拿旧值写回并退出编辑。
 * 与 BaseInput、BaseEditableText 同口径：`e.isComposing` 与本地 ref 都读——个别输入法不置事件字段。
 */
const isComposing = ref(false);
const inputRef = useTemplateRef<HTMLInputElement>('inputRef');
const wrapperRef = useTemplateRef<HTMLDivElement>('wrapperRef');
const resolvedWidth = computed(() => resolveComponentWidth(props.width));
/** 尺寸解析优先级：行内 size props > BaseForm 下发的 FormControlContext > 默认 md */
const controlContext = inject<FormControlContext | null>(FORM_CONTROL_CONTEXT_KEY, null);
const resolvedSize = computed<ComponentSize>(() => props.size ?? controlContext?.size ?? 'md');
/** 所在 BaseFormRow 的标签 id：根元素是 role=spinbutton 的 div，label 的 for 指不到，只能靠 aria-labelledby 关联 */
const rowLabelId = useFormRowLabelId();

const NUMBER_INPUT_CONFIG: Record<'sm' | 'md' | 'lg', { wrapperClass: string; btnClass: string; textClass: string }> = {
  sm: {
    wrapperClass: `${CONTROL_HEIGHT_CLASSES.sm} gap-xs px-xs`,
    btnClass: 'h-[1.1rem] w-[1.1rem] text-xs',
    textClass: 'min-w-[1.5rem] text-2xs',
  },
  md: {
    wrapperClass: `${CONTROL_HEIGHT_CLASSES.md} gap-xs px-xs`,
    btnClass: 'h-[1.3rem] w-[1.3rem] text-xs',
    textClass: 'min-w-[1.75rem] text-xs',
  },
  lg: {
    wrapperClass: `${CONTROL_HEIGHT_CLASSES.lg} gap-xs px-xs`,
    btnClass: 'h-[1.3rem] w-[1.3rem] text-xs',
    textClass: 'min-w-[2.25rem] text-xs',
  },
};

const currentConfig = computed(() => NUMBER_INPUT_CONFIG[resolvedSize.value] ?? NUMBER_INPUT_CONFIG.md);

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
  let v = clamp(val, props.min, props.max);
  if (props.stepStrictly) {
    // 对齐后可能溢出上界（min=0/step=10/max=25 输入 25 → round(2.5)=3 → 30），必须复夹
    v = alignToStep(v);
    v = clamp(v, props.min, props.max);
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

/**
 * 行内编辑的 Enter：合成期放行（见 isComposing 说明），否则提交。
 *
 * `stopPropagation` 不是可选修饰，是这条链路成立的必要条件：input 是外层 wrapper 的子节点，
 * 而 wrapper 上有 `@keydown="handleWrapperKeydown"`。commitInput() 把 isEditing 置 false 之后，
 * 事件继续冒泡到 wrapper——它的守卫 `if (props.disabled || isEditing.value) return` 此刻看到的
 * 已经是不是编辑态了，于是落到末尾的 `Enter/空格 → startEditing()`，把刚退出的编辑又开起来：
 * 回车提交后输入框不消失、光标还在，再按一次才动（且第二次的 Enter 又走同一圈）。
 *
 * 断在源头而非在 wrapper 里补判据：wrapper 那层拿不到「这次 keydown 来自行内 input」的信息
 * （isEditing 已被清），任何基于状态的补判都会与「焦点在别处按 Enter 进入编辑」的正常路径相撞。
 */
const handleEnterKey = (e: KeyboardEvent) => {
  if (e.isComposing || isComposing.value) return;
  e.stopPropagation();
  commitInput();
};

/**
 * 行内编辑的 Esc：合成期放行——Esc 正是取消候选词的键，此时退出编辑会连带丢掉正在输入的内容。
 *
 * **刻意不 stopPropagation**，与上方 Enter 相反：wrapper 没有 Esc 分支，冒泡过去也不会把编辑
 * 重新开起来（那类回环只有 Enter/空格这两条「进入编辑」的分支会触发），故这里不存在需要断掉的
 * 回环。反过来，Esc 有**全局消费者**——浮层在 window 上挂了关闭监听（overlayLifecycle 的
 * onEscape / overlayGuards / escapeDispatcher），断掉传播会让「在浮层里编辑数字时按 Esc 关不掉
 * 浮层」，得按两次。保留冒泡才是一次 Esc 取消编辑、两次关闭浮层的常规层级。
 */
const handleEscapeKey = (e: KeyboardEvent) => {
  if (e.isComposing || isComposing.value) return;
  cancelInput();
};

/** 进入编辑：预填当前值并聚焦全选 */
const startEditing = () => {
  if (props.disabled || props.readonly) return;
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
    // dev 提示：越界输入会被夹紧后写回，主动提示避免使用者误以为原值生效（与 BaseSlider 保持一致）
    if (import.meta.env.DEV && (parsed < props.min || parsed > props.max))
      console.warn(`[BaseNumberInput] 输入值 ${parsed} 超出范围 [${props.min}, ${props.max}]，已自动吸附到范围内。`);

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
  } else nextVal = clampValue(nextVal);

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
  // 编辑态不步进：行内编辑期间值由 tempValue 承载，步进改的是 modelValue，
  // 会被随后的 commitInput() 用旧 tempValue 静默撤销（观感是「点了 + 没反应」）。
  // 与 handleWheel / handleWrapperKeydown 同闸 —— 那两处一直有，只漏了步进按钮。
  if (props.disabled || isEditing.value || e.button !== 0) return;
  stopContinuousStep();
  handleStep(sign, e);

  if (props.noAutoIncrement) return;

  stepTimer = setTimeout(() => {
    stepInterval = setInterval(() => {
      // disabled 中途变 true 时主动停止连发，避免 interval 空转及「解禁后复活续步」的副作用
      if (props.disabled) {
        stopContinuousStep();
        return;
      }
      handleStep(sign, e);
    }, 80);
  }, 350);
};

/**
 * 滚轮步进：两种开启方式（互不影响）——wheelOnHover 悬停即生效、无需聚焦；
 * wheelable 需组件持有焦点。方向默认上滚增值、下滚减值。
 */
const handleWheel = (e: WheelEvent) => {
  if (props.disabled || isEditing.value) return;
  if (!props.wheelOnHover && !(props.wheelable && wrapperRef.value?.contains(document.activeElement))) return;
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

onBeforeUnmount(() => void stopContinuousStep());
</script>
