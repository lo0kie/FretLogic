<template>
  <button
    :name
    :aria-busy="isCurrentLoading || undefined"
    :aria-checked="isChecked"
    :aria-disabled="disabled || isCurrentLoading"
    :aria-label="ariaLabel || label"
    :class="{ 'cursor-grabbing': isDragging }"
    :disabled="disabled || isCurrentLoading"
    :id="resolvedId"
    @click="handleClick"
    @keydown.enter.prevent="toggle"
    @keydown.space.prevent="toggle"
    @pointercancel="handlePointerCancel"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
    class="group gap-sm m-0 box-border inline-flex cursor-pointer touch-none items-center rounded-full border-none bg-transparent p-0 align-middle outline-none select-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    ref="switchBtnRef"
    role="switch"
    type="button"
  >
    <span
      v-wave="{ disabled: disabled || isCurrentLoading }"
      :class="[currentConfig.trackClass, trackColorClass]"
      class="switch-track duration-base group-focus-visible:ring-primary/70 relative box-border inline-flex shrink-0 items-center overflow-hidden rounded-full transition-all group-focus-visible:ring-2"
      ref="trackRef"
    >
      <span
        v-if="$slots['checked-text'] || $slots['unchecked-text']"
        :class="isChecked ? 'justify-start' : 'justify-end'"
        class="text-2xs pointer-events-none absolute inset-0 flex items-center overflow-hidden px-1.5 leading-none font-bold text-white select-none"
      >
        <span class="inline-block max-w-[calc(100%-1.1rem)] truncate">
          <slot v-if="isChecked" name="checked-text" />
          <slot v-else name="unchecked-text" />
        </span>
      </span>

      <span
        :class="[
          currentConfig.thumbClass,
          !isDragging && (isChecked ? currentConfig.checkedClass : 'translate-x-0'),
          isPressed && !isDragging && !hasMovedSignificantly && 'scale-y-[0.82]',
        ]"
        :style="dragThumbStyle"
        class="switch-thumb duration-base ease-spring pointer-events-none box-border inline-flex items-center justify-center rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform"
        ref="thumbRef"
      >
        <slot v-if="isChecked" name="checked-icon" />
        <slot v-else name="unchecked-icon" />

        <svg
          v-if="isCurrentLoading"
          :height="currentConfig.spinnerSize"
          :width="currentConfig.spinnerSize"
          aria-hidden="true"
          class="text-primary animate-spin"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            :stroke-width="3"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-dasharray="47 17"
            stroke-linecap="round"
          />
        </svg>
      </span>
    </span>

    <span v-if="label || $slots['default']" class="switch-label text-text-body text-xs leading-none font-medium">
      <slot> {{ label }} </slot>
    </span>
  </button>
</template>

<script setup generic="T extends string | number | boolean = boolean" lang="ts">
import { computed, ref, useId, useTemplateRef } from 'vue';

import type { ComponentSize } from '@/platform/types';

const COLOR_CLASS: Record<string, { on: string; off: string }> = {
  primary: {
    on: 'bg-primary group-hover:brightness-105 group-disabled:brightness-100',
    off: 'bg-border-base group-hover:brightness-95 group-disabled:brightness-100',
  },
  success: {
    on: 'bg-success group-hover:brightness-105 group-disabled:brightness-100',
    off: 'bg-border-base group-hover:brightness-95 group-disabled:brightness-100',
  },
  danger: {
    on: 'bg-danger group-hover:brightness-105 group-disabled:brightness-100',
    off: 'bg-border-base group-hover:brightness-95 group-disabled:brightness-100',
  },
  warning: {
    on: 'bg-warning group-hover:brightness-105 group-disabled:brightness-100',
    off: 'bg-border-base group-hover:brightness-95 group-disabled:brightness-100',
  },
};

const SWITCH_CONFIG: Record<
  'sm' | 'md' | 'lg',
  {
    trackClass: string;
    thumbClass: string;
    checkedClass: string;
    travelPx: number;
    spinnerSize: number;
  }
