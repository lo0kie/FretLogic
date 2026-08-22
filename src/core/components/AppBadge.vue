<template>
  <span class="app-badge" :class="[`is-variant-${variant}`, { 'is-dot': dot }]">
    <slot>{{ text }}</slot>
  </span>
</template>

<script setup lang="ts">
export type AppBadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger';

withDefaults(
  defineProps<{
    text?: string;
    variant?: AppBadgeVariant;
    /** 圆点模式（不显示文字） */
    dot?: boolean;
  }>(),
  { text: '', variant: 'default', dot: false }
);
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.app-badge {
  display: inline-flex;
  align-items: center;
  gap: @space-2xs;
  padding: 0 @space-sm;
  height: 1.25rem;
  border-radius: 9999px;
  font-size: var(--fs-xs);
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;

  &.is-variant-default {
    background: var(--bg-panel-hover);
    color: var(--text-muted);
  }

  &.is-variant-primary {
    background: var(--tint-primary-88);
    color: var(--color-primary);
  }

  &.is-variant-success {
    background: var(--tint-success-88);
    color: var(--color-success);
  }

  &.is-variant-warning {
    background: var(--tint-warning-88);
    color: var(--color-warning);
  }

  &.is-variant-danger {
    background: var(--tint-danger-88);
    color: var(--color-danger);
  }

  &.is-dot {
    width: 0.5rem;
    height: 0.5rem;
    padding: 0;
  }
}
</style>
