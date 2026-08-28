<template>
  <div
    ref="wrapperRef"
    class="base-slider inline-flex items-center justify-center bg-bg-body border border-border-light rounded-full box-border select-none gap-sm transition-all duration-fast hover:border-border-base has-[:focus-visible]:border-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/70"
    :class="[
      currentConfig.wrapperClass,
      vertical ? 'flex-col !rounded-2xl py-sm h-auto' : '',
      tickValues.length && !vertical ? '!h-auto !rounded-2xl pb-5 pt-1' : '',
      { 'opacity-45 cursor-not-allowed': disabled, 'w-full': resolvedWidth === '100%' },
    ]"
    :style="wrapperStyle"
    @wheel="handleWheel"
  >
    <!-- 标签：左侧/顶部 -->
    <span
      v-if="label && (labelPosition === 'left' || (vertical && labelPosition !== 'right'))"
      class="text-2xs font-semibold text-text-disabled whitespace-nowrap px-xs"
      :class="disabled ? 'cursor-not-allowed' : ''"
    >
      {{ label }}
    </span>

    <!-- 数值输入 / 显示：左侧/顶部 -->
    <input
      v-if="showReadout && !isRange && readoutPosition === 'left' && isEditing"
      ref="readoutInputRef"
      v-model="editValue"
      type="number"
      :min="min"
      :max="max"
      :step="step"
      class="text-2xs font-bold text-primary text-center font-mono outline-none rounded-sm tabular-nums w-16 h-5 bg-bg-body border border-border-light focus:border-primary focus:ring-1 focus:ring-primary/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      aria-label="输入精确数值"
      @blur="commitEdit"
      @keydown.enter="commitEdit"
      @keydown.esc="cancelEdit"
      @pointerdown.stop
    />
    <span
      v-else-if="showReadout && !isRange && readoutPosition === 'left'"
      class="text-2xs font-bold text-text-title text-center font-mono rounded-sm tabular-nums inline-block min-w-8"
      :class="editable && !disabled ? 'cursor-text hover:text-primary' : ''"
      :title="editable && !disabled ? '点击输入精确数值' : ''"
      @click="startEdit"
    >
      {{ singleDisplayText }}
    </span>

    <!-- 减少按钮 -->
    <button
      v-if="showButtons && !isRange && !vertical"
      type="button"
      class="border-none bg-transparent p-0 flex items-center justify-center text-text-disabled cursor-pointer outline-none rounded-full hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
      :disabled="disabled || singleValue <= min"
      title="减少"
      aria-label="减少"
      data-focusable-inline
      @click="stepBy(-1, $event)"
    >
      <Minus :size="14" :stroke-width="2.2" aria-hidden="true" />
    </button>

    <!-- 轨道主体区域 -->
    <div
      ref="trackRef"
      class="relative flex items-center justify-center"
      :class="[vertical ? 'w-5 flex-1 min-h-24 h-full my-1' : isCustomWidth ? 'flex-1 min-w-16 w-full' : 'w-24']"
      @pointerdown="handleTrackPointerDown"
    >
      <!-- 背景轨道 -->
      <div
        class="absolute rounded-full bg-border-base transition-colors"
        :class="vertical ? 'w-1 inset-y-0 left-1/2 -translate-x-1/2' : 'h-1 inset-x-0 top-1/2 -translate-y-1/2'"
      />

      <!-- 激活填充条 -->
      <div
        class="absolute rounded-full bg-primary pointer-events-none"
        :class="vertical ? 'w-1 left-1/2 -translate-x-1/2' : 'h-1 top-1/2 -translate-y-1/2'"
        :style="activeBarStyle"
      />

      <!-- 单滑块模式 Thumb -->
      <div
        v-if="!isRange"
        class="absolute z-10 w-3.5 h-3.5 rounded-full bg-primary border-2 border-bg-body shadow-sm cursor-pointer outline-none transition-transform duration-75 hover:scale-125 active:scale-135"
        :class="[
          vertical ? 'left-1/2 -translate-x-1/2 -translate-y-1/2' : 'top-1/2 -translate-x-1/2 -translate-y-1/2',
          { 'ring-2 ring-primary/70 scale-125': isDragging === 0 },
        ]"
        :style="singleThumbStyle"
        tabindex="0"
        role="slider"
        :aria-valuemin="min"
        :aria-valuemax="max"
        :aria-valuenow="singleValue"
        :aria-valuetext="singleDisplayText"
        :aria-disabled="disabled || undefined"
        @keydown="handleRangeKeydown"
        @mouseenter="isHovered = true"
        @mouseleave="isHovered = false"
        @pointerdown.stop="startDrag(0)"
      >
        <!-- 跟随气泡 Tooltip -->
        <Transition name="v-transition-fade">
          <div
            v-if="shouldShowTooltip(0)"
            class="absolute pointer-events-none px-1.5 py-0.5 rounded bg-bg-elevated border border-glass-border text-text-title shadow-md text-2xs font-bold font-mono whitespace-nowrap z-20"
            :class="vertical ? 'left-full ml-2 top-1/2 -translate-y-1/2' : 'bottom-full mb-2 left-1/2 -translate-x-1/2'"
          >
            {{ singleDisplayText }}
          </div>
        </Transition>
      </div>

      <!-- 双滑块区间模式 Thumb 0 (Min) 与 Thumb 1 (Max) -->
      <template v-else>
        <div
          class="absolute z-10 w-3.5 h-3.5 rounded-full bg-primary border-2 border-bg-body shadow-sm cursor-pointer outline-none transition-transform duration-75 hover:scale-125 active:scale-135"
          :class="[
            vertical ? 'left-1/2 -translate-x-1/2 -translate-y-1/2' : 'top-1/2 -translate-x-1/2 -translate-y-1/2',
            { 'ring-2 ring-primary/70 scale-125': isDragging === 0 },
          ]"
          :style="rangeThumb0Style"
          tabindex="0"
          role="slider"
          :aria-valuemin="min"
          :aria-valuemax="rangeValues[1]"
          :aria-valuenow="rangeValues[0]"
          :aria-valuetext="formatVal(rangeValues[0])"
          @keydown="e => handleRangeKeydown(e, 0)"
          @mouseenter="isHoveredThumb0 = true"
          @mouseleave="isHoveredThumb0 = false"
          @pointerdown.stop="startDrag(0)"
        >
          <Transition name="v-transition-fade">
            <div
              v-if="shouldShowRangeTooltip(0)"
              class="absolute pointer-events-none px-1.5 py-0.5 rounded bg-bg-elevated border border-glass-border text-text-title shadow-md text-2xs font-bold font-mono whitespace-nowrap z-20"
              :class="
                vertical ? 'left-full ml-2 top-1/2 -translate-y-1/2' : 'bottom-full mb-2 left-1/2 -translate-x-1/2'
              "
            >
              {{ formatVal(rangeValues[0]) }}
            </div>
          </Transition>
        </div>

        <div
          class="absolute z-10 w-3.5 h-3.5 rounded-full bg-primary border-2 border-bg-body shadow-sm cursor-pointer outline-none transition-transform duration-75 hover:scale-125 active:scale-135"
          :class="[
            vertical ? 'left-1/2 -translate-x-1/2 -translate-y-1/2' : 'top-1/2 -translate-x-1/2 -translate-y-1/2',
            { 'ring-2 ring-primary/70 scale-125': isDragging === 1 },
          ]"
          :style="rangeThumb1Style"
          tabindex="0"
          role="slider"
          :aria-valuemin="rangeValues[0]"
          :aria-valuemax="max"
          :aria-valuenow="rangeValues[1]"
          :aria-valuetext="formatVal(rangeValues[1])"
          @keydown="e => handleRangeKeydown(e, 1)"
          @mouseenter="isHoveredThumb1 = true"
          @mouseleave="isHoveredThumb1 = false"
          @pointerdown.stop="startDrag(1)"
        >
          <Transition name="v-transition-fade">
            <div
              v-if="shouldShowRangeTooltip(1)"
              class="absolute pointer-events-none px-1.5 py-0.5 rounded bg-bg-elevated border border-glass-border text-text-title shadow-md text-2xs font-bold font-mono whitespace-nowrap z-20"
              :class="
                vertical ? 'left-full ml-2 top-1/2 -translate-y-1/2' : 'bottom-full mb-2 left-1/2 -translate-x-1/2'
              "
            >
              {{ formatVal(rangeValues[1]) }}
            </div>
          </Transition>
        </div>
      </template>

      <!-- 刻度与标记 -->
      <div
        v-if="tickValues.length"
        class="absolute pointer-events-none"
        :class="vertical ? 'inset-y-0 right-full mr-2' : 'left-0 right-0 top-full mt-1'"
        aria-hidden="true"
      >
        <div
          v-for="v in tickValues"
          :key="v"
          class="absolute flex items-center"
          :class="vertical ? 'flex-row justify-end' : 'flex-col'"
          :style="getTickPositionStyle(v)"
        >
          <div :class="vertical ? 'w-1.5 h-px bg-border-base' : 'w-px h-1.5 bg-border-base'" />
          <span class="text-2xs text-text-disabled whitespace-nowrap font-mono" :class="vertical ? 'mr-1' : 'mt-0.5'">
            {{ markLabel(v) }}
          </span>
        </div>
      </div>
    </div>

    <!-- 增加按钮 -->
    <button
      v-if="showButtons && !isRange && !vertical"
      type="button"
      class="border-none bg-transparent p-0 flex items-center justify-center text-text-disabled cursor-pointer outline-none rounded-full hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
      :disabled="disabled || singleValue >= max"
      title="增加"
      aria-label="增加"
      data-focusable-inline
      @click="stepBy(1, $event)"
    >
      <Plus :size="14" :stroke-width="2.2" aria-hidden="true" />
    </button>

    <!-- 数值输入 / 显示：右侧/底部 -->
    <input
      v-if="showReadout && !isRange && readoutPosition === 'right' && isEditing"
      ref="readoutInputRef"
      v-model="editValue"
      type="number"
      :min="min"
      :max="max"
      :step="step"
      class="text-2xs font-bold text-primary text-center font-mono outline-none rounded-sm tabular-nums w-16 h-5 bg-bg-body border border-border-light focus:border-primary focus:ring-1 focus:ring-primary/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      aria-label="输入精确数值"
      @blur="commitEdit"
      @keydown.enter="commitEdit"
      @keydown.esc="cancelEdit"
      @pointerdown.stop
    />
    <span
      v-else-if="showReadout && !isRange && readoutPosition === 'right'"
      class="text-2xs font-bold text-text-title text-center font-mono rounded-sm tabular-nums inline-block min-w-8"
      :class="editable && !disabled ? 'cursor-text hover:text-primary' : ''"
      :title="editable && !disabled ? '点击输入精确数值' : ''"
      @click="startEdit"
    >
      {{ singleDisplayText }}
    </span>

    <!-- 标签：右侧 -->
    <span
      v-if="label && labelPosition === 'right' && !vertical"
      class="text-2xs font-semibold text-text-disabled whitespace-nowrap px-xs"
      :class="disabled ? 'cursor-not-allowed' : ''"
    >
      {{ label }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { type FormComponentWidth, resolveComponentWidth } from '@/utils/core/constants';
import { Minus, Plus } from '@lucide/vue';
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef } from 'vue';

