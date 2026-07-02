<template>
  <div class="relative w-full group flex items-center">
    <div v-if="$slots.prefix" class="absolute left-3 flex items-center justify-center opacity-40 pointer-events-none">
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
      class="base-input-field w-full font-bold cursor-pointer"
      :class="[
        $slots.prefix ? '!pl-9' : '!pl-3',
        clearable || isPassword ? '!pr-9' : '!pr-3',
        isPassword ? 'css-password-field' : '',
        fontClass,
      ]"
      data-bitwarden-ignore
      autocomplete="off"
    />

    <div class="absolute right-2 flex items-center gap-1.5 pointer-events-auto">
      <button
        v-if="clearable && modelValue && !disabled"
        type="button"
        @click="handleClear"
        class="h-4 w-4 opacity-0 group-hover:opacity-100 focus-within:opacity-100 text-[var(--text-disabled)] hover:text-[var(--color-danger)] flex items-center justify-center hover:text-white bg-[var(--bg-main)] hover:bg-[var(--color-danger)] rounded-full active:scale-90 transition-all"
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
    fontSize: 'xs',
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
      return '!text-[0.7rem] [letter-spacing:0.04em]';
    case 'lg':
      return '!text-base';
    case 'md':
    default:
      return '!text-sm';
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

<script lang="ts">
export default { name: 'BaseInput' };
</script>

<style scoped lang="less">
@import '@/assets/tokens.less';

.base-input-field {
  .mixin-input-base();
  height: 2.2rem;
}

.css-password-frame,
.css-password-field {
  -webkit-text-security: disc !important;
  text-security: disc !important;
}
</style>
