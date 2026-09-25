<template>
  <div
    :class="[
      currentConfig.wrapperClass,
      vertical ? 'h-auto flex-col rounded-2xl! py-sm' : '',
      tickValues.length && !vertical ? 'h-auto! rounded-2xl! pt-1 pb-5' : '',
      borderless ? 'border-transparent hover:border-transparent' : 'border-border-light hover:border-border-base',
      { 'cursor-not-allowed opacity-45': disabled, 'w-full': resolvedWidth === '100%' },
    ]"
    :style="wrapperStyle"
    data-focusable-outline
    class="base-slider inline-flex items-center justify-center gap-1 rounded-full border bg-surface-body transition-all duration-fast select-none"
    ref="wrapperRef"
  >
    <span
      v-if="label && (labelPosition === 'left' || (vertical && labelPosition !== 'right'))"
      :class="disabled ? 'cursor-not-allowed' : ''"
      class="px-xs text-2xs font-semibold whitespace-nowrap text-fg-disabled"
    >
      {{ label }}
    </span>

    <input
      v-if="!hideReadout && !isRange && readoutPosition === 'left' && isEditing"
      v-model="editValue"
      :max
      :min
      :step
      :class="readoutInputClass"
      @pointerdown.stop
      @blur="commitEdit()"
      @keydown.enter="commitEdit()"
      @keydown.esc="cancelEdit()"
      data-focusable-outline
      aria-label="输入精确数值"
      class="h-5 [appearance:textfield] rounded-sm border border-border-light bg-surface-body text-center font-mono text-2xs font-bold text-primary tabular-nums outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      ref="readoutInputRef"
      type="number"
    />
    <span
      v-else-if="!hideReadout && !isRange && readoutPosition === 'left'"
      :aria-label="
        valueTextClickable ? (props.editable ? '输入精确数值' : `恢复默认值 ${defaultDisplayText}`) : undefined
      "
      :class="[
        valueTextClickable
          ? props.editable
            ? 'cursor-text hover:text-primary'
            : 'cursor-pointer hover:text-primary'
          : '',
        readoutSpanClass,
      ]"
      :role="valueTextClickable ? 'button' : undefined"
      :tabindex="valueTextClickable ? 0 : -1"
      :title="valueTextClickable ? (props.editable ? '点击输入精确数值' : '点击恢复默认值') : ''"
      @click="handleReadoutClick()"
      @keydown.enter.prevent="handleReadoutClick()"
      @keydown.space.prevent="handleReadoutClick()"
      class="inline-block rounded-sm text-center font-mono text-2xs font-bold text-fg-title tabular-nums"
    >
      <BaseRollingText :text="singleDisplayText" />
    </span>

    <button
      v-if="!hideButtons && !isRange && !vertical"
      :disabled="disabled || singleValue <= min"
      @click="stepBy(-1, $event)"
      data-focusable-outline
      aria-label="减少"
      class="flex cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-0 text-fg-disabled outline-none hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
      title="减少"
      type="button"
    >
      <BaseIcon aria-hidden="true" icon-size="sm" icon-stroke="thin" name="minus" />
    </button>

    <!-- 轨道 mx-1.5 专为 ± 步进按钮留白；hideButtons 时归零，
         读数/容器与轨道间距只吃 wrapper gap-sm，formatter 不再离轨道过远。
         自定义宽度下轨道必须可收缩（min-w-0）：否则当宽度档位（如 sm=5.5rem）小于
         各配件最小宽度之和时内容会溢出 wrapper，并被 justify-center 均分到左右两侧 -->
    <div
      :class="[
        vertical
          ? 'my-1 h-full min-h-24 w-5 flex-1 before:-inset-x-4 before:inset-y-0'
          : isCustomWidth
            ? `${hideButtons ? 'mx-0' : 'mx-1.5'} w-full min-w-0 flex-1 before:inset-x-0 ${currentConfig.hitClass}`
            : `${hideButtons ? 'mx-0' : 'mx-1.5'} ${currentConfig.autoWidth} before:inset-x-0 ${currentConfig.hitClass}`,
        disabled ? '' : 'cursor-pointer',
      ]"
      @mouseenter="isTrackHovered = true"
      @mouseleave="isTrackHovered = false"
      @pointerdown="handleTrackPointerDown($event)"
      @wheel="handleWheel($event)"
      class="group relative flex touch-none items-center justify-center before:absolute before:z-0 before:content-['']"
      ref="trackRef"
    >
      <!-- 内缩定位层：相对轨道各缩进约一个拇指半径（含 hover/拖拽放大裕量），填充条/基线/拇指共用同一坐标空间，保证极值时拇指整体落在胶囊边框内而不是顶框 -->
      <div
        :class="
          vertical
            ? `absolute inset-x-0 ${currentConfig.insetClassV}`
            : `absolute inset-y-0 ${currentConfig.insetClass}`
        "
      >
        <div
          :class="
            vertical
              ? `left-1/2 ${currentConfig.barClassV} -translate-x-1/2`
              : `inset-x-0 top-1/2 ${currentConfig.barClass} -translate-y-1/2`
          "
          class="absolute rounded-full bg-border-base transition-colors"
        />

        <div
          :class="[
            vertical
              ? `left-1/2 ${currentConfig.barClassV} -translate-x-1/2`
              : `top-1/2 ${currentConfig.barClass} -translate-y-1/2`,
            isDragging === null ? 'transition-all duration-75' : '',
          ]"
          :style="activeBarStyle"
          class="pointer-events-none absolute rounded-full bg-primary"
        />

        <div
          v-if="!isRange"
          v-tooltip.manual.compact="singleTooltipOpts"
          :aria-disabled="disabled || undefined"
          :aria-labelledby="rowLabelId"
          :aria-valuemax="max"
          :aria-valuemin="min"
          :aria-valuenow="singleValue"
          :aria-valuetext="singleDisplayText"
          :class="[
            vertical ? 'left-1/2 -translate-1/2' : 'top-1/2 -translate-1/2',
            isDragging === 0
              ? 'z-float scale-125 ring-2 ring-tint-primary-30'
              : 'z-panel transition-[left,top,bottom,transform] duration-150 ease-out',
            currentConfig.thumbClass,
          ]"
          :style="singleThumbStyle"
          @keydown="handleRangeKeydown($event)"
          @mouseenter="isHovered = true"
          @mouseleave="isHovered = false"
          @pointerdown.stop="startDrag(0)"
          class="absolute cursor-pointer rounded-full border-2 border-surface-body bg-primary shadow-sm outline-none group-hover:scale-125 hover:scale-125 active:scale-135"
          role="slider"
          tabindex="0"
        ></div>

        <template v-else>
          <div
            v-tooltip.compact.manual="rangeTooltip0Opts"
            :aria-labelledby="rowLabelId"
            :aria-valuemax="rangeValues[1]"
            :aria-valuemin="min"
            :aria-valuenow="rangeValues[0]"
            :aria-valuetext="formatVal(rangeValues[0])"
            :class="[
              vertical ? 'left-1/2 -translate-1/2' : 'top-1/2 -translate-1/2',
              isDragging === 0
                ? 'z-float scale-125 ring-2 ring-tint-primary-30'
                : 'z-panel transition-[left,top,bottom,transform] duration-150 ease-out',
              currentConfig.thumbClass,
            ]"
            :style="rangeThumb0Style"
            @keydown="handleRangeKeydown($event, 0)"
            @mouseenter="isHoveredThumb0 = true"
            @mouseleave="isHoveredThumb0 = false"
            @pointerdown.stop="startDrag(0)"
            class="absolute cursor-pointer rounded-full border-2 border-surface-body bg-primary shadow-sm outline-none group-hover:scale-125 hover:scale-125 active:scale-135"
            role="slider"
            tabindex="0"
          ></div>

          <div
            v-tooltip.compact.manual="rangeTooltip1Opts"
            :aria-labelledby="rowLabelId"
            :aria-valuemax="max"
            :aria-valuemin="rangeValues[0]"
            :aria-valuenow="rangeValues[1]"
            :aria-valuetext="formatVal(rangeValues[1])"
            :class="[
              vertical ? 'left-1/2 -translate-1/2' : 'top-1/2 -translate-1/2',
              isDragging === 1
                ? 'z-float scale-125 ring-2 ring-tint-primary-30'
                : 'z-panel transition-[left,top,bottom,transform] duration-150 ease-out',
              currentConfig.thumbClass,
            ]"
            :style="rangeThumb1Style"
            @keydown="handleRangeKeydown($event, 1)"
            @mouseenter="isHoveredThumb1 = true"
            @mouseleave="isHoveredThumb1 = false"
            @pointerdown.stop="startDrag(1)"
            class="absolute cursor-pointer rounded-full border-2 border-surface-body bg-primary shadow-sm outline-none group-hover:scale-125 hover:scale-125 active:scale-135"
            role="slider"
            tabindex="0"
          ></div>
        </template>
      </div>

      <div
        v-if="tickValues.length"
        :class="vertical ? 'inset-y-0 right-full mr-2' : 'inset-x-0 top-full mt-1'"
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
          <div :class="vertical ? 'h-px w-1.5 bg-border-base' : 'h-1.5 w-px bg-border-base'" />
          <span :class="vertical ? 'mr-1' : 'mt-0.5'" class="font-mono text-2xs whitespace-nowrap text-fg-disabled">
            {{ markLabel(v) }}
          </span>
        </div>
      </div>
    </div>

    <button
      v-if="!hideButtons && !isRange && !vertical"
      :disabled="disabled || singleValue >= max"
      @click="stepBy(1, $event)"
      data-focusable-outline
      aria-label="增加"
      class="flex cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-0 text-fg-disabled outline-none hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
      title="增加"
      type="button"
    >
      <BaseIcon aria-hidden="true" icon-size="sm" icon-stroke="thin" name="plus" />
    </button>

    <input
      v-if="!hideReadout && !isRange && readoutPosition === 'right' && isEditing"
      v-model="editValue"
      :max
      :min
      :step
      :class="readoutInputClass"
      @pointerdown.stop
      @blur="commitEdit()"
      @keydown.enter="commitEdit()"
      @keydown.esc="cancelEdit()"
      data-focusable-outline
      aria-label="输入精确数值"
      class="h-5 [appearance:textfield] rounded-sm border border-border-light bg-surface-body text-center font-mono text-2xs font-bold text-primary tabular-nums outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      ref="readoutInputRef"
      type="number"
    />
    <span
      v-else-if="!hideReadout && !isRange && readoutPosition === 'right'"
      :aria-label="
        valueTextClickable ? (props.editable ? '输入精确数值' : `恢复默认值 ${defaultDisplayText}`) : undefined
      "
      :class="[
        valueTextClickable
          ? props.editable
            ? 'cursor-text hover:text-primary'
            : 'cursor-pointer hover:text-primary'
          : '',
        readoutSpanClass,
      ]"
      :role="valueTextClickable ? 'button' : undefined"
      :tabindex="valueTextClickable ? 0 : -1"
      :title="valueTextClickable ? (props.editable ? '点击输入精确数值' : '点击恢复默认值') : ''"
      @click="handleReadoutClick()"
      @keydown.enter.prevent="handleReadoutClick()"
      @keydown.space.prevent="handleReadoutClick()"
      class="inline-block rounded-sm text-center font-mono text-2xs font-bold text-fg-title tabular-nums"
    >
      <BaseRollingText :text="singleDisplayText" />
    </span>

    <span
      v-if="label && labelPosition === 'right' && !vertical"
      :class="disabled ? 'cursor-not-allowed' : ''"
      class="px-xs text-2xs font-semibold whitespace-nowrap text-fg-disabled"
    >
      {{ label }}
    </span>
  </div>