> = {
  sm: {
    trackClass: 'w-7 h-4 p-0.5',
    thumbClass: 'w-3 h-3',
    checkedClass: 'translate-x-3',
    travelPx: 12,
    spinnerSize: 9,
  },
  md: {
    trackClass: 'w-9 h-5 p-0.5',
    thumbClass: 'w-4 h-4',
    checkedClass: 'translate-x-4',
    travelPx: 16,
    spinnerSize: 11,
  },
  lg: {
    trackClass: 'w-11 h-6 p-0.5',
    thumbClass: 'w-5 h-5',
    checkedClass: 'translate-x-5',
    travelPx: 20,
    spinnerSize: 13,
  },
};

const props = withDefaults(
  defineProps<{
    size?: ComponentSize;
    color?: 'primary' | 'success' | 'danger' | 'warning' | (string & {});
    disabled?: boolean;
    loading?: boolean;
    name?: string;
    label?: string;
    id?: string;
    ariaLabel?: string;
    /** 激活时的值，默认 true */
    activeValue?: T;
    /** 关闭时的值，默认 false */
    inactiveValue?: T;
    beforeChange?: (val: T) => boolean | Promise<boolean>;
  }>(),
  {
    size: 'md',
    color: 'primary',
    disabled: false,
    loading: false,
  }
);

const modelValue = defineModel<T>({ required: true });
const loadingModel = defineModel<boolean>('loading', { default: false });

const emit = defineEmits<{
  (e: 'change', value: T): void;
}>();

const resolvedActiveValue = computed<T>(() =>
  props.activeValue !== undefined ? props.activeValue : (true as unknown as T)
);
const resolvedInactiveValue = computed<T>(() =>
  props.inactiveValue !== undefined ? props.inactiveValue : (false as unknown as T)
);

const autoId = useId();
const resolvedId = computed(() => props.id || autoId);

const switchBtnRef = useTemplateRef<HTMLButtonElement>('switchBtnRef');
const trackRef = useTemplateRef<HTMLElement>('trackRef');
const thumbRef = useTemplateRef<HTMLElement>('thumbRef');

const isDragging = ref(false);
const isPressed = ref(false);
const isPending = ref(false);
const dragOffset = ref(0);

// 手势生命周期中间变量：仅在 pointerdown -> pointerup 期间通过局部状态追踪，无需全局响应式追踪
let dragStartX = 0;
let startValue = false;
let maxTravelDistance = 16;
let pressBasePos = 0;
let hasMovedSignificantly = false;

const isCurrentLoading = computed(() => props.loading || loadingModel.value || isPending.value);

const isChecked = computed(() => Object.is(modelValue.value, resolvedActiveValue.value));

const currentConfig = computed(() => SWITCH_CONFIG[props.size] ?? SWITCH_CONFIG.md);

const isDragPastHalf = computed(() => {
  if (!isDragging.value) return null;
  const initialPos = startValue ? maxTravelDistance : 0;
  const clampedX = Math.min(Math.max(0, initialPos + dragOffset.value), maxTravelDistance);
  return clampedX >= maxTravelDistance * 0.5;
});

const trackColorClass = computed(() => {
  const on = isDragPastHalf.value ?? isChecked.value;
  const palette = (COLOR_CLASS[props.color] ?? COLOR_CLASS['primary'])!;
  return on ? palette.on : palette.off;
});

/** 切换开关：支持 beforeChange 异步拦截，拦截期间进入 loading 并禁止重复触发 */
const toggle = async () => {
  if (props.disabled || isCurrentLoading.value) return;
  const nextChecked = !isChecked.value;
  const nextVal = nextChecked ? resolvedActiveValue.value : resolvedInactiveValue.value;

  if (props.beforeChange) {
    isPending.value = true;
    loadingModel.value = true;
    try {
      const allowed = await props.beforeChange(nextVal);
      if (!allowed) return;
    } catch {
      return;
    } finally {
      isPending.value = false;
      loadingModel.value = false;
    }
  }

  modelValue.value = nextVal;
  emit('change', nextVal);
};

/** 点击切换：刚拖拽过则吞掉本次 click（拖拽结果已在 pointerup 按落点结算） */
const handleClick = () => {
  if (hasMovedSignificantly) {
    hasMovedSignificantly = false;
    return;
  }
  toggle();
};