const props = withDefaults(
  defineProps<{
    min?: number;
    max?: number;
    step?: number;
    size?: 'sm' | 'md' | 'lg';
    width?: FormComponentWidth;
    /** 垂直高度（仅垂直模式生效，默认 '10rem'） */
    height?: string | number;
    label?: string;
    labelPosition?: 'left' | 'right';
    showButtons?: boolean;
    showReadout?: boolean;
    readoutPosition?: 'left' | 'right';
    defaultValue?: number | [number, number];
    disabled?: boolean;
    wheelable?: boolean;
    editable?: boolean;
    /** 是否开启双滑块区间选择模式 */
    range?: boolean;
    /** 是否开启垂直方向排布模式 */
    vertical?: boolean;
    /** Tooltip 浮动气泡展示模式：'always' 常驻 | 'hover' 悬停 | 'drag' 拖拽时 | 'never' 隐藏 */
    showTooltip?: 'always' | 'hover' | 'drag' | 'never';
    formatter?: (val: number) => string;
    marks?: Record<number, string>;
    showTicks?: boolean;
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
    defaultValue: 0,
    disabled: false,
    wheelable: false,
    editable: false,
    range: false,
    vertical: false,
    showTooltip: 'drag',
    formatter: undefined,
    marks: undefined,
    showTicks: false,
  }
);