</template>

<script setup generic="R extends boolean = false" lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';

import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import BaseRollingText from '@/platform/ui/rolling-text/BaseRollingText.vue';
import { FORM_CONTROL_CONTEXT_KEY } from '@/platform/ui/form/formControlContext';
import { useFormRowLabelId } from '@/platform/ui/form/formRowContext';
import { useSliderInteraction } from '@/platform/ui/slider/useSliderInteraction';
import { clamp } from '@/platform/utils/common';
import { resolveComponentWidth } from '@/platform/utils/constants';

import {
  activeBarStyleOf,
  computeTickValues,
  countDecimals,
  isValueEqual,
  markLabelOf,
  SLIDER_CONFIG,
  thumbPositionStyle,
  tickPositionStyle,
} from './BaseSlider.logic';

import type { TooltipOptions } from '@/platform/directives/vTooltip';
import type { ComponentSize } from '@/platform/types';
import type { FormControlContext } from '@/platform/ui/form/formControlContext';
import type { SliderValue } from '@/platform/ui/slider/useSliderInteraction';
import type { FormComponentWidth } from '@/platform/utils/constants';

const model = defineModel<R extends true ? [number, number] : number>({ required: true });

const props = withDefaults(
  defineProps<{
    /** 最小值 */
    min?: number;
    /** 最大值 */
    max?: number;
    /** 步进增量（拖拽/按钮/键盘的步长） */
    step?: number;
    /** 尺寸档位（影响轨道高度与圆点大小） */
    size?: ComponentSize;
    /** 轨道宽度：预设档位（sm/md/lg/xl/auto/full）或自定义值（数字按 px），默认 md */
    width?: FormComponentWidth;
    /** 自定义轨道高度（数字按 px）；vertical 模式下为轨道总高 */
    height?: string | number;
    /** 外部标签文本（配合 labelPosition 渲染在轨道两侧） */
    label?: string;
    /** 标签位置：left 轨道左侧 / right 轨道右侧 */
    labelPosition?: 'left' | 'right';
    /** 隐藏加减步进按钮 */
    hideButtons?: boolean;
    /** 隐藏当前值读数 */
    hideReadout?: boolean;
    /** 读数位置：left 轨道左侧 / right 轨道右侧 */
    readoutPosition?: 'left' | 'right';
    /** 非受控时的初始值（range 模式为 [min, max] 元组） */
    defaultValue?: R extends true ? [number, number] : number;
    /** 禁用交互并置灰 */
    disabled?: boolean;
    /** 聚焦时允许滚轮步进（需先聚焦到滑块拇指才会生效；且滚轮必须发生在轨道/拇指上，在标签、按钮、读数等区域滚动不触发） */
    wheelable?: boolean;
    /** 悬停在轨道/拇指上即允许滚轮步进，无需聚焦（与 wheelable 独立；两者同时开启时本项优先，是否聚焦均可） */
    wheelOnHover?: boolean;
    /** 反向滚轮方向：true 时上滚减值、下滚增值（默认滚动方向与之相反） */
    reverseWheel?: boolean;
    /** 是否显示数值编辑输入框（点击读数进入编辑） */
    editable?: boolean;
    /** 区间模式：开启后 v-model 必须为 [number, number] 元组 */
    range?: R;
    /** 是否纵向滑块（轨道竖排，值从下往上增大） */
    vertical?: boolean;
    /** 拇指 tooltip 显隐策略：always 恒显 / hover 悬停 / drag 拖拽中 / never 隐藏 */
    showTooltip?: 'always' | 'hover' | 'drag' | 'never';
    /** 数值展示格式化函数（读数与 tooltip 共用） */
    formatter?: (val: number) => string;
    /** 刻度标记：数值 → 标签文本（提供后按其绘制刻度） */
    marks?: Record<number, string>;
    /** 无 marks 时是否按步长自动绘制刻度线 */
    showTicks?: boolean;
    /** 关闭「点击数值文字恢复默认值」 */
    noRestoreOnValueClick?: boolean;
    /** 关闭胶囊边框（默认显示；关闭时以透明边框占位，布局不位移）。
     *  此前实现误置 false、与本文档不符，已按文档校正为 true —— 胶囊底 `bg-surface-body`
     *  与页面底同色，没有描边就只剩一条无界色带，与全站控件的静止发丝描边不一致 */
    borderless?: boolean;
    /** v-model.lazy 修饰符载体：vue-tsc 对泛型组件的 defineModel 解构未生成该 prop 类型，此处显式声明 */
    modelModifiers?: { lazy?: boolean };
  }>(),
  {
    min: 0,
    max: 100,
    step: 1,
    size: undefined,
    width: 'md',
    height: '10rem',
    label: '',
    labelPosition: 'left',
    hideButtons: false,
    hideReadout: false,
    readoutPosition: 'right',
    disabled: false,
    wheelable: false,
    wheelOnHover: false,
    reverseWheel: false,
    editable: false,
    vertical: false,
    showTooltip: 'drag',
    formatter: undefined,
    marks: undefined,
    showTicks: false,
    noRestoreOnValueClick: false,
    borderless: false,
  }
);

