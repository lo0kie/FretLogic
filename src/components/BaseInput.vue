<template>
  <div class="input-wrapper">
    <div v-if="$slots.prefix" class="prefix-zone" :class="sizeClass">
      <slot name="prefix"></slot>
    </div>

    <input
      :id="inputId"
      :value="modelValue"
      @input="handleInput"
      @keyup.enter="$emit('enter')"
      ref="inputRef"
      type="text"
      :placeholder="placeholder"
      :disabled="disabled"
      :autofocus="autofocus"
      class="base-input-field"
      :class="[
        sizeClass,
        { 'has-prefix': $slots.prefix, 'has-suffix': clearable || isPassword, 'css-password-field': isPassword },
        fontClass,
      ]"
      data-bitwarden-ignore
      autocomplete="off"
    />

    <button
      v-if="clearable && modelValue && !disabled"
      type="button"
      @click="handleClear"
      class="clear-button"
      title="清空内容"
      :class="sizeClass"
    >
      <X :size="10" stroke-width="3" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { X } from '@lucide/vue';
import { computed, nextTick, onMounted, useId, useTemplateRef } from 'vue';

const inputId = useId();

const {
  placeholder = '',
  disabled = false,
  clearable = false,
  isPassword = false,
  size = 'md',
  fontSize = 'md',
  autofocus = false,
} = defineProps<{
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  isPassword?: boolean;
  size?: 'sm' | 'md' | 'lg';
  fontSize?: 'xs' | 'md' | 'lg';
  /** 挂载后自动聚焦 */
  autofocus?: boolean;
}>();

const modelValue = defineModel<string>({ required: true });

const emit = defineEmits<{
  (e: 'enter'): void;
  (e: 'clear'): void;
}>();

const inputRef = useTemplateRef<HTMLInputElement>('inputRef');
const sizeClass = computed(() => `size-${size}`);

const fontClass = computed(() => {
  switch (fontSize) {
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
  modelValue.value = (e.target as HTMLInputElement).value;
};

const handleClear = () => {
  modelValue.value = '';
  emit('clear');
  inputRef.value?.focus();
};

onMounted(() => {
  if (autofocus) {
    nextTick(() => {
      inputRef.value?.focus();
    });
  }
});

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

/* 前缀定位区域 */
.prefix-zone {
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-disabled);
  pointer-events: none;

  &.size-sm {
    left: 0.4rem;
  }
  &.size-md {
    left: 0.55rem;
  }
  &.size-lg {
    left: 0.75rem;
  }
}

/* 清空按钮原生样式 */
.clear-button {
  position: absolute;
  top: 0;
  bottom: 0;
  margin: auto 0;
  height: 1rem;
  width: 1rem;
  opacity: 0;
  border: none;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-disabled);
  background-color: var(--bg-panel-hover);
  border-radius: 50%;
  cursor: pointer;
  transition: @transition-fast;
  pointer-events: auto;

  &.size-sm {
    right: 0.35rem;
  }
  &.size-md {
    right: 0.5rem;
  }
  &.size-lg {
    right: 0.65rem;
  }

  &:hover {
    color: #ffffff;
    background-color: var(--color-danger);
  }

  &:active {
    transform: scale(0.9);
  }
}

/* 输入框基础样式 */
.base-input-field {
  width: 100%;
  font-weight: 500;
  box-sizing: border-box;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  border-radius: 9999px;
  color: var(--text-title);
  transition: @transition-fast;
  outline: none;
  cursor: pointer;

  &::placeholder {
    color: var(--text-disabled);
    font-weight: 400;
  }

  &:hover:not(:disabled) {
    border-color: var(--border-base);
  }

  &:focus:not(:disabled) {
    border-color: @primary;
    box-shadow: @focus-ring-primary;
    background-color: var(--bg-body);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  /* 尺寸（Size）：与 ActionButton 完全同步 */
  &.size-sm {
    height: 1.5rem;
    padding-left: 0.45rem;
    padding-right: 0.45rem;

    &.has-prefix {
      padding-left: 1.2rem;
    }
    &.has-suffix {
      padding-right: 1.2rem;
    }
  }

  &.size-md {
    height: 1.75rem;
    padding-left: 0.75rem;
    padding-right: 0.75rem;

    &.has-prefix {
      padding-left: 1.6rem;
    }
    &.has-suffix {
      padding-right: 1.6rem;
    }
  }

  &.size-lg {
    height: 2.5rem;
    padding-left: 1rem;
    padding-right: 1rem;

    &.has-prefix {
      padding-left: 2rem;
    }
    &.has-suffix {
      padding-right: 2rem;
    }
  }
}

/* 🌟 优化：通过提高选择器特异性移除 !important */
.base-input-field.text-xs-style {
  font-size: 0.72rem;
}

.base-input-field.text-md-style {
  font-size: 0.78rem;
}

.base-input-field.text-lg-style {
  font-size: 0.85rem;
}

.base-input-field.css-password-field {
  -webkit-text-security: disc;
  text-security: disc;
}

@media (max-width: 768px) {
  .base-input-field {
    &.size-sm {
      height: 1.85rem;
    }
    &.size-md {
      height: 2.15rem;
    }
    &.size-lg {
      height: 2.85rem;
    }
  }

  /* 🌟 优化：移动端同样通过嵌套提高特异性 */
  .base-input-field.text-xs-style {
    font-size: 0.8rem;
  }

  .base-input-field.text-md-style {
    font-size: 0.85rem;
  }
}
</style>