const modelValue = defineModel<number | [number, number]>({ required: true });

const emit = defineEmits<{
  (e: 'change', value: number | [number, number]): void;
}>();

const wrapperRef = useTemplateRef<HTMLDivElement>('wrapperRef');
const trackRef = useTemplateRef<HTMLDivElement>('trackRef');
const readoutInputRef = useTemplateRef<HTMLInputElement>('readoutInputRef');

const isEditing = ref(false);
const editValue = ref('');

const isHovered = ref(false);
const isHoveredThumb0 = ref(false);
const isHoveredThumb1 = ref(false);
const isDragging = ref<number | null>(null);

const isRange = computed(() => props.range);

// 提取当前数值
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
  sm: { wrapperClass: 'h-[1.6rem] px-xs' },
  md: { wrapperClass: 'h-[1.9rem] px-sm' },
  lg: { wrapperClass: 'h-[2.3rem] px-sm' },
};

const currentConfig = computed(() => SLIDER_CONFIG[props.size] ?? SLIDER_CONFIG.md);

// 健壮的小数位推导：兼容小写/大写科学计数法（如 1e-4 或 1E-4）
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

/**
 * 将数值吸附对齐到 step 步长上（基于 min 的整数倍），并处理浮点精度与消除 -0
 */
const snapToStep = (val: number): number => {
  if (!isFinite(val)) return props.min;
  const step = props.step > 0 ? props.step : 1;
  const min = props.min;

  // 关键：吸附到离 min + k * step 最近的有效步长
  const steps = Math.round((val - min) / step);
  const rawSnapped = min + steps * step;

  // 严格约束在 [min, max] 范围内
  const clamped = Math.min(props.max, Math.max(props.min, rawSnapped));

  // 处理浮点精度并消除 -0
  const decimals = stepDecimals.value;
  const rounded = decimals === 0 ? Math.round(clamped) : Number(clamped.toFixed(decimals));
  return Object.is(rounded, -0) ? 0 : rounded;
};

