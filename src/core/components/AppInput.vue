<template>
  <input
    class="app-input"
    :value="modelValue"
    :type="type"
    :placeholder="placeholder"
    :disabled="disabled"
    :readonly="readonly"
    data-focusable-outline
    @input="handleInput"
  />
</template>

<script setup lang="ts">
const {
  modelValue = '',
  type = 'text',
  placeholder = '',
  disabled = false,
  readonly = false,
} = defineProps<{
  modelValue?: string;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'input', value: string): void;
}>();

function handleInput(ev: Event) {
  const value = (ev.target as HTMLInputElement).value;
  emit('update:modelValue', value);
  emit('input', value);
}
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.app-input {
  width: 100%;
  height: 2.25rem;
  padding: 0 @space-md;
  border: 1px solid var(--control-border);
  border-radius: @radius-md;
  background: var(--bg-body);
  color: var(--text-body);
  font-size: var(--fs-base);
  box-sizing: border-box;
  transition:
    border-color var(--duration-fast) var(--bezier-out),
    box-shadow var(--duration-fast) var(--bezier-out);

  &::placeholder {
    color: var(--text-disabled);
  }

  &:focus-visible {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 30%, transparent);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