/** 按下：实测滑轨行程并记录拖拽起点与按压缩放状态 */
const handlePointerDown = (e: PointerEvent) => {
  if (props.disabled || isCurrentLoading.value || e.button !== 0) return;

  if (trackRef.value && thumbRef.value) {
    const style = window.getComputedStyle(trackRef.value);
    const padLeft = parseFloat(style.paddingLeft) || 0;
    const padRight = parseFloat(style.paddingRight) || 0;
    const calculatedTravel = trackRef.value.clientWidth - thumbRef.value.offsetWidth - (padLeft + padRight);
    maxTravelDistance = Math.max(0, calculatedTravel);
  } else {
    maxTravelDistance = currentConfig.value.travelPx;
  }

  pressBasePos = isChecked.value ? maxTravelDistance : 0;
  dragStartX = e.clientX;
  dragOffset.value = 0;
  startValue = isChecked.value;
  hasMovedSignificantly = false;
  isPressed.value = true;
  (e.currentTarget as HTMLElement)?.setPointerCapture?.(e.pointerId);
};

/** 拖拽中：跟踪横向位移，超过阈值进入拖拽态 */
const handlePointerMove = (e: PointerEvent) => {
  if (e.buttons === 0) {
    if (isDragging.value) {
      isDragging.value = false;
      dragOffset.value = 0;
    }
    return;
  }
  const deltaX = e.clientX - dragStartX;
  dragOffset.value = deltaX;
  if (!isDragging.value && Math.abs(deltaX) > 4) {
    isDragging.value = true;
    hasMovedSignificantly = true;
  }
};

/** 松开：按落点是否过半结算开关值（同样走 beforeChange 拦截） */
const handlePointerUp = async (e: PointerEvent) => {
  const wasDragging = isDragging.value;
  const deltaX = dragOffset.value;
  isDragging.value = false;
  isPressed.value = false;
  dragOffset.value = 0;

  try {
    (e.currentTarget as HTMLElement)?.releasePointerCapture?.(e.pointerId);
  } catch {
    // ignore
  }

  if (wasDragging && hasMovedSignificantly) {
    const initialPos = startValue ? maxTravelDistance : 0;
    const targetPos = Math.min(Math.max(0, initialPos + deltaX), maxTravelDistance);
    const finalChecked = targetPos >= maxTravelDistance * 0.5;

    if (finalChecked !== isChecked.value) {
      const nextVal = finalChecked ? resolvedActiveValue.value : resolvedInactiveValue.value;
      if (props.beforeChange) {
        isPending.value = true;
        loadingModel.value = true;
        try {
          const allowed = await props.beforeChange(nextVal);
          if (!allowed) return;
        } catch {
          return;
        } finally {
          isPending.value = false;
          loadingModel.value = false;
        }
      }
      modelValue.value = nextVal;
      emit('change', nextVal);
    }
  }
};

/** 指针取消：仅复位拖拽/按压状态，不改变开关值 */
const handlePointerCancel = (e: PointerEvent) => {
  isDragging.value = false;
  isPressed.value = false;
  dragOffset.value = 0;
  try {
    (e.currentTarget as HTMLElement)?.releasePointerCapture?.(e.pointerId);
  } catch {
    // ignore
  }
};

const THUMB_PX: Record<'sm' | 'md' | 'lg', number> = { sm: 12, md: 16, lg: 20 };

const dragThumbStyle = computed(() => {
  if (isDragging.value) {
    const deltaX = dragOffset.value;
    const initialPos = pressBasePos;
    const clampedX = Math.min(Math.max(0, initialPos + deltaX), maxTravelDistance);

    const dir = deltaX >= 0 ? 1 : -1;
    const travelRatio = maxTravelDistance > 0 ? Math.min(Math.abs(deltaX) / maxTravelDistance, 1) : 0;

    const thumbSize = THUMB_PX[props.size] ?? 16;
    const desiredStretch = 1 + travelRatio * 0.18;
    const desiredSqueeze = 1 - travelRatio * 0.08;

    const remainingSpace = dir > 0 ? maxTravelDistance - clampedX : clampedX;
    const maxAllowedStretch = thumbSize > 0 ? 1 + Math.max(0, remainingSpace) / thumbSize : desiredStretch;

    const stretch = Math.min(desiredStretch, maxAllowedStretch);

    return {
      transform: `translateX(${clampedX}px) scaleX(${stretch}) scaleY(${desiredSqueeze})`,
      transformOrigin: dir > 0 ? 'left center' : 'right center',
      transition: 'none',
    };
  }
  return {};
});
</script>
