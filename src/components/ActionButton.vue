<template>
  <button
    :disabled="disabled || loading"
    @click="handleInternalClick"
    :style="{ height, width }"
    class="action-button-base"
    :class="[themeClasses, sizeClasses, variantClasses, { 'is-icon-only': iconOnly, 'is-active': active }]"
  >
    <Loader2 v-if="loading" class="loading-icon" />
    <slot v-else name="prefix"></slot>

    <span v-if="$slots.default" class="button-content">
      <slot></slot>
    </span>

    <slot name="suffix"></slot>
  </button>
</template>

<script setup lang="ts">
import { Loader2 } from '@lucide/vue';
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    primary?: boolean;
    danger?: boolean;
    warning?: boolean;
    disabled?: boolean;
    loading?: boolean;
    active?: boolean;
    iconOnly?: boolean;
    variant?: 'default' | 'subtle' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    width?: string;
    height?: string;
  }>(),
  {
    size: 'md',
    loading: false,
    active: false,
    iconOnly: false,
    variant: 'default',
  }
);

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void;
}>();

const handleInternalClick = (e: MouseEvent) => {
  emit('click', e);
};

const themeClasses = computed(() => {
  if (props.primary) return 'theme-primary';
  if (props.danger) return 'theme-danger';
  if (props.warning) return 'theme-warning';
  return 'theme-default';
});

const variantClasses = computed(() => `variant-${props.variant}`);
const sizeClasses = computed(() => `size-${props.size}`);
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
  border-radius: 9999px;
  user-select: none;
  box-sizing: border-box;
  transition: @transition-fast;
  cursor: pointer;

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    transform: none !important;
    box-shadow: none !important;
    pointer-events: auto;
  }

  &:active:not(:disabled) {
    transform: scale(0.95);
  }

  &.is-icon-only {
    padding: 0 !important;
    border-radius: @radius-md;
    width: 1.6rem;
    height: 1.6rem;
  }

  &.is-active {
    background-color: color-mix(in srgb, var(--color-primary), transparent 88%) !important;
    color: var(--color-primary) !important;
    border-color: color-mix(in srgb, var(--color-primary), transparent 75%) !important;
  }
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

.size-sm {
  height: 1.5rem;
  padding-left: 0.65rem;
  padding-right: 0.65rem;
  font-size: 0.68rem !important;
  gap: 0.3rem;
}

.size-md {
  height: 1.75rem;
  padding-left: 1rem;
  padding-right: 1rem;
  font-size: 0.72rem !important;
  gap: 0.45rem;
}

.size-lg {
  height: 2.5rem;
  padding-left: 1.25rem;
  padding-right: 1.25rem;
  font-size: 0.75rem !important;
  gap: 0.5rem;
}

/* Variant 变体样式 */
.variant-subtle {
  background-color: color-mix(in srgb, var(--color-primary), transparent 90%);
  border-color: transparent;
  color: var(--color-primary);

  &:hover:not(:disabled) {
    background-color: color-mix(in srgb, var(--color-primary), transparent 80%);
  }
}

.variant-ghost {
  background-color: transparent;
  border-color: transparent;
  color: var(--text-disabled);

  &:hover:not(:disabled) {
    background-color: var(--bg-panel-hover);
    color: var(--text-title);
  }
}

.theme-primary {
  background-color: var(--color-primary);
  border-color: transparent;
  color: #ffffff;
  box-shadow: 0 2px 10px color-mix(in srgb, var(--color-primary), transparent 60%);

  &:hover:not(:disabled) {
    opacity: 0.92;
  }
}

.theme-danger {
  color: var(--color-danger);
  border-color: transparent;
  background-color: color-mix(in srgb, var(--color-danger), transparent 88%);

  &:hover:not(:disabled) {
    background-color: color-mix(in srgb, var(--color-danger), transparent 78%);
  }
}

.theme-warning {
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
</style>