const formatVal = (val: number): string => {
  if (props.formatter) return props.formatter(val);
  return String(val);
};

const singleDisplayText = computed(() => formatVal(singleValue.value));

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

// Tooltip 显示逻辑
const shouldShowTooltip = (index: number) => {
  if (props.showTooltip === 'never') return false;
  if (props.showTooltip === 'always') return true;
  if (props.showTooltip === 'drag') return isDragging.value === index;
  if (props.showTooltip === 'hover') return isHovered.value || isDragging.value === index;
  return false;
};

const shouldShowRangeTooltip = (index: number) => {
  if (props.showTooltip === 'never') return false;
  if (props.showTooltip === 'always') return true;
  if (props.showTooltip === 'drag') return isDragging.value === index;
  if (props.showTooltip === 'hover') {
    return (index === 0 ? isHoveredThumb0.value : isHoveredThumb1.value) || isDragging.value === index;
  }
  return false;
};

// 刻度列表
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

const getTickPositionStyle = (v: number) => {
  const pct = getPct(v);
  if (props.vertical) {
    return { bottom: `${pct}%`, transform: 'translateY(50%)' };
  }
  return { left: `${pct}%`, transform: 'translateX(-50%)' };
};

const markLabel = (v: number) => (props.marks ? (props.marks[v] ?? String(v)) : String(v));

// 步进与更新
const updateValue = (rawNextVal: number | [number, number], options?: { commit?: boolean }) => {
  if (props.disabled) return;
  if (isRange.value) {
    const raw0 = (Array.isArray(rawNextVal) ? rawNextVal[0] : rawNextVal) ?? props.min;
    const raw1 = (Array.isArray(rawNextVal) ? rawNextVal[1] : rawNextVal) ?? props.max;
    const c0 = snapToStep(Math.min(props.max, Math.max(props.min, raw0)));
    const c1 = snapToStep(Math.min(props.max, Math.max(props.min, raw1)));
    const nextArr: [number, number] = [Math.min(c0, c1), Math.max(c0, c1)];
    modelValue.value = nextArr;
    if (options?.commit) emit('change', nextArr);
  } else {
    const raw = typeof rawNextVal === 'number' ? rawNextVal : (rawNextVal[0] ?? props.min);
    const snapped = snapToStep(raw);
    if (snapped !== modelValue.value) {
      modelValue.value = snapped;
    }
    if (options?.commit) emit('change', snapped);
  }
};

const resolveMultiplier = (e?: { shiftKey?: boolean; altKey?: boolean }) => {
  if (e?.altKey) return 0.1;
  if (e?.shiftKey) return 10;
  return 1;
};

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

// 拖拽逻辑
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

const onPointerUp = () => {
  if (isDragging.value !== null) {
    isDragging.value = null;
    emit('change', modelValue.value);
  }
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
};

const startDrag = (thumbIndex: number) => {
  if (props.disabled) return;
  isDragging.value = thumbIndex;
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
};

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

// 滚轮调节
const handleWheel = (e: WheelEvent) => {
  if (props.disabled || !props.wheelable || isEditing.value) return;
  if (!wrapperRef.value?.contains(document.activeElement)) return;
  e.preventDefault();
  if (e.deltaY > 0) stepBy(-1, e);
  else if (e.deltaY < 0) stepBy(1, e);
};

// 单值精确编辑
const startEdit = () => {
  if (!props.editable || props.disabled || isRange.value) return;
  editValue.value = String(singleValue.value);
  isEditing.value = true;
  nextTick(() => {
    readoutInputRef.value?.focus();
    readoutInputRef.value?.select();
  });
};

const commitEdit = () => {
  if (!isEditing.value) return;
  isEditing.value = false;
  const parsed = parseFloat(editValue.value);
  if (isNaN(parsed)) return;
  updateValue(parsed, { commit: true });
};

const cancelEdit = () => {
  isEditing.value = false;
};

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
});
</script>
