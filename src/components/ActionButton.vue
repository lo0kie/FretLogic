<template>
  <button
    :disabled="disabled || loading"
    @click="handleInternalClick"
    :style="{ height, width }"
    class="action-button-base"
    :class="[themeClasses, sizeClasses]"
  >
    <Loader2 v-if="loading" class="loading-icon" />
    <slot v-else name="prefix"></slot>
    <span class="button-content">
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
    size?: 'sm' | 'md' | 'lg';
    width?: string;
    height?: string;
  }>(),
  {
    size: 'md',
    loading: false,
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

const sizeClasses = computed(() => `size-${props.size}`);
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.action-button-base {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  border-style: solid;
  border-width: 1px;
  border-radius: @radius-md;
  box-shadow: @shadow-sm;
  user-select: none;
  box-sizing: border-box;
  transition: @transition-fast;
  cursor: pointer;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    transform: none !important;
    box-shadow: none !important;
    pointer-events: auto;
  }

  &:active:not(:disabled) {
    transform: scale(0.96);
  }
}

.loading-icon {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  opacity: 0.8;
  animation: spin 1s linear infinite;
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
  height: 2rem;
  padding-left: 0.75rem;
  padding-right: 0.75rem;
  font-size: 15px !important;
  gap: 0.35rem;
}

.size-md {
  height: 2.25rem;
  padding-left: 1rem;
  padding-right: 1rem;
  font-size: 16px !important;
  gap: 0.45rem;
}

.size-lg {
  height: 2.5rem;
  padding-left: 1.5rem;
  padding-right: 1.5rem;
  font-size: 17px !important;
  gap: 0.4rem;
}

.theme-primary {
  background-color: var(--color-primary);
  border-color: color-mix(in srgb, var(--color-primary), transparent 70%);
  color: #ffffff;

  &:hover:not(:disabled) {
    opacity: 0.9;
  }

  &:active:not(:disabled) {
    opacity: 0.8;
  }
}

.theme-danger {
  color: var(--color-danger);
  border-color: color-mix(in srgb, var(--color-danger), transparent 80%);
  background-color: color-mix(in srgb, var(--color-danger), transparent 90%);

  &:hover:not(:disabled) {
    background-color: color-mix(in srgb, var(--color-danger), transparent 80%);
  }

  &:disabled {
    opacity: 0.5;
  }
}

.theme-warning {
  color: var(--color-warning);
  border-color: color-mix(in srgb, var(--color-warning), transparent 80%);
  background-color: color-mix(in srgb, var(--color-warning), transparent 90%);

  &:hover:not(:disabled) {
    background-color: color-mix(in srgb, var(--color-warning), transparent 80%);
  }

  &:disabled {
    opacity: 0.5;
  }
}

.theme-default {
  background-color: var(--bg-body);
  border-color: var(--border-base);
  color: var(--text-body);

  &:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--color-primary), transparent 70%);
    background-color: color-mix(in srgb, var(--color-primary), transparent 92%);
    color: var(--color-primary);
  }

  &:disabled {
    opacity: 0.5;

    &:hover {
      background-color: var(--bg-body);
      border-color: var(--border-base);
      color: var(--text-body);
    }
  }
}
</style>
