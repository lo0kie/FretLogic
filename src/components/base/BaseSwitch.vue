<template>
  <button
    :id
    ref="switchBtnRef"
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :aria-disabled="disabled"
    :aria-label="ariaLabel || label"
    :disabled="disabled"
    class="group inline-flex items-center gap-sm bg-transparent border-none rounded-full p-0 m-0 cursor-pointer select-none touch-none outline-none box-border align-middle disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none"
    :class="{ 'cursor-grabbing': isDragging }"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
    @pointercancel="handlePointerCancel"
    @keydown.enter.prevent="toggle"
    @keydown.space.prevent="toggle"
  >
    <span
      ref="trackRef"
      class="switch-track relative inline-block rounded-full box-border shrink-0 transition-all duration-base group-focus-visible:ring-2 group-focus-visible:ring-primary/70"
      :class="[
        currentConfig.trackClass,
        modelValue
          ? 'bg-primary group-hover:brightness-105 group-disabled:brightness-100'
          : 'bg-border-base group-hover:brightness-95 group-disabled:brightness-100',
      ]"
    >
      <span
        ref="thumbRef"
        class="switch-thumb absolute top-1/2 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] box-border transition-transform duration-base ease-spring"
        :class="currentConfig.thumbClass"
        :style="thumbStyle"
      />
    </span>

    <span v-if="label || $slots.default" class="switch-label text-xs font-medium text-text-body leading-none">
      <slot> {{ label }} </slot>
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue';

interface Props {
  modelValue?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  id?: string;
  ariaLabel?: string;
}

const { modelValue = false, disabled = false, size = 'md', label, id, ariaLabel } = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'change', value: boolean): void;
}>();

const trackRef = useTemplateRef<HTMLElement>('trackRef');
const thumbRef = useTemplateRef<HTMLElement>('thumbRef');

const isDragging = ref(false);
const dragStartX = ref(0);
const dragCurrentX = ref(0);
const startValue = ref(false);
const maxTravelDistance = ref(16);
const hasMovedSignificantly = ref(false);

const SWITCH_CONFIG: Record<'sm' | 'md' | 'lg', { trackClass: string; thumbClass: string; checkedTranslate: string }> =
  {
    sm: {
      trackClass: 'w-[1.85rem] h-[1.1rem]',
      thumbClass: 'w-[0.85rem] h-[0.85rem] left-[0.125rem]',
      checkedTranslate: 'translate-x-[0.75rem]',
    },
    md: {
      trackClass: 'w-[2.25rem] h-[1.35rem]',
      thumbClass: 'w-[1.05rem] h-[1.05rem] left-[0.15rem]',
      checkedTranslate: 'translate-x-[0.9rem]',
    },
    lg: {
      trackClass: 'w-[2.75rem] h-[1.6rem]',
      thumbClass: 'w-[1.3rem] h-[1.3rem] left-[0.15rem]',
      checkedTranslate: 'translate-x-[1.15rem]',
    },
  };

const currentConfig = computed(() => SWITCH_CONFIG[size] ?? SWITCH_CONFIG.md);

const toggle = () => {
  if (disabled) return;
  const nextVal = !modelValue;
  emit('update:modelValue', nextVal);
  emit('change', nextVal);
};

const handlePointerDown = (e: PointerEvent) => {
  if (disabled || e.button !== 0) return;

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
  startValue.value = modelValue;
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

const handlePointerUp = (e: PointerEvent) => {
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
    const finalVal = targetPos >= maxTravelDistance.value * 0.5;

    if (finalVal !== modelValue) {
      emit('update:modelValue', finalVal);
      emit('change', finalVal);
    }
  } else {
    toggle();
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

const TRAVEL_MAP: Record<'sm' | 'md' | 'lg', string> = {
  sm: '0.75rem',
  md: '0.9rem',
  lg: '1.15rem',
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
  const travel = TRAVEL_MAP[size] || '0.9rem';
  return {
    transform: modelValue ? `translate(${travel}, -50%)` : 'translate(0, -50%)',
  };
});
</script>
