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
    class="base-switch"
    :class="[
      `size-${size}`,
      {
        'is-checked': modelValue,
        'is-disabled': disabled,
        'is-dragging': isDragging,
      },
    ]"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
    @pointercancel="handlePointerCancel"
    @keydown.enter.prevent="toggle"
    @keydown.space.prevent="toggle"
  >
    <span ref="trackRef" class="switch-track">
      <span ref="thumbRef" class="switch-thumb" :style="dragThumbStyle" />
    </span>
    <span v-if="label || $slots.default" class="switch-label">
      <slot>{{ label }}</slot>
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

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  disabled: false,
  size: 'md',
  label: undefined,
  id: undefined,
  ariaLabel: undefined,
});

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

const toggle = () => {
  if (props.disabled) return;
  const nextVal = !props.modelValue;
  emit('update:modelValue', nextVal);
  emit('change', nextVal);
};

const handlePointerDown = (e: PointerEvent) => {
  if (props.disabled || e.button !== 0) return;

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
  startValue.value = props.modelValue;
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

    if (finalVal !== props.modelValue) {
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

const dragThumbStyle = computed(() => {
  if (!isDragging.value) return undefined;
  const deltaX = dragCurrentX.value - dragStartX.value;
  const initialPos = startValue.value ? maxTravelDistance.value : 0;
  const clampedX = Math.min(Math.max(0, initialPos + deltaX), maxTravelDistance.value);
  return {
    transform: `translate(${clampedX}px, -50%)`,
    transition: 'none',
  };
});
</script>

<style scoped lang="scss">
.base-switch {
  display: inline-flex;
  align-items: center;
  gap: $space-sm;
  background: transparent;
  border: none;
  border-radius: $radius-pill;
  padding: 0;
  margin: 0;
  cursor: pointer;
  user-select: none;
  touch-action: none;
  outline: none !important;
  box-sizing: border-box;
  vertical-align: middle;

  &.is-disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  &.is-dragging {
    cursor: grabbing;

    .switch-thumb {
      transition: none !important;
    }
  }

  &:focus,
  &:focus-visible {
    outline: none !important;
    box-shadow: none !important;

    .switch-track {
      box-shadow: var(--focus-ring) !important;
    }
  }
}

.switch-track {
  position: relative;
  display: inline-block;
  border-radius: $radius-pill;
  background-color: var(--border-base);
  transition:
    background-color $duration-base $bezier-standard,
    box-shadow $duration-fast $bezier-standard;
  box-sizing: border-box;
  flex-shrink: 0;
}

.switch-thumb {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  border-radius: 50%;
  background-color: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  transition:
    transform $duration-base $bezier-spring,
    background-color $duration-base $bezier-standard;
  box-sizing: border-box;
}

.switch-label {
  font-size: $fs-xs;
  font-weight: 500;
  color: var(--text-body);
  line-height: 1;
}

/* 尺寸变体：sm */
.size-sm {
  .switch-track {
    width: 1.85rem; // ~29.6px
    height: 1.1rem; // ~17.6px
  }
  .switch-thumb {
    width: 0.85rem; // ~13.6px
    height: 0.85rem;
    left: 0.125rem;
  }
  &.is-checked .switch-thumb {
    transform: translate(0.75rem, -50%);
  }
}

/* 尺寸变体：md（默认） */
.size-md {
  .switch-track {
    width: 2.25rem; // 36px
    height: 1.35rem; // 21.6px
  }
  .switch-thumb {
    width: 1.05rem; // 16.8px
    height: 1.05rem;
    left: 0.15rem;
  }
  &.is-checked .switch-thumb {
    transform: translate(0.9rem, -50%);
  }
}

/* 尺寸变体：lg */
.size-lg {
  .switch-track {
    width: 2.75rem; // 44px
    height: 1.6rem; // 25.6px
  }
  .switch-thumb {
    width: 1.3rem; // 20.8px
    height: 1.3rem;
    left: 0.15rem;
  }
  &.is-checked .switch-thumb {
    transform: translate(1.15rem, -50%);
  }
}

/* 选中状态 */
.is-checked {
  .switch-track {
    background-color: var(--color-primary);
  }
}

/* 悬浮交互 */
.base-switch:not(.is-disabled):hover {
  .switch-track {
    filter: brightness(0.96);
  }
  &.is-checked .switch-track {
    filter: brightness(1.05);
  }
}
</style>
