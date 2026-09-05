<template>
  <div
    :class="[
      currentConfig.wrapperClass,
      vertical ? 'py-sm h-auto flex-col rounded-2xl!' : '',
      tickValues.length && !vertical ? 'h-auto! rounded-2xl! pt-1 pb-5' : '',
      { 'cursor-not-allowed opacity-45': disabled, 'w-full': resolvedWidth === '100%' },
    ]"
    :style="wrapperStyle"
    @wheel="handleWheel"
    class="base-slider bg-bg-body border-border-light gap-sm duration-fast hover:border-border-base has-focus-visible:border-primary has-focus-visible:ring-primary/70 box-border inline-flex items-center justify-center rounded-full border transition-all select-none has-focus-visible:ring-2"
    ref="wrapperRef"
  >
    <span
      v-if="label && (labelPosition === 'left' || (vertical && labelPosition !== 'right'))"
      :class="disabled ? 'cursor-not-allowed' : ''"
      class="text-2xs text-text-disabled px-xs font-semibold whitespace-nowrap"
    >
      {{ label }}
    </span>

    <input
      v-if="showReadout && !isRange && readoutPosition === 'left' && isEditing"
      v-model="editValue"
      :max
      :min
      :step
      @pointerdown.stop
      @blur="commitEdit"
      @keydown.enter="commitEdit"
      @keydown.esc="cancelEdit"
      aria-label="输入精确数值"
      class="text-2xs text-primary bg-bg-body border-border-light focus:border-primary focus:ring-primary/50 h-5 w-16 [appearance:textfield] rounded-sm border text-center font-mono font-bold tabular-nums outline-none focus:ring-1 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      ref="readoutInputRef"
      type="number"
    />
    <span
      v-else-if="showReadout && !isRange && readoutPosition === 'left'"
      :aria-label="
        valueTextClickable ? (props.editable ? '输入精确数值' : `恢复默认值 ${defaultDisplayText}`) : undefined
      "
      :class="
        valueTextClickable
          ? props.editable
            ? 'hover:text-primary cursor-text'
            : 'hover:text-primary cursor-pointer'
          : ''
      "
      :role="valueTextClickable ? 'button' : undefined"
      :tabindex="valueTextClickable ? 0 : -1"
      :title="valueTextClickable ? (props.editable ? '点击输入精确数值' : '点击恢复默认值') : ''"
      @click="handleReadoutClick"
      @keydown.enter.prevent="handleReadoutClick"
      @keydown.space.prevent="handleReadoutClick"
      class="text-2xs text-text-title inline-block min-w-8 rounded-sm text-center font-mono font-bold tabular-nums"
    >
      {{ singleDisplayText }}
    </span>

    <button
      v-if="showButtons && !isRange && !vertical"
      :disabled="disabled || singleValue <= min"
      @click="stepBy(-1, $event)"
      data-focusable-inline
      aria-label="减少"
      class="text-text-disabled hover:text-primary flex cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-0 outline-none disabled:cursor-not-allowed disabled:opacity-30"
      title="减少"
      type="button"
    >
      <BaseIcon aria-hidden="true" icon-size="sm" icon-stroke="thin" name="minus" />
    </button>

    <div
      :class="[
        vertical
          ? 'my-1 h-full min-h-24 w-5 flex-1 before:-inset-x-4 before:inset-y-0'
          : isCustomWidth
            ? 'w-full min-w-16 flex-1 before:inset-x-0 before:-inset-y-4'
            : 'w-24 before:inset-x-0 before:-inset-y-4',
        disabled ? '' : 'cursor-pointer',
      ]"
      @mouseenter="isTrackHovered = true"
      @mouseleave="isTrackHovered = false"
      @pointerdown="handleTrackPointerDown"
      class="group relative flex touch-none items-center justify-center before:absolute before:z-0 before:content-['']"
      ref="trackRef"
    >
      <div
        :class="vertical ? 'inset-y-0 left-1/2 w-1 -translate-x-1/2' : 'inset-x-0 top-1/2 h-1 -translate-y-1/2'"
        class="bg-border-base absolute rounded-full transition-colors"
      />

      <div
        :class="[
          vertical ? 'left-1/2 w-1 -translate-x-1/2' : 'top-1/2 h-1 -translate-y-1/2',
          isDragging === null ? 'transition-all duration-75' : '',
        ]"
        :style="activeBarStyle"
        class="bg-primary pointer-events-none absolute rounded-full"
      />

      <div
        v-if="!isRange"
        :aria-disabled="disabled || undefined"
        :aria-valuemax="max"
        :aria-valuemin="min"
        :aria-valuenow="singleValue"
        :aria-valuetext="singleDisplayText"
        :class="[
          vertical ? 'left-1/2 -translate-x-1/2 -translate-y-1/2' : 'top-1/2 -translate-x-1/2 -translate-y-1/2',
          isDragging === 0 ? 'ring-primary/70 z-float scale-125 ring-2' : 'z-panel transition-all duration-75',
        ]"
        :style="singleThumbStyle"
        @keydown="handleRangeKeydown"
        @mouseenter="isHovered = true"
        @mouseleave="isHovered = false"
        @pointerdown.stop="startDrag(0)"
        class="bg-primary border-bg-body absolute h-3.5 w-3.5 cursor-pointer rounded-full border-2 shadow-sm outline-none group-hover:scale-125 hover:scale-125 active:scale-135"
        role="slider"
        tabindex="0"
      >
        <Transition name="v-transition-fade">
          <div
            v-if="shouldShowTooltip(0)"
            :class="vertical ? 'top-1/2 left-full ml-2 -translate-y-1/2' : 'bottom-full left-1/2 mb-2 -translate-x-1/2'"
            class="bg-bg-elevated border-glass-border text-text-title text-2xs z-float pointer-events-none absolute rounded border px-1.5 py-0.5 font-mono font-bold whitespace-nowrap shadow-md"
          >
            {{ singleDisplayText }}
          </div>
        </Transition>
      </div>

      <template v-else>
        <div
          :aria-valuemax="rangeValues[1]"
          :aria-valuemin="min"
          :aria-valuenow="rangeValues[0]"
          :aria-valuetext="formatVal(rangeValues[0])"
          :class="[
            vertical ? 'left-1/2 -translate-x-1/2 -translate-y-1/2' : 'top-1/2 -translate-x-1/2 -translate-y-1/2',
            isDragging === 0 ? 'ring-primary/70 z-float scale-125 ring-2' : 'z-panel transition-all duration-75',
          ]"
          :style="rangeThumb0Style"
          @keydown="e => handleRangeKeydown(e, 0)"
          @mouseenter="isHoveredThumb0 = true"
          @mouseleave="isHoveredThumb0 = false"
          @pointerdown.stop="startDrag(0)"
          class="bg-primary border-bg-body absolute h-3.5 w-3.5 cursor-pointer rounded-full border-2 shadow-sm outline-none group-hover:scale-125 hover:scale-125 active:scale-135"
          role="slider"
          tabindex="0"
        >
          <Transition name="v-transition-fade">
            <div
              v-if="shouldShowRangeTooltip(0)"
              :class="
                vertical ? 'top-1/2 left-full ml-2 -translate-y-1/2' : 'bottom-full left-1/2 mb-2 -translate-x-1/2'
              "
              class="bg-bg-elevated border-glass-border text-text-title text-2xs z-float pointer-events-none absolute rounded border px-1.5 py-0.5 font-mono font-bold whitespace-nowrap shadow-md"
            >
              {{ formatVal(rangeValues[0]) }}
            </div>
          </Transition>
        </div>

        <div
          :aria-valuemax="max"
          :aria-valuemin="rangeValues[0]"
          :aria-valuenow="rangeValues[1]"
          :aria-valuetext="formatVal(rangeValues[1])"
          :class="[
            vertical ? 'left-1/2 -translate-x-1/2 -translate-y-1/2' : 'top-1/2 -translate-x-1/2 -translate-y-1/2',
            isDragging === 1 ? 'ring-primary/70 z-float scale-125 ring-2' : 'z-panel transition-all duration-75',
          ]"
          :style="rangeThumb1Style"
          @keydown="e => handleRangeKeydown(e, 1)"
          @mouseenter="isHoveredThumb1 = true"
          @mouseleave="isHoveredThumb1 = false"
          @pointerdown.stop="startDrag(1)"
          class="bg-primary border-bg-body absolute h-3.5 w-3.5 cursor-pointer rounded-full border-2 shadow-sm outline-none group-hover:scale-125 hover:scale-125 active:scale-135"
          role="slider"
          tabindex="0"
        >
          <Transition name="v-transition-fade">
            <div
              v-if="shouldShowRangeTooltip(1)"
              :class="
                vertical ? 'top-1/2 left-full ml-2 -translate-y-1/2' : 'bottom-full left-1/2 mb-2 -translate-x-1/2'
              "
              class="bg-bg-elevated border-glass-border text-text-title text-2xs z-float pointer-events-none absolute rounded border px-1.5 py-0.5 font-mono font-bold whitespace-nowrap shadow-md"
            >
              {{ formatVal(rangeValues[1]) }}
            </div>
          </Transition>
        </div>
      </template>

      <div
        v-if="tickValues.length"
        :class="vertical ? 'inset-y-0 right-full mr-2' : 'top-full right-0 left-0 mt-1'"
        aria-hidden="true"
        class="pointer-events-none absolute"
      >
        <div
          v-for="v in tickValues"
          :class="vertical ? 'flex-row justify-end' : 'flex-col'"
          :key="v"
          :style="getTickPositionStyle(v)"
          class="absolute flex items-center"
        >
          <div :class="vertical ? 'bg-border-base h-px w-1.5' : 'bg-border-base h-1.5 w-px'" />
          <span :class="vertical ? 'mr-1' : 'mt-0.5'" class="text-2xs text-text-disabled font-mono whitespace-nowrap">
            {{ markLabel(v) }}
          </span>
        </div>
      </div>
    </div>

    <button
      v-if="showButtons && !isRange && !vertical"
      :disabled="disabled || singleValue >= max"
      @click="stepBy(1, $event)"
      data-focusable-inline
      aria-label="增加"
      class="text-text-disabled hover:text-primary flex cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-0 outline-none disabled:cursor-not-allowed disabled:opacity-30"
      title="增加"
      type="button"
    >
      <BaseIcon aria-hidden="true" icon-size="sm" icon-stroke="thin" name="plus" />
    </button>

    <input
      v-if="showReadout && !isRange && readoutPosition === 'right' && isEditing"
      v-model="editValue"
      :max
      :min
      :step
      @pointerdown.stop
      @blur="commitEdit"
      @keydown.enter="commitEdit"
      @keydown.esc="cancelEdit"
      aria-label="输入精确数值"
      class="text-2xs text-primary bg-bg-body border-border-light focus:border-primary focus:ring-primary/50 h-5 w-16 [appearance:textfield] rounded-sm border text-center font-mono font-bold tabular-nums outline-none focus:ring-1 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      ref="readoutInputRef"
      type="number"
    />
    <span
      v-else-if="showReadout && !isRange && readoutPosition === 'right'"
      :aria-label="
        valueTextClickable ? (props.editable ? '输入精确数值' : `恢复默认值 ${defaultDisplayText}`) : undefined
      "
      :class="
        valueTextClickable
          ? props.editable
            ? 'hover:text-primary cursor-text'
            : 'hover:text-primary cursor-pointer'
          : ''
      "
      :role="valueTextClickable ? 'button' : undefined"
      :tabindex="valueTextClickable ? 0 : -1"
      :title="valueTextClickable ? (props.editable ? '点击输入精确数值' : '点击恢复默认值') : ''"
      @click="handleReadoutClick"
      @keydown.enter.prevent="handleReadoutClick"
      @keydown.space.prevent="handleReadoutClick"
      class="text-2xs text-text-title inline-block min-w-8 rounded-sm text-center font-mono font-bold tabular-nums"
    >
      {{ singleDisplayText }}
    </span>

    <span
      v-if="label && labelPosition === 'right' && !vertical"
      :class="disabled ? 'cursor-not-allowed' : ''"
      class="text-2xs text-text-disabled px-xs font-semibold whitespace-nowrap"
    >
      {{ label }}
    </span>
  </div>
