<template>
  <button
    :id="resolvedId"
    ref="switchBtnRef"
    type="button"
    role="switch"
    :name="name"
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
      class="switch-track relative inline-flex items-center rounded-full box-border shrink-0 transition-all duration-base group-focus-visible:ring-2 group-focus-visible:ring-primary/70 overflow-hidden"
      :class="[currentConfig.trackClass, trackColorClass]"
    >
      <!-- 轨道两端状态文字 -->
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
        class="switch-thumb absolute top-1/2 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] box-border transition-transform duration-base ease-spring inline-flex items-center justify-center pointer-events-none"
        :class="currentConfig.thumbClass"
        :style="thumbStyle"
      >
        <!-- 滑块内图标插槽 -->
        <slot v-if="isChecked" name="checked-icon" />
        <slot v-else name="unchecked-icon" />

        <!-- loading 旋转动效 -->
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
            stroke-width="3"
            stroke-linecap="round"
            stroke-dasharray="47 17"
          />
        </svg>
      </span>
    </span>

    <span v-if="label || $slots.default" class="switch-label text-xs font-medium text-text-body leading-none">
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
  { trackClass: string; thumbClass: string; travel: string; spinnerSize: number }
> = {
  sm: {
    trackClass: 'w-[1.85rem] h-[1.1rem]',
    thumbClass: 'w-[0.85rem] h-[0.85rem] left-[0.125rem]',
    travel: '0.75rem',
    spinnerSize: 9,
  },
  md: {
    trackClass: 'w-[2.25rem] h-[1.35rem]',
    thumbClass: 'w-[1.05rem] h-[1.05rem] left-[0.15rem]',
    travel: '0.9rem',
    spinnerSize: 11,
  },
  lg: {
    trackClass: 'w-[2.75rem] h-[1.6rem]',
    thumbClass: 'w-[1.3rem] h-[1.3rem] left-[0.15rem]',
    travel: '1.15rem',
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
const resolvedId = computed(() => props.id ?? autoId);

const switchBtnRef = useTemplateRef<HTMLElement>('switchBtnRef');
const trackRef = useTemplateRef<HTMLElement>('trackRef');
const thumbRef = useTemplateRef<HTMLElement>('thumbRef');

const isDragging = ref(false);
const dragStartX = ref(0);
const dragCurrentX = ref(0);
const startValue = ref(false);
const maxTravelDistance = ref(16);
const hasMovedSignificantly = ref(false);
const isPending = ref(false);

const isCurrentLoading = computed(() => props.loading || loadingModel.value || isPending.value);

const isChecked = computed(() => Object.is(modelValue.value, resolvedActiveValue.value));

const currentConfig = computed(() => SWITCH_CONFIG[props.size] ?? SWITCH_CONFIG.md);

// 拖拽时实时计算"是否已过半"，用于轨道颜色联动
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

  const trackEl = trackRef.value;
  const thumbEl = thumbRef.value;

  if (trackEl && thumbEl) {
    const trackWidth = trackEl.offsetWidth;
    const thumbWidth = thumbEl.offsetWidth;
    const padding = thumbEl.offsetLeft || 2.4;
    maxTravelDistance.value = Math.max(8, trackWidth - thumbWidth - padding * 2);
  }

  isDragging.value = true;
  dragStartX.value = e.clientX;
  dragCurrentX.value = e.clientX;
  startValue.value = isChecked.value;
  hasMovedSignificantly.value = false;

  (e.currentTarget as HTMLElement)?.setPointerCapture?.(e.pointerId);
};

const handlePointerMove = (e: PointerEvent) => {
  if (!isDragging.value) return;
  dragCurrentX.value = e.clientX;
  if (Math.abs(dragCurrentX.value - dragStartX.value) > 3) {
    hasMovedSignificantly.value = true;
  }
};

const handlePointerUp = async (e: PointerEvent) => {
  if (!isDragging.value) return;
  isDragging.value = false;

  try {
    (e.currentTarget as HTMLElement)?.releasePointerCapture?.(e.pointerId);
  } catch {
    // ignore
  }

  const deltaX = dragCurrentX.value - dragStartX.value;

  if (hasMovedSignificantly.value) {
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
  if (!isDragging.value) return;
  isDragging.value = false;
  try {
    (e.currentTarget as HTMLElement)?.releasePointerCapture?.(e.pointerId);
  } catch {
    // ignore
  }
};

const thumbStyle = computed(() => {
  if (isDragging.value) {
    const deltaX = dragCurrentX.value - dragStartX.value;
    const initialPos = startValue.value ? maxTravelDistance.value : 0;
    const clampedX = Math.min(Math.max(0, initialPos + deltaX), maxTravelDistance.value);
    return {
      transform: `translate(${clampedX}px, -50%)`,
      transition: 'none',
    };
  }
  const travel = currentConfig.value.travel;
  return {
    transform: isChecked.value ? `translate(${travel}, -50%)` : 'translate(0, -50%)',
  };
});
</script>
