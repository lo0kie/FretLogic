<template>
  <div class="app-tabs" role="tablist">
    <button
      v-for="tab in tabs"
      :key="tab.value"
      type="button"
      role="tab"
      class="app-tabs-item"
      :class="{ 'is-active': modelValue === tab.value, 'is-disabled': tab.disabled }"
      :aria-selected="modelValue === tab.value"
      :disabled="tab.disabled"
      data-focusable-inline
      @click="select(tab)"
    >
      <slot name="label" :tab="tab">
        {{ tab.label }}
      </slot>
    </button>
  </div>
</template>

<script setup lang="ts">
export interface AppTabItem {
  label: string;
  value: string | number;
  disabled?: boolean;
}

defineProps<{
  modelValue: string | number;
  tabs: AppTabItem[];
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | number): void;
}>();

function select(tab: AppTabItem) {
  if (tab.disabled || tab.value === '') return;
  emit('update:modelValue', tab.value);
}
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.app-tabs {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: @radius-md;
  background: var(--bg-panel-hover);
}

.app-tabs-item {
  border: none;
  background: transparent;
  padding: @space-xs @space-md;
  border-radius: @radius-sm;
  font-size: var(--fs-sm);
  color: var(--text-muted);
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--bezier-out),
    color var(--duration-fast) var(--bezier-out);

  &.is-active {
    background: var(--bg-body);
    color: var(--text-title);
    box-shadow: var(--shadow-xs);
  }

  &.is-disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:not(.is-active):not(.is-disabled):hover {
    color: var(--text-title);
  }
}
</style>
