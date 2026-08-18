<template>
  <button
    v-wave="{ disabled }"
    :disabled="disabled || loading"
    @click="handleInternalClick"
    :style="normalizedStyle"
    class="action-button-base"
    :class="[sizeClass, themeClass, variantClass, roundedClass, { 'is-icon-only': iconOnly, 'is-texted': texted }]"
    data-focusable-inline
  >
    <Loader2 v-if="loading" class="loading-icon" />
    <slot v-else name="prefix"></slot>
    <span v-if="$slots.default" class="button-content">
      <slot :disabled></slot>
    </span>
    <slot name="suffix"></slot>
  </button>
</template>

<script setup lang="ts">
import { ACTION_BUTTON_DEFAULTS, HEIGHT_LG, HEIGHT_MD, HEIGHT_SM } from '@/constants';
import { Loader2 } from '@lucide/vue';
import { computed } from 'vue';

const {
  primary = false,
  danger = false,
  warning = false,
  disabled = false,
  loading = false,
  iconOnly = false,
  texted = false,
  variant = ACTION_BUTTON_DEFAULTS.VARIANT,
  size = ACTION_BUTTON_DEFAULTS.SIZE,
  rounded = ACTION_BUTTON_DEFAULTS.ROUNDED,
  width,
  height,
} = defineProps<{
  primary?: boolean;
  danger?: boolean;
  warning?: boolean;
  disabled?: boolean;
  loading?: boolean;
  iconOnly?: boolean;
  texted?: boolean;
  variant?: 'default' | 'subtle' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  width?: string | number;
  height?: string | number;
}>();

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void;
}>();

const handleInternalClick = (e: MouseEvent) => {
  emit('click', e);
};

const themeClass = computed(() => {
  if (primary) return 'theme-primary';
  if (danger) return 'theme-danger';
  if (warning) return 'theme-warning';
  return 'theme-default';
});

const normalizedStyle = computed(() => {
  const style: Record<string, string> = {};
  if (width !== undefined) {
    style.width = typeof width === 'number' ? `${width}px` : width;
  }
  if (height !== undefined) {
    style.height = typeof height === 'number' ? `${height}px` : height;
  }
  return style;
});

const variantClass = computed(() => `variant-${variant}`);
const sizeClass = computed(() => `size-${size}`);
const roundedClass = computed(() => `rounded-${rounded}`);
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';
.action-button-base {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  border-style: solid;
  border-width: 1px;
  user-select: none;
  box-sizing: border-box;
  transition: @transition-fast;
  cursor: pointer;
  flex-shrink: 0;
  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
    pointer-events: auto;
  }
  &:active:not(:disabled) {
    transform: scale(0.97);
    transition-duration: 0.1s;
  }
}
.action-button-base.is-texted {
  background-color: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
  padding-left: 0.3rem;
  padding-right: 0.3rem;

  &.theme-primary {
    color: var(--color-primary);
  }
  &.theme-danger {
    color: var(--color-danger);
  }
  &.theme-warning {
    color: var(--color-warning);
  }
  &.theme-default {
    color: var(--text-body);
  }
  &:hover:not(:disabled) {
    background-color: var(--bg-panel-hover) !important;
  }
}
.size-sm {
  height: v-bind('HEIGHT_SM');
  padding: 0 0.7rem;
  font-size: 0.72rem;
  gap: 0.3rem;
}
.size-md {
  height: v-bind('HEIGHT_MD');
  padding: 0 1rem;
  font-size: 0.78rem;
  gap: 0.4rem;
}
.size-lg {
  height: v-bind('HEIGHT_LG');
  padding: 0 1.2rem;
  font-size: 0.85rem;
  gap: 0.45rem;
}
.variant-subtle {
  &.theme-primary {
    background-color: color-mix(in srgb, var(--color-primary), transparent 90%);
    border-color: color-mix(in srgb, var(--color-primary), transparent 90%);
    color: var(--color-primary);
    &:hover:not(:disabled) {
      background-color: color-mix(in srgb, var(--color-primary), transparent 80%);
    }
  }
  &.theme-danger {
    background-color: color-mix(in srgb, var(--color-danger), transparent 90%);
    border-color: color-mix(in srgb, var(--color-danger), transparent 90%);
    color: var(--color-danger);
    &:hover:not(:disabled) {
      background-color: color-mix(in srgb, var(--color-danger), transparent 80%);
    }
  }
  &.theme-warning {
    background-color: color-mix(in srgb, var(--color-warning), transparent 90%);
    border-color: color-mix(in srgb, var(--color-warning), transparent 90%);
    color: var(--color-warning);
    &:hover:not(:disabled) {
      background-color: color-mix(in srgb, var(--color-warning), transparent 80%);
    }
  }
  &.theme-default {
    background-color: var(--bg-panel-hover);
    border-color: var(--border-light);
    color: var(--text-body);
    &:hover:not(:disabled) {
      background-color: var(--border-base);
    }
  }
}
.variant-ghost {
  background-color: transparent;
  border-color: transparent;
  color: var(--text-disabled);
  &.theme-primary {
    color: var(--color-primary);
  }
  &.theme-danger {
    color: var(--color-danger);
  }
  &.theme-warning {
    color: var(--color-warning);
  }
  &:hover:not(:disabled) {
    background-color: var(--bg-panel-hover);
  }
}
.theme-primary:not(.variant-subtle):not(.variant-ghost) {
  background-color: var(--color-primary);
  border-color: transparent;
  color: #ffffff;
  box-shadow: 0 1px 4px color-mix(in srgb, var(--color-primary), transparent 70%);
  &:hover:not(:disabled) {
    opacity: 0.92;
  }
}
.theme-danger:not(.variant-subtle):not(.variant-ghost) {
  color: var(--color-danger);
  border-color: transparent;
  background-color: color-mix(in srgb, var(--color-danger), transparent 88%);
  &:hover:not(:disabled) {
    background-color: color-mix(in srgb, var(--color-danger), transparent 78%);
  }
}
.theme-warning:not(.variant-subtle):not(.variant-ghost) {
  color: var(--color-warning);
  border-color: transparent;
  background-color: color-mix(in srgb, var(--color-warning), transparent 88%);
  &:hover:not(:disabled) {
    background-color: color-mix(in srgb, var(--color-warning), transparent 78%);
  }
}
.theme-default:not(.variant-subtle):not(.variant-ghost) {
  background-color: var(--bg-body);
  border-color: var(--border-light);
  color: var(--text-body);
  &:hover:not(:disabled) {
    border-color: var(--border-base);
    background-color: var(--bg-panel-hover);
    color: var(--text-title);
  }
}
.action-button-base.is-icon-only {
  padding: 0;
  width: auto;
  aspect-ratio: 1 / 1;
}
.action-button-base.rounded-none {
  border-radius: 0;
}
.action-button-base.rounded-sm {
  border-radius: @radius-sm;
}
.action-button-base.rounded-md {
  border-radius: @radius-md;
}
.action-button-base.rounded-lg {
  border-radius: @radius-lg;
}
.action-button-base.rounded-full {
  border-radius: 9999px;
}
.loading-icon {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  opacity: 0.8;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
.button-content {
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
}
@media (pointer: coarse), (max-width: 768px) {
  .size-sm {
    font-size: 0.78rem;
  }
  .size-md {
    font-size: 0.82rem;
  }
  .size-lg {
    font-size: 0.9rem;
  }
}
</style>