</template>

<script setup generic="R extends boolean = false" lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';

import type { ComponentSize } from '@/platform/types';
import { CONTROL_HEIGHT_CLASSES } from '@/platform/ui/controlSizes';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import { resolveComponentWidth, type FormComponentWidth } from '@/platform/utils/constants';

/** 滑块值的内部统一视图：R 未解析时条件类型无法直接收窄，读写在别名处集中断言 */
type SliderValue = number | [number, number];

const props = withDefaults(
  defineProps<{
    min?: number;
    max?: number;
    step?: number;
    size?: ComponentSize;
    width?: FormComponentWidth;
    height?: string | number;
    label?: string;
    labelPosition?: 'left' | 'right';
    showButtons?: boolean;
    showReadout?: boolean;
    readoutPosition?: 'left' | 'right';
    defaultValue?: R extends true ? [number, number] : number;
    disabled?: boolean;
    wheelable?: boolean;
    editable?: boolean;
    /** 区间模式：开启后 v-model 必须为 [number, number] 元组 */
    range?: R;
    vertical?: boolean;
    showTooltip?: 'always' | 'hover' | 'drag' | 'never';
    formatter?: (val: number) => string;
    marks?: Record<number, string>;
    showTicks?: boolean;
    /** 点击数值文字是否恢复为默认值，默认 true */
    restoreOnValueClick?: boolean;
  }>(),
  {
    min: 0,
    max: 100,
    step: 1,
    size: 'md',
    width: 'auto',
    height: '10rem',
    label: '',
    labelPosition: 'left',
    showButtons: true,
    showReadout: true,
    readoutPosition: 'right',
    disabled: false,
    wheelable: false,
    editable: false,
    vertical: false,
    showTooltip: 'drag',
    formatter: undefined,
    marks: undefined,
    showTicks: false,
    restoreOnValueClick: true,
  }
);

