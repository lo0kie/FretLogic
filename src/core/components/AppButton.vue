<template>
  <button
    :type="nativeType"
    class="app-button"
    :class="[sizeClass, variantClass, { 'is-icon-only': iconOnly, 'is-loading': loading, 'is-block': block }]"
    :disabled="disabled || loading"
    data-focusable-inline
    @click="handleClick"
  >
    <span v-if="loading" class="app-button-spinner" aria-hidden="true" />
    <slot v-else name="prefix" />
    <span v-if="$slots.default" class="app-button-label"><slot /></span>
    <slot name="suffix" />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export type AppButtonSize = 'sm' | 'md' | 'lg';
export type AppButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

const props = withDefaults(
  defineProps<{
    /** 尺寸 */
    size?: AppButtonSize;
    /** 视觉变体 */
    variant?: AppButtonVariant;
    disabled?: boolean;
    loading?: boolean;
    /** 仅图标（缩小左右内边距） */
    iconOnly?: boolean;
    /** 占满父容器宽度 */
    block?: boolean;
    /** 原生 button type */
    nativeType?: 'button' | 'submit' | 'reset';
  }>(),
  {
    size: 'md',
    variant: 'primary',
    disabled: false,
    loading: false,
    iconOnly: false,
    block: false,
    nativeType: 'button',
  }
);

const emit = defineEmits<{
  (e: 'click', ev: MouseEvent): void;
}>();

const sizeClass = computed(() => `is-size-${props.size}`);
const variantClass = computed(() => `is-variant-${props.variant}`);

function handleClick(ev: MouseEvent) {
  if (props.disabled || props.loading) return;
  emit('click', ev);
}
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.app-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: @space-xs;
  border: 1px solid transparent;
  border-radius: @radius-md;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  &:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  transition:
    background-color var(--duration-fast) var(--bezier-out),
    color var(--duration-fast) var(--bezier-out),
    border-color var(--duration-fast) var(--bezier-out),
    opacity var(--duration-fast) var(--bezier-out),
    transform var(--duration-fast) var(--bezier-spring);

  &:active:not(:disabled) {
    transform: scale(0.97);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  &.is-block {
    width: 100%;
  }

  &.is-size-sm {
    height: 1.75rem;
    padding: 0 @space-sm;
    font-size: var(--fs-sm);
  }

  &.is-size-md {
    height: 2.25rem;
    padding: 0 @space-md;
    font-size: var(--fs-base);
  }

  &.is-size-lg {
    height: 2.75rem;
    padding: 0 @space-lg;
    font-size: var(--fs-lg);
  }

  &.is-icon-only {
    padding: 0;
    aspect-ratio: 1;
  }

  &.is-variant-primary {
    background: var(--color-primary);
    color: var(--text-on-accent);
    &:hover:not(:disabled) {
      filter: brightness(1.08);
    }
  }

  &.is-variant-secondary {
    background: var(--bg-panel-hover);
    color: var(--text-title);
    border-color: var(--border-light);
    &:hover:not(:disabled) {
      background: var(--bg-elevated);
    }
  }

  &.is-variant-ghost {
    background: transparent;
    color: var(--text-body);
    &:hover:not(:disabled) {
      background: var(--bg-panel-hover);
    }
  }

  &.is-variant-danger {
    background: var(--color-danger);
    color: var(--text-on-accent);
    &:hover:not(:disabled) {
      filter: brightness(1.08);
    }
  }

  &.is-variant-success {
    background: var(--color-success);
    color: var(--text-on-accent);
    &:hover:not(:disabled) {
      filter: brightness(1.08);
    }
  }
}

.app-button-spinner {
  width: 1em;
  height: 1em;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: app-button-spin 0.7s linear infinite;
}

@keyframes app-button-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
