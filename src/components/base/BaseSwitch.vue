<template>
  <button
    :id="resolvedId"
    ref="switchBtnRef"
    type="button"
    role="switch"
    :name
    :aria-checked="isChecked"
    :aria-disabled="disabled || isCurrentLoading"
    :aria-label="ariaLabel || label"
    :aria-busy="isCurrentLoading || undefined"
    :disabled="disabled || isCurrentLoading"
    class="group inline-flex items-center gap-sm bg-transparent border-none rounded-full p-0 m-0 cursor-pointer select-none touch-none outline-none box-border align-middle disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none"
    :class="{ 'cursor-grabbing': isDragging }"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
    @pointercancel="handlePointerCancel"
    @click="handleClick"
    @keydown.enter.prevent="toggle"
    @keydown.space.prevent="toggle"
  >
    <span
      ref="trackRef"
      v-wave="{ disabled: disabled || isCurrentLoading }"
      class="switch-track relative inline-flex items-center rounded-full box-border shrink-0 transition-all duration-base group-focus-visible:ring-2 group-focus-visible:ring-primary/70 overflow-hidden"
      :class="[currentConfig.trackClass, trackColorClass]"
    >
      <span
        v-if="$slots['checked-text'] || $slots['unchecked-text']"
        class="absolute inset-0 flex items-center pointer-events-none text-2xs font-bold leading-none text-white select-none overflow-hidden px-1.5"
        :class="isChecked ? 'justify-start' : 'justify-end'"
      >
        <span class="truncate max-w-[calc(100%-1.1rem)] inline-block">
          <slot v-if="isChecked" name="checked-text" />
          <slot v-else name="unchecked-text" />
        </span>
      </span>

      <span
        ref="thumbRef"
        class="switch-thumb rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] box-border transition-transform duration-base ease-spring inline-flex items-center justify-center pointer-events-none"
        :class="[
          currentConfig.thumbClass,
          !isDragging && (isChecked ? currentConfig.checkedClass : 'translate-x-0'),
          isPressed && !isDragging && !hasMovedSignificantly && 'scale-y-[0.82]',
        ]"
        :style="dragThumbStyle"
      >
        <slot v-if="isChecked" name="checked-icon" />
        <slot v-else name="unchecked-icon" />

        <svg
          v-if="isCurrentLoading"
          class="animate-spin text-primary"
          :width="currentConfig.spinnerSize"
          :height="currentConfig.spinnerSize"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            :stroke-width="3"
            stroke-linecap="round"
            stroke-dasharray="47 17"
          />
        </svg>
      </span>
    </span>

    <span v-if="label || $slots['default']" class="switch-label text-xs font-medium text-text-body leading-none">
      <slot> {{ label }} </slot>
    </span>
  </button>
</template>

<script setup lang="ts" generic="T extends string | number | boolean = boolean">
import { computed, ref, useId, useTemplateRef } from 'vue';

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
    size?: 'sm' | 'md' | 'lg';
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
const dragStartX = ref(0);
const dragCurrentX = ref(0);
const startValue = ref(false);
const maxTravelDistance = ref(16);
const hasMovedSignificantly = ref(false);
const isPending = ref(false);
const isPressed = ref(false);
const pressBasePos = ref(0);
const isCurrentLoading = computed(() => props.loading || loadingModel.value || isPending.value);

const isChecked = computed(() => Object.is(modelValue.value, resolvedActiveValue.value));

const currentConfig = computed(() => SWITCH_CONFIG[props.size] ?? SWITCH_CONFIG.md);

const isDragPastHalf = computed(() => {
  if (!isDragging.value) return null;
  const deltaX = dragCurrentX.value - dragStartX.value;
  const initialPos = startValue.value ? maxTravelDistance.value : 0;
  const clampedX = Math.min(Math.max(0, initialPos + deltaX), maxTravelDistance.value);
  return clampedX >= maxTravelDistance.value * 0.5;
});

const trackColorClass = computed(() => {
  const on = isDragPastHalf.value ?? isChecked.value;
  const palette = (COLOR_CLASS[props.color] ?? COLOR_CLASS['primary'])!;
  return on ? palette.on : palette.off;
});

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

const handleClick = () => {
  if (hasMovedSignificantly.value) {
    hasMovedSignificantly.value = false;
    return;
  }
  toggle();
};

const handlePointerDown = (e: PointerEvent) => {
  if (props.disabled || isCurrentLoading.value || e.button !== 0) return;

  if (trackRef.value && thumbRef.value) {
    const style = window.getComputedStyle(trackRef.value);
    const padLeft = parseFloat(style.paddingLeft) || 0;
    const padRight = parseFloat(style.paddingRight) || 0;
    const calculatedTravel = trackRef.value.clientWidth - thumbRef.value.offsetWidth - (padLeft + padRight);
    maxTravelDistance.value = Math.max(0, calculatedTravel);
  } else {
    maxTravelDistance.value = currentConfig.value.travelPx;
  }

  pressBasePos.value = isChecked.value ? maxTravelDistance.value : 0;

  dragStartX.value = e.clientX;
  dragCurrentX.value = e.clientX;
  startValue.value = isChecked.value;
  hasMovedSignificantly.value = false;
  isPressed.value = true;
  (e.currentTarget as HTMLElement)?.setPointerCapture?.(e.pointerId);
};

const handlePointerMove = (e: PointerEvent) => {
  if (e.buttons === 0) {
    if (isDragging.value) isDragging.value = false;
    return;
  }
  dragCurrentX.value = e.clientX;
  if (!isDragging.value && Math.abs(dragCurrentX.value - dragStartX.value) > 4) {
    isDragging.value = true;
    hasMovedSignificantly.value = true;
  }
};

const handlePointerUp = async (e: PointerEvent) => {
  const wasDragging = isDragging.value;
  isDragging.value = false;
  isPressed.value = false;

  try {
    (e.currentTarget as HTMLElement)?.releasePointerCapture?.(e.pointerId);
  } catch {
    // ignore
  }

  const deltaX = dragCurrentX.value - dragStartX.value;

  if (wasDragging && hasMovedSignificantly.value) {
    const initialPos = startValue.value ? maxTravelDistance.value : 0;
    const targetPos = Math.min(Math.max(0, initialPos + deltaX), maxTravelDistance.value);
    const finalChecked = targetPos >= maxTravelDistance.value * 0.5;

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

const handlePointerCancel = (e: PointerEvent) => {
  isDragging.value = false;
  isPressed.value = false;
  try {
    (e.currentTarget as HTMLElement)?.releasePointerCapture?.(e.pointerId);
  } catch {
    // ignore
  }
};

const THUMB_PX: Record<'sm' | 'md' | 'lg', number> = { sm: 12, md: 16, lg: 20 };

const dragThumbStyle = computed(() => {
  if (isDragging.value && hasMovedSignificantly.value) {
    const deltaX = dragCurrentX.value - dragStartX.value;
    const initialPos = pressBasePos.value;
    const clampedX = Math.min(Math.max(0, initialPos + deltaX), maxTravelDistance.value);

    const dir = deltaX >= 0 ? 1 : -1;
    const travelRatio = maxTravelDistance.value > 0 ? Math.min(Math.abs(deltaX) / maxTravelDistance.value, 1) : 0;

    const thumbSize = THUMB_PX[props.size] ?? 16;
    const desiredStretch = 1 + travelRatio * 0.18;
    const desiredSqueeze = 1 - travelRatio * 0.08;

    const remainingSpace = dir > 0 ? maxTravelDistance.value - clampedX : clampedX;
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
