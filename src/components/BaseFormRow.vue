<template>
  <div
    class="base-form-row"
    :class="[
      `align-${align}`,
      {
        'is-compact': compact,
      },
    ]"
  >
    <label v-if="label || $slots.label" class="form-row-label" :style="labelStyle">
      <slot name="label">{{ label }}</slot>
    </label>

    <div class="form-row-control">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    label?: string;
    align?: 'center' | 'top' | 'between';
    labelWidth?: string;
    compact?: boolean;
  }>(),
  {
    label: '',
    align: 'center',
    labelWidth: undefined,
    compact: false,
  }
);

const labelStyle = computed(() => (props.labelWidth ? { width: props.labelWidth } : {}));
</script>

<style scoped lang="scss">
.base-form-row {
  @include flex-between;
  gap: $space-md;
  width: 100%;
  box-sizing: border-box;

  &.align-top {
    align-items: flex-start;
  }

  &.is-compact {
    gap: $space-sm;
  }
}

.form-row-label {
  font-size: $fs-xs;
  font-weight: 600;
  color: var(--text-muted);
  white-space: nowrap;
  flex-shrink: 0;
  user-select: none;
}

.form-row-control {
  flex: 1;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  min-width: 0;
}
</style>
