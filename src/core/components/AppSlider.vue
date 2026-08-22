<template>
  <input
    type="range"
    class="app-slider"
    :min="min"
    :max="max"
    :step="step"
    :value="modelValue"
    :disabled="disabled"
    data-focusable-inline
    @input="handleInput"
  />
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: number;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
  }>(),
  { min: 0, max: 100, step: 1, disabled: false }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void;
  (e: 'input', value: number): void;
}>();

function handleInput(ev: Event) {
  const value = Number((ev.target as HTMLInputElement).value);
  emit('update:modelValue', value);
  emit('input', value);
}
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.app-slider {
  width: 100%;
  height: 1.25rem;
  appearance: none;
  background: transparent;
  cursor: pointer;

  &::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 2px;
    background: var(--bg-panel-hover);
  }

  &::-webkit-slider-thumb {
    appearance: none;
    width: 1rem;
    height: 1rem;
    margin-top: -6px;
    border-radius: 50%;
    background: var(--color-primary);
    border: 2px solid var(--bg-body);
    box-shadow: var(--shadow-xs);
    transition: transform var(--duration-fast) var(--bezier-spring);

    &:active {
      transform: scale(1.15);
    }
  }

  &::-moz-range-track {
    height: 4px;
    border-radius: 2px;
    background: var(--bg-panel-hover);
  }

  &::-moz-range-thumb {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
    background: var(--color-primary);
    border: 2px solid var(--bg-body);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