const model = defineModel<R extends true ? [number, number] : number>({ required: true });
/** 内部读写别名：对内暴露统一的 union 视图，仅在别名处集中断言 */
const modelValue = computed({
  get: () => model.value as SliderValue,
  set: (v: SliderValue) => {
    model.value = v as R extends true ? [number, number] : number;
  },
});
/** 对外派发值类型收窄：把统一视图断言回对外泛型形态 */
const emitValue = (v: SliderValue): R extends true ? [number, number] : number =>
  v as R extends true ? [number, number] : number;

// 点击数值文字恢复默认值：默认开启；禁用或区间滑块不可点击
const valueTextClickable = computed(
  () => !isRange.value && !props.disabled && (props.editable || props.restoreOnValueClick)
);

const resolvedDefault = computed<number | [number, number]>(() => {
  if (props.defaultValue !== undefined) return props.defaultValue;
  return isRange.value ? [props.min, props.min] : props.min;
});

const defaultDisplayText = computed(() => {
  const d = resolvedDefault.value;
  if (Array.isArray(d)) return d.map(formatVal).join(' - ');
  return formatVal(d);
});

/** 恢复默认值（禁用态下空操作） */
const restoreDefault = () => {
  if (props.disabled) return;
  updateValue(resolvedDefault.value, { commit: true });
};

