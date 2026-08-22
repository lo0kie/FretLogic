<template>
  <div class="app-select">
    <select
      class="app-select-native"
      :value="modelValue"
      :disabled="disabled"
      data-focusable-outline
      @change="handleChange"
    >
      <option v-if="placeholder" value="" disabled>
        {{ placeholder }}
      </option>
      <option v-for="opt in options" :key="opt.value" :value="opt.value" :disabled="opt.disabled">
        {{ opt.label }}
      </option>
    </select>
  </div>
</template>

<script setup lang="ts">
export interface AppSelectOption {
  label: string;
  value: string | number;
  disabled?: boolean;
}

withDefaults(
  defineProps<{
    modelValue: string | number;
    options: AppSelectOption[];
    placeholder?: string;
    disabled?: boolean;
  }>(),
  { placeholder: '', disabled: false }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | number): void;
  (e: 'change', value: string | number): void;
}>();

function handleChange(ev: Event) {
  const el = ev.target as HTMLSelectElement;
  const value: string | number = el.value;
  emit('update:modelValue', value);
  emit('change', value);
}
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.app-select {
  position: relative;
  display: inline-flex;
  width: 100%;

  &::after {
    content: '';
    position: absolute;
    right: @space-md;
    top: 50%;
    width: 0.5rem;
    height: 0.5rem;
    border-right: 1.5px solid var(--text-muted);
    border-bottom: 1.5px solid var(--text-muted);
    transform: translateY(-70%) rotate(45deg);
    pointer-events: none;
  }
}

.app-select-native {
  width: 100%;
  height: 2.25rem;
  padding: 0 @space-xl 0 @space-md;
  border: 1px solid var(--control-border);
  border-radius: @radius-md;
  background: var(--bg-body);
  color: var(--text-body);
  font-size: var(--fs-base);
  appearance: none;
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--bezier-out);

  &:focus-visible {
    border-color: var(--color-primary);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
