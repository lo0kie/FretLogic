<template>
  <button
    type="button"
    class="app-switch"
    :class="{ 'is-on': checked }"
    role="switch"
    :aria-checked="checked"
    :disabled="disabled"
    data-focusable-inline
    @click="handleToggle"
  >
    <span class="app-switch-thumb" />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue?: boolean;
    disabled?: boolean;
  }>(),
  { modelValue: false, disabled: false }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'change', value: boolean): void;
}>();

const checked = computed(() => props.modelValue);

function handleToggle() {
  if (props.disabled) return;
  const next = !checked.value;
  emit('update:modelValue', next);
  emit('change', next);
}
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.app-switch {
  position: relative;
  width: 2.5rem;
  height: 1.5rem;
  border-radius: 9999px;
  border: 1px solid var(--control-border);
  background: var(--bg-panel-hover);
  cursor: pointer;
  transition: background-color var(--duration-base) var(--bezier-out);

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.is-on {
    background: var(--color-primary);
    border-color: var(--color-primary);
  }
}

.app-switch-thumb {
  position: absolute;
  top: 0.15rem;
  left: 0.2rem;
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 50%;
  background: var(--bg-body);
  box-shadow: var(--shadow-xs);
  transition: transform var(--duration-base) var(--bezier-spring);

  .is-on & {
    transform: translateX(1rem);
  }
}
</style>
