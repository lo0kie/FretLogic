<template>
  <div class="input-wrapper group">
    <div v-if="$slots.prefix" class="prefix-zone">
      <slot name="prefix"></slot>
    </div>

    <input
      :value="modelValue"
      @input="handleInput"
      @keyup.enter="$emit('enter')"
      ref="inputRef"
      type="text"
      :placeholder="placeholder"
      :disabled="disabled"
      class="base-input-field"
      :class="[
        { 'has-prefix': $slots.prefix, 'has-suffix': clearable || isPassword },
        isPassword ? 'css-password-field' : '',
        fontClass,
      ]"
      data-bitwarden-ignore
      autocomplete="off"
    />

    <div class="suffix-zone">
      <button
        v-if="clearable && modelValue && !disabled"
        type="button"
        @click="handleClear"
        class="clear-button"
        title="清空内容"
      >
        <X :size="12" stroke-width="3" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { X } from '@lucide/vue';
import { computed, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    disabled?: boolean;
    clearable?: boolean;
    isPassword?: boolean;
    fontSize?: 'xs' | 'md' | 'lg';
  }>(),
  {
    placeholder: '',
    disabled: false,
    clearable: false,
    isPassword: false,
    fontSize: 'md',
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'enter'): void;
  (e: 'clear'): void;
}>();

const inputRef = ref<HTMLInputElement | null>(null);

const fontClass = computed(() => {
  switch (props.fontSize) {
    case 'xs':
      return 'text-xs-style';
    case 'lg':
      return 'text-lg-style';
    case 'md':
    default:
      return 'text-md-style';
  }
});

const handleInput = (e: Event) => {
  emit('update:modelValue', (e.target as HTMLInputElement).value);
};

const handleClear = () => {
  emit('update:modelValue', '');
  emit('clear');
  inputRef.value?.focus();
};

defineExpose({
  focus: () => inputRef.value?.focus(),
});
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.input-wrapper {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  box-sizing: border-box;

  &:hover .clear-button,
  &:focus-within .clear-button {
    opacity: 1;
  }
}

.prefix-zone {
  position: absolute;
  left: 0.75rem;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.4;
  pointer-events: none;
}

.suffix-zone {
  position: absolute;
  right: 0.5rem;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  pointer-events: auto;
}

.clear-button {
  height: 1rem;
  width: 1rem;
  opacity: 0;
  border: none;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-disabled);
  background-color: var(--bg-main);
  border-radius: 50%;
  cursor: pointer;
  transition: @transition-fast;

  .group:hover &,
  &:focus {
    opacity: 1;
  }

  &:hover {
    color: #ffffff;
    background-color: var(--color-danger);
  }

  &:active {
    transform: scale(0.9);
  }
}

.base-input-field {
  width: 100%;
  font-weight: 700;
  cursor: pointer;
  height: 2.2rem;
  box-sizing: border-box;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
  background-color: var(--bg-body);
  border: @border-solid-base;
  border-radius: @radius-md;
  color: var(--text-title);
  transition: @transition-fast;
  outline: none;

  &:hover:not(:disabled) {
    border-color: color-mix(in srgb, @primary, transparent 50%);
  }

  &:focus:not(:disabled) {
    border-color: @primary;
    box-shadow:
      inset 0 0 0 1px @primary,
      inset 0 0 8px color-mix(in srgb, @primary, transparent 75%);
    background-color: var(--bg-panel);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background-color: var(--bg-panel-hover);
  }

  &.has-prefix {
    padding-left: 1.8rem;
  }

  &.has-suffix {
    padding-right: 1.8rem;
  }
}

.text-xs-style {
  font-size: 0.75rem !important;
  letter-spacing: 0.04em;
}

.text-md-style {
  font-size: 0.8rem !important;
}

.text-lg-style {
  font-size: 0.85rem !important;
}

.css-password-field {
  -webkit-text-security: disc !important;
  text-security: disc !important;
}
</style>