const emit = defineEmits<{
  (e: 'change', value: R extends true ? [number, number] : number): void;
  (e: 'drag-start', index: number): void;
  (e: 'drag-end', value: R extends true ? [number, number] : number): void;
}>();
/** lazy 修饰符：拖拽过程中只更新本地显示值，松手（drag-end）或按钮/编辑提交时才写回 model */
const isLazy = computed(() => Boolean(props.modelModifiers?.lazy));
/** 尺寸解析：行内 props > BaseForm 注入上下文 > 默认 md */
const controlContext = inject<FormControlContext | null>(FORM_CONTROL_CONTEXT_KEY, null);
const resolvedSize = computed<ComponentSize>(() => props.size ?? controlContext?.size ?? 'md');
/** 所在 BaseFormRow 的标签 id：滑块是 role=slider 的 div，label 的 for 指不到，只能靠 aria-labelledby 关联 */
const rowLabelId = useFormRowLabelId();
/** 内部即时值：lazy 模式下拖拽中间态先落在这里，避免逐帧写回 model（初值为一次性快照，后续由 watch 同步；AST 规则误报豁免） */
// eslint-disable-next-line vue/no-ref-object-reactivity-loss
const localValue = ref<SliderValue>(model.value as SliderValue);
// 外部 model 变化时同步本地显示值（拖拽期间 lazy 不会写 model，无回环风险）
watch(model, v => {
  localValue.value = v as SliderValue;
});
/** 内部读写别名：对内暴露统一的 union 视图；非 lazy 时即时同步回 model */
const modelValue = computed({
  get: () => localValue.value,
  set: (v: SliderValue) => {
    localValue.value = v;
    if (!isLazy.value) model.value = v as R extends true ? [number, number] : number;
  },
});
/** 对外派发值类型收窄：把统一视图断言回对外泛型形态 */
const emitValue = (v: SliderValue): R extends true ? [number, number] : number =>
  v as R extends true ? [number, number] : number;