// 数值文字点击：可编辑时进入编辑，否则（默认）恢复默认值
const handleReadoutClick = () => {
  if (props.editable && !props.disabled) {
    startEdit();
  } else if (props.restoreOnValueClick && !props.disabled) {
    restoreDefault();
  }
};

const emit = defineEmits<{
  (e: 'change', value: R extends true ? [number, number] : number): void;
  (e: 'drag-start', index: number): void;
  (e: 'drag-end', value: R extends true ? [number, number] : number): void;
}>();

const wrapperRef = useTemplateRef<HTMLDivElement>('wrapperRef');
const trackRef = useTemplateRef<HTMLDivElement>('trackRef');
const readoutInputRef = useTemplateRef<HTMLInputElement>('readoutInputRef');

defineExpose({
  /** 聚焦首个滑块拇指（供父组件调用） */
  focus: () => wrapperRef.value?.querySelector<HTMLElement>('[role="slider"]')?.focus(),
  /** 组件持有焦点时主动失焦 */
  blur: () => {
    if (wrapperRef.value?.contains(document.activeElement) && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  },
});

const isEditing = ref(false);
const editValue = ref('');

const isHovered = ref(false);
const isHoveredThumb0 = ref(false);
const isHoveredThumb1 = ref(false);
const isDragging = ref<number | null>(null);
const dragStartValue = ref<SliderValue | null>(null);

const isRange = computed(() => props.range ?? false);

const singleValue = computed<number>(() =>
  typeof modelValue.value === 'number' ? modelValue.value : (modelValue.value?.[0] ?? props.min)
);

const rangeValues = computed<[number, number]>(() => {
  if (Array.isArray(modelValue.value)) {
    return [modelValue.value[0], modelValue.value[1]];
  }
  return [props.min, typeof modelValue.value === 'number' ? modelValue.value : props.max];
});

const resolvedWidth = computed(() => (props.vertical ? undefined : resolveComponentWidth(props.width)));
const isCustomWidth = computed(() => !props.vertical && props.width !== 'auto' && resolvedWidth.value !== undefined);

const wrapperStyle = computed(() => {
  if (props.vertical) {
    const h = typeof props.height === 'number' ? `${props.height}px` : props.height;
    return { height: h };
  }
  return resolvedWidth.value ? { width: resolvedWidth.value } : {};
});

const SLIDER_CONFIG: Record<'sm' | 'md' | 'lg', { wrapperClass: string }> = {
  sm: { wrapperClass: `${CONTROL_HEIGHT_CLASSES.sm} px-xs` },
  md: { wrapperClass: `${CONTROL_HEIGHT_CLASSES.md} px-sm` },
  lg: { wrapperClass: `${CONTROL_HEIGHT_CLASSES.lg} px-sm` },
};

const currentConfig = computed(() => SLIDER_CONFIG[props.size] ?? SLIDER_CONFIG.md);

/** 计算数值的小数位数（兼容科学计数法表示） */
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

const isTrackHovered = ref(false);
const stepDecimals = computed(() => countDecimals(props.step));

/** 将任意值对齐到步长网格并夹紧到 [min, max]，同时消除浮点误差与负零 */
const snapToStep = (val: number): number => {
  if (!isFinite(val)) return props.min;
  const step = props.step > 0 ? props.step : 1;
  const min = props.min;
  const steps = Math.round((val - min) / step);
  const rawSnapped = min + steps * step;
  const clamped = Math.min(props.max, Math.max(props.min, rawSnapped));
  const decimals = stepDecimals.value;
  const rounded = decimals === 0 ? Math.round(clamped) : Number(clamped.toFixed(decimals));
  return Object.is(rounded, -0) ? 0 : rounded;
};

/** 数值展示文本：优先使用自定义 formatter */
const formatVal = (val: number): string => {
  if (props.formatter) return props.formatter(val);
  return String(val);
};

const singleDisplayText = computed(() => formatVal(singleValue.value));

/** 值在轨道上的百分比位置（0-100，已夹紧） */
const getPct = (val: number) => {
  if (props.max === props.min) return 0;
  return Math.min(100, Math.max(0, ((val - props.min) / (props.max - props.min)) * 100));
};

const singleThumbStyle = computed(() => {
  const pct = getPct(singleValue.value);
  if (props.vertical) {
    return { bottom: `${pct}%`, left: '50%' };
  }
  return { left: `${pct}%`, top: '50%' };
});

const rangeThumb0Style = computed(() => {
  const pct = getPct(rangeValues.value[0]);
  if (props.vertical) return { bottom: `${pct}%`, left: '50%' };
  return { left: `${pct}%`, top: '50%' };
});

const rangeThumb1Style = computed(() => {
  const pct = getPct(rangeValues.value[1]);
  if (props.vertical) return { bottom: `${pct}%`, left: '50%' };
  return { left: `${pct}%`, top: '50%' };
});

const activeBarStyle = computed(() => {
  if (isRange.value) {
    const p0 = getPct(rangeValues.value[0]);
    const p1 = getPct(rangeValues.value[1]);
    const start = Math.min(p0, p1);
    const length = Math.abs(p1 - p0);
    if (props.vertical) {
      return { bottom: `${start}%`, height: `${length}%` };
    }
    return { left: `${start}%`, width: `${length}%` };
  }
  const pct = getPct(singleValue.value);
  if (props.vertical) {
    return { bottom: '0%', height: `${pct}%` };
  }
  return { left: '0%', width: `${pct}%` };
});

/** 单值滑块 tooltip 显隐：按 showTooltip 策略（always/hover/drag/never）判定 */
const shouldShowTooltip = (index: number) => {
  if (props.showTooltip === 'never') return false;
  if (props.showTooltip === 'always') return true;
  if (props.showTooltip === 'drag') return isDragging.value === index;
  if (props.showTooltip === 'hover') return isHovered.value || isTrackHovered.value || isDragging.value === index;
  return false;
};

/** 区间滑块 tooltip 显隐：策略同单值，hover 需区分具体拇指 */
const shouldShowRangeTooltip = (index: number) => {
  if (props.showTooltip === 'never') return false;
  if (props.showTooltip === 'always') return true;
  if (props.showTooltip === 'drag') return isDragging.value === index;
  if (props.showTooltip === 'hover') {
    return (
      (index === 0 ? isHoveredThumb0.value : isHoveredThumb1.value) ||
      isTrackHovered.value ||
      isDragging.value === index
    );
  }
  return false;
};

const tickValues = computed<number[]>(() => {
  if (props.marks && Object.keys(props.marks).length) {
    return Object.keys(props.marks)
      .map(Number)
      .filter(v => v >= props.min && v <= props.max)
      .sort((a, b) => a - b);
  }
  if (!props.showTicks || props.max <= props.min) return [];
  const stepVal = Math.max(props.step, (props.max - props.min) / 20);
  const out: number[] = [];
  for (let v = props.min; v <= props.max + 1e-9; v += stepVal) out.push(snapToStep(v));
  return out;
});

/** 刻度定位样式：按值换算百分比并居中平移 */
const getTickPositionStyle = (v: number) => {
  const pct = getPct(v);
  if (props.vertical) {
    return { bottom: `${pct}%`, transform: 'translateY(50%)' };
  }
  return { left: `${pct}%`, transform: 'translateX(-50%)' };
};

/** 刻度文本：marks 提供标签时优先使用，否则回退数值本身 */
const markLabel = (v: number) => (props.marks ? (props.marks[v] ?? String(v)) : String(v));

/**
 * 统一取值更新入口：夹紧、对齐步长并写回模型；
 * commit 为 true 时额外派发 change（拖拽过程中传 false 避免频繁触发）
 */
const updateValue = (rawNextVal: number | [number, number], options?: { commit?: boolean }) => {
  if (props.disabled) return;
  if (isRange.value) {
    const raw0 = (Array.isArray(rawNextVal) ? rawNextVal[0] : rawNextVal) ?? props.min;
    const raw1 = (Array.isArray(rawNextVal) ? rawNextVal[1] : rawNextVal) ?? props.max;
    const c0 = snapToStep(Math.min(props.max, Math.max(props.min, raw0)));
    const c1 = snapToStep(Math.min(props.max, Math.max(props.min, raw1)));
    const nextArr: [number, number] = [Math.min(c0, c1), Math.max(c0, c1)];
    modelValue.value = nextArr;
    if (options?.commit) emit('change', emitValue(nextArr));
  } else {
    const raw = typeof rawNextVal === 'number' ? rawNextVal : (rawNextVal[0] ?? props.min);
    const snapped = snapToStep(raw);
    if (snapped !== modelValue.value) {
      modelValue.value = snapped;
    }
    if (options?.commit) emit('change', emitValue(snapped));
  }
};

/** 修饰键步进倍率：Alt 精调 ×0.1，Shift 粗调 ×10 */
const resolveMultiplier = (e?: { shiftKey?: boolean; altKey?: boolean }) => {
  if (e?.altKey) return 0.1;
  if (e?.shiftKey) return 10;
  return 1;
};

/** 按符号步进（区间模式作用于指定拇指），支持修饰键倍率 */
const stepBy = (sign: number, e?: { shiftKey?: boolean; altKey?: boolean }, thumbIdx = 0) => {
  const delta = props.step * sign * resolveMultiplier(e);
  if (isRange.value) {
    const [v0, v1] = rangeValues.value;
    if (thumbIdx === 0) updateValue([v0 + delta, v1], { commit: true });
    else updateValue([v0, v1 + delta], { commit: true });
  } else {
    updateValue(singleValue.value + delta, { commit: true });
  }
};

/** 拇指键盘方向键步进 */
const handleRangeKeydown = (e: KeyboardEvent, thumbIdx = 0) => {
  if (props.disabled) return;
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
    e.preventDefault();
    stepBy(1, e, thumbIdx);
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
    e.preventDefault();
    stepBy(-1, e, thumbIdx);
  }
};

/** 指针坐标 → 轨道值：按横向/纵向换算比例并吸附步长 */
const calculateValueFromPointer = (e: PointerEvent): number => {
  if (!trackRef.value) return props.min;
  const rect = trackRef.value.getBoundingClientRect();
  const ratio = Math.max(
    0,
    Math.min(1, props.vertical ? (rect.bottom - e.clientY) / rect.height : (e.clientX - rect.left) / rect.width)
  );
  const raw = props.min + ratio * (props.max - props.min);
  return snapToStep(raw);
};

/** 拖拽中：根据指针位置实时更新对应拇指的值（不派发 change） */
const onPointerMove = (e: PointerEvent) => {
  if (isDragging.value === null) return;
  const val = calculateValueFromPointer(e);
  if (isRange.value) {
    const [v0, v1] = rangeValues.value;
    if (isDragging.value === 0) {
      updateValue([val, v1], { commit: false });
    } else {
      updateValue([v0, val], { commit: false });
    }
  } else {
    updateValue(val, { commit: false });
  }
};

/** 拖拽结束判断值是否变化：数组按分量比较，其余严格相等 */
const isValueEqual = (v1: unknown, v2: unknown) => {
  if (Array.isArray(v1) && Array.isArray(v2)) {
    return v1[0] === v2[0] && v1[1] === v2[1];
  }
  return v1 === v2;
};