// 点击数值文字恢复默认值：默认开启；禁用或区间滑块不可点击
const valueTextClickable = computed(
  () => !isRange.value && !props.disabled && (props.editable || !props.noRestoreOnValueClick)
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
  if (props.editable && !props.disabled) startEdit();
  else if (!props.noRestoreOnValueClick && !props.disabled) restoreDefault();
};

const wrapperRef = useTemplateRef<HTMLDivElement>('wrapperRef');
const trackRef = useTemplateRef<HTMLDivElement>('trackRef');
const readoutInputRef = useTemplateRef<HTMLInputElement>('readoutInputRef');

defineExpose({
  /** 聚焦首个滑块拇指（供父组件调用） */
  focus: () => wrapperRef.value?.querySelector<HTMLElement>('[role="slider"]')?.focus(),
  /** 组件持有焦点时主动失焦 */
  blur: () => {
    if (wrapperRef.value?.contains(document.activeElement) && document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
  },
});

const isEditing = ref(false);
const editValue = ref('');

const isHovered = ref(false);
const isHoveredThumb0 = ref(false);
const isHoveredThumb1 = ref(false);
// 拖拽状态（isDragging / dragStartValue）与键盘/滚轮步进抽离至 useSliderInteraction

const isRange = computed(() => props.range ?? false);

const singleValue = computed<number>(() =>
  typeof modelValue.value === 'number' ? modelValue.value : (modelValue.value?.[0] ?? props.min)
);

const rangeValues = computed<[number, number]>(() => {
  if (Array.isArray(modelValue.value)) return [modelValue.value[0], modelValue.value[1]];

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

const currentConfig = computed(() => SLIDER_CONFIG[resolvedSize.value] ?? SLIDER_CONFIG.md);

/**
 * 窄档位（生效尺寸为 sm 或 width=sm）下收紧读数占位：
 * min-w-8（32px）在 88px 的盒子里占了近一半，会把轨道挤到几乎不可用，故降到 min-w-6（24px）。
 * 24px 仍可稳定容纳 3~4 个字符的读数（font-mono + tabular-nums 约 6px/字符），
 * 更长的读数会自然撑开——min-width 只是防抖下限，不裁剪内容。
 * 非窄档位取值完全不变，存量 UI 零回归。
 */
const isCompactReadout = computed(() => resolvedSize.value === 'sm' || props.width === 'sm');
const readoutSpanClass = computed(() => (isCompactReadout.value ? 'min-w-6' : 'min-w-8'));
/** 编辑态输入框同理：w-16（64px）在窄档位下会直接撑破盒子 */
const readoutInputClass = computed(() => (isCompactReadout.value ? 'w-10' : 'w-16'));

/** 计算数值的小数位数（兼容科学计数法表示），见 BaseSlider.logic.ts */

const isTrackHovered = ref(false);

/**
 * 滚轮步进时的数值气泡续显：滚轮是离散事件（不像拖拽有持续的 isDragging 态），
 * 用短延时在最后一次滚动后把气泡多留片刻，使 wheelable / wheelOnHover 下改值也能看到当前数值。
 */
const WHEEL_TOOLTIP_LINGER_MS = 700;
/** 滚轮步进作用的拇指下标（区间模式）；null = 无滚轮续显。必须是下标而不是布尔——
 *  区间模式下滚轮作用于**聚焦的那个拇指**，用布尔会让气泡永远挂在 0 号上（见 useSliderInteraction） */
const wheelActiveThumb = ref<number | null>(null);
let wheelTooltipTimer: ReturnType<typeof setTimeout> | null = null;
const pulseWheelTooltip = (thumbIdx = 0) => {
  wheelActiveThumb.value = thumbIdx;
  if (wheelTooltipTimer !== null) clearTimeout(wheelTooltipTimer);
  wheelTooltipTimer = setTimeout(() => {
    wheelActiveThumb.value = null;
    wheelTooltipTimer = null;
  }, WHEEL_TOOLTIP_LINGER_MS);
};

const stepDecimals = computed(() => countDecimals(props.step));

/** 将任意值对齐到步长网格并夹紧到 [min, max]，同时消除浮点误差与负零 */
const snapToStep = (val: number): number => {
  if (!isFinite(val)) return props.min;
  const step = props.step > 0 ? props.step : 1;
  const { min } = props;
  const steps = Math.round((val - min) / step);
  const rawSnapped = min + steps * step;
  const clamped = clamp(rawSnapped, props.min, props.max);
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
  return clamp(((val - props.min) / (props.max - props.min)) * 100, 0, 100);
};

const singleThumbStyle = computed(() => thumbPositionStyle(getPct(singleValue.value), props.vertical));

const rangeThumb0Style = computed(() => thumbPositionStyle(getPct(rangeValues.value[0]), props.vertical));

const rangeThumb1Style = computed(() => thumbPositionStyle(getPct(rangeValues.value[1]), props.vertical));

const activeBarStyle = computed(() => {
  if (isRange.value) {
    const p0 = getPct(rangeValues.value[0]);
    const p1 = getPct(rangeValues.value[1]);
    const start = Math.min(p0, p1);
    const length = Math.abs(p1 - p0);
    return activeBarStyleOf(start, length, props.vertical, false);
  }
  return activeBarStyleOf(0, getPct(singleValue.value), props.vertical, true);
});

/** 单值滑块 tooltip 显隐：按 showTooltip 策略（always/hover/drag/never）判定 */
const shouldShowTooltip = (index: number) => {
  if (props.showTooltip === 'never') return false;
  if (props.showTooltip === 'always') return true;
  if (props.showTooltip === 'drag') return isDragging.value === index || wheelActiveThumb.value !== null;
  if (props.showTooltip === 'hover') return isHovered.value || isTrackHovered.value || isDragging.value === index;
  return false;
};

/** 区间滑块 tooltip 显隐：策略同单值，hover 需区分具体拇指 */
const shouldShowRangeTooltip = (index: number) => {
  if (props.showTooltip === 'never') return false;
  if (props.showTooltip === 'always') return true;
  // 滚轮续显只对**被滚轮作用的那个拇指**生效（与滚轮实际改值的拇指同源，见 useSliderInteraction）
  if (props.showTooltip === 'drag') return isDragging.value === index || wheelActiveThumb.value === index;
  if (props.showTooltip === 'hover')
    return (
      (index === 0 ? isHoveredThumb0.value : isHoveredThumb1.value) ||
      isTrackHovered.value ||
      isDragging.value === index
    );

  return false;
};

/**
 * 数值气泡改为全局 v-tooltip 浮层（manual + visible 驱动）：
 * 借助其 teleport 到 body 与动态最高层级，彻底摆脱折叠容器 overflow 裁剪/遮挡；
 * 用指令内建 compact 复刻紧凑读数观感，placement/间距对齐原内联气泡（mb/ml-2 = 8px）。
 */
const baseTooltipOpts = computed<TooltipOptions>(() => ({ placement: props.vertical ? 'left' : 'top' }));

const singleTooltipOpts = computed<TooltipOptions>(() => ({
  ...baseTooltipOpts.value,
  content: singleDisplayText.value,
  visible: shouldShowTooltip(0),
}));

const rangeTooltip0Opts = computed<TooltipOptions>(() => ({
  ...baseTooltipOpts.value,
  content: formatVal(rangeValues.value[0]),
  visible: shouldShowRangeTooltip(0),
}));

const rangeTooltip1Opts = computed<TooltipOptions>(() => ({
  ...baseTooltipOpts.value,
  content: formatVal(rangeValues.value[1]),
  visible: shouldShowRangeTooltip(1),
}));

const tickValues = computed<number[]>(() =>
  computeTickValues({
    marks: props.marks,
    showTicks: props.showTicks,
    min: props.min,
    max: props.max,
    step: props.step,
    snap: snapToStep,
  })
);

/** 刻度定位样式：按值换算百分比并居中平移 */
const getTickPositionStyle = (v: number) => tickPositionStyle(getPct(v), props.vertical);

/** 刻度文本：marks 提供标签时优先使用，否则回退数值本身 */
const markLabel = (v: number) => markLabelOf(v, props.marks);

/**
 * 统一取值更新入口：夹紧、对齐步长并写回模型；
 * commit 为 true 时额外派发 change（拖拽过程中传 false 避免频繁触发）
 */
const updateValue = (rawNextVal: number | [number, number], options?: { commit?: boolean }) => {
  if (props.disabled) return;
  if (isRange.value) {
    const raw0 = (Array.isArray(rawNextVal) ? rawNextVal[0] : rawNextVal) ?? props.min;
    const raw1 = (Array.isArray(rawNextVal) ? rawNextVal[1] : rawNextVal) ?? props.max;
    // 用另一拇指当前值做夹紧边界，防止两拇指交叉互换身份（对齐 aria-valuemin/max 的约束语义）
    const c0 = snapToStep(clamp(raw0, props.min, rangeValues.value[1]));
    const c1 = snapToStep(clamp(raw1, rangeValues.value[0], props.max));
    const nextArr: [number, number] = [Math.min(c0, c1), Math.max(c0, c1)];
    // 值未变不写回：区间值每次都是新数组，裸赋值会让依赖 modelValue 的下游（含写回
    // update:modelValue 的 watcher）在拖拽的每一帧都空跑一次。单值分支的
    // `snapped !== modelValue.value` 就是这条守卫，两分支必须同口径。
    const current = rangeValues.value;
    if (nextArr[0] !== current[0] || nextArr[1] !== current[1]) modelValue.value = nextArr;
    if (options?.commit) {
      // lazy 模式下提交点（按钮/键盘/编辑/恢复默认）才真正写回 model
      if (isLazy.value) model.value = emitValue(nextArr);
      emit('change', emitValue(nextArr));
    }
  } else {
    const raw = typeof rawNextVal === 'number' ? rawNextVal : (rawNextVal[0] ?? props.min);
    const snapped = snapToStep(raw);
    if (snapped !== modelValue.value) modelValue.value = snapped;

    if (options?.commit) {
      // lazy 模式下提交点（按钮/键盘/编辑/恢复默认）才真正写回 model
      if (isLazy.value) model.value = emitValue(snapped);
      emit('change', emitValue(snapped));
    }
  }
};

// ─── 交互层（拖拽 / 键盘方向键 / 滚轮 / 轨道点击）抽离至 useSliderInteraction ───
// 取值计算（snapToStep / updateValue）与事件派发（drag-start / drag-end / change）留在本组件
const { isDragging, stepBy, handleRangeKeydown, startDrag, handleTrackPointerDown, handleWheel } = useSliderInteraction(
  {
    trackRef,
    wrapperRef,
    isDisabled: () => props.disabled,
    isRange: () => isRange.value,
    getRangeValues: () => rangeValues.value,
    getSingleValue: () => singleValue.value,
    getCurrentValue: () => modelValue.value,
    isEditing: () => isEditing.value,
    applyValue: (v, commit) => updateValue(v, { commit }),
    snap: snapToStep,
    onDragStart: thumbIndex => emit('drag-start', thumbIndex),
    onDragEnd: (startValue, currentValue) => {
      // lazy 模式：拖拽结束作为提交点，把最终值写回 model
      if (isLazy.value) model.value = emitValue(modelValue.value);
      emit('drag-end', emitValue(modelValue.value));
      if (!isValueEqual(startValue, currentValue)) emit('change', emitValue(modelValue.value));
    },
    pulseWheelTooltip,
    wheelable: () => props.wheelable ?? false,
    wheelOnHover: () => props.wheelOnHover ?? false,
    reverseWheel: () => props.reverseWheel ?? false,
    step: () => props.step ?? 1,
    min: () => props.min,
    max: () => props.max,
    vertical: () => props.vertical ?? false,
  }
);

// 仅在开发环境中提示非法区间，生产构建时被完全 Tree-shaking
if (import.meta.env.DEV)
  watch(
    () => [props.min, props.max] as const,
    ([min, max]) => {
      if (min > max) console.warn(`[BaseSlider] min (${min}) 不应大于 max (${max})，滑块取值区间将坍缩为 max。`);
    },
    { immediate: true }
  );

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
  // dev 提示：越界输入会被 updateValue 静默夹紧，主动提示避免使用者误以为原值生效
  if (import.meta.env.DEV && (parsed < props.min || parsed > props.max))
    console.warn(`[BaseSlider] 输入值 ${parsed} 超出范围 [${props.min}, ${props.max}]，将自动吸附到范围内。`);

  updateValue(parsed, { commit: true });
};

/** 取消编辑，丢弃未提交内容 */
const cancelEdit = () => {
  isEditing.value = false;
};

onBeforeUnmount(() => {
  if (wheelTooltipTimer !== null) clearTimeout(wheelTooltipTimer);
});
</script>