// 仅在开发环境中提示非法区间，生产构建时被完全 Tree-shaking
if (import.meta.env.DEV) {
  watch(
    () => [props.min, props.max] as const,
    ([min, max]) => {
      if (min > max) {
        console.warn(`[BaseSlider] min (${min}) 不应大于 max (${max})，滑块取值区间将坍缩为 max。`);
      }
    },
    { immediate: true }
  );
}

/** 拖拽结束：派发 drag-end，值有变化时补发 change，并解绑全局指针监听 */
const onPointerUp = () => {
  if (isDragging.value !== null) {
    isDragging.value = null;
    emit('drag-end', emitValue(modelValue.value));
    if (!isValueEqual(dragStartValue.value, modelValue.value)) {
      emit('change', emitValue(modelValue.value));
    }
  }
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
};

/** 开始拖拽指定拇指：记录起始值、派发 drag-start 并挂载全局指针监听 */
const startDrag = (thumbIndex: number) => {
  if (props.disabled) return;
  isDragging.value = thumbIndex;
  dragStartValue.value = Array.isArray(modelValue.value) ? [...modelValue.value] : modelValue.value;
  emit('drag-start', thumbIndex);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
};

/** 点击轨道：就近选中拇指并直接跳到点击位置 */
const handleTrackPointerDown = (e: PointerEvent) => {
  if (props.disabled) return;
  const clickedVal = calculateValueFromPointer(e);
  if (isRange.value) {
    const [v0, v1] = rangeValues.value;
    const d0 = Math.abs(clickedVal - v0);
    const d1 = Math.abs(clickedVal - v1);
    const targetThumb = d0 <= d1 ? 0 : 1;
    startDrag(targetThumb);
    if (targetThumb === 0) updateValue([clickedVal, v1], { commit: false });
    else updateValue([v0, clickedVal], { commit: false });
  } else {
    startDrag(0);
    updateValue(clickedVal, { commit: false });
  }
};

/** 滚轮步进：仅在 wheelable 且组件持有焦点时生效 */
const handleWheel = (e: WheelEvent) => {
  if (props.disabled || !props.wheelable || isEditing.value) return;
  if (!wrapperRef.value?.contains(document.activeElement)) return;
  e.preventDefault();
  if (e.deltaY > 0) stepBy(-1, e);
  else if (e.deltaY < 0) stepBy(1, e);
};

/** 进入精确数值编辑：预填当前值并聚焦全选输入框 */
const startEdit = () => {
  if (!props.editable || props.disabled || isRange.value) return;
  editValue.value = String(singleValue.value);
  isEditing.value = true;
  nextTick(() => {
    readoutInputRef.value?.focus();
    readoutInputRef.value?.select();
  });
};

/** 提交编辑：解析失败则静默取消，成功则对齐步长写回并派发 change */
const commitEdit = () => {
  if (!isEditing.value) return;
  isEditing.value = false;
  const parsed = parseFloat(editValue.value);
  if (isNaN(parsed)) return;
  updateValue(parsed, { commit: true });
};

/** 取消编辑，丢弃未提交内容 */
const cancelEdit = () => {
  isEditing.value = false;
};

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
});
</script>
