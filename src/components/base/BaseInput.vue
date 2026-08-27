<template>
  <div
    v-wave="{ disabled }"
    class="group relative flex items-center box-border rounded-full"
    :style="{ width: resolvedWidth }"
  >
    <div
      v-if="$slots.prefix"
      class="absolute inset-y-0 flex items-center justify-center text-text-disabled pointer-events-none"
      :class="currentConfig.prefixClass"
    >
      <slot name="prefix" />
    </div>

    <input
      :id
      ref="inputRef"
      :type
      :disabled
      :autofocus
      :maxlength
      :placeholder
      :value="modelValue"
      class="w-full font-medium font-[inherit] box-border bg-bg-body border border-border-light rounded-full text-text-title caret-primary outline-none cursor-pointer min-w-0 overflow-hidden text-ellipsis transition-all duration-fast placeholder:text-text-disabled placeholder:font-normal placeholder:truncate hover:enabled:border-border-base focus:enabled:border-primary focus:enabled:bg-bg-body focus-visible:ring-2 focus-visible:ring-primary/70 disabled:opacity-45 disabled:cursor-not-allowed"
      :class="[
        currentConfig.inputClass,
        fontClass,
        $slots.prefix ? currentConfig.prefixPadding : currentConfig.basePaddingLeft,
        computedPaddingRight,
        { '[text-security:disc] [-webkit-text-security:disc]': isPassword },
      ]"
      data-bitwarden-ignore
      autocomplete="off"
      data-focusable-inline
      @input="handleInput"
      @keyup.enter="$emit('enter')"
      @keydown="handleKeydown"
      @wheel="handleWheel"
    />

    <span
      v-if="showCount && maxlength !== undefined"
      class="absolute inset-y-0 flex items-center justify-end text-2xs font-medium text-text-disabled pointer-events-none whitespace-nowrap transition-all duration-fast"
      :class="[
        currentConfig.countClass,
        clearable && modelValue && !disabled ? currentConfig.countWithClearClass : '',
        { '!text-danger font-bold': isAtLimit },
      ]"
    >
      {{ modelValue?.length ?? 0 }}/{{ maxlength }}
    </span>

    <button
      v-if="clearable && modelValue && !disabled"
      v-wave
      type="button"
      class="absolute inset-y-0 my-auto opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 border-none p-0 flex items-center justify-center text-text-disabled bg-bg-panel-hover rounded-full cursor-pointer pointer-events-auto transition-all duration-fast hover:text-text-on-accent hover:bg-danger active:scale-90"
      title="清空内容"
      data-focusable-inline
      :class="currentConfig.clearBtnClass"
      @click.stop="handleClear"
      @pointerdown.stop
      @mousedown.stop
    >
      <X :size="10" stroke-width="3" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { type FormComponentWidth, resolveComponentWidth } from '@/utils/core/constants';
import { X } from '@lucide/vue';
import { computed, nextTick, onMounted, useId, useTemplateRef } from 'vue';

const id = useId();

const {
  placeholder = '',
  disabled = false,
  clearable = false,
  isPassword = false,
  size = 'md',
  width = 'full',
  fontSize = 'md',
  autofocus = false,
  type = 'text',
  maxlength = undefined,
  showCount = false,
  horizontalWheel = true,
} = defineProps<{
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  isPassword?: boolean;
  size?: 'sm' | 'md' | 'lg';
  width?: FormComponentWidth;
  fontSize?: 'xs' | 'md' | 'lg';
  autofocus?: boolean;
  type?: string;
  maxlength?: number;
  showCount?: boolean;
  horizontalWheel?: boolean;
}>();

const modelValue = defineModel<string>({ required: true });
const isAtLimit = computed(() => Boolean(maxlength) && modelValue.value.length >= (maxlength as number));

const emit = defineEmits<{
  (e: 'enter'): void;
  (e: 'clear'): void;
}>();

const inputRef = useTemplateRef<HTMLInputElement>('inputRef');

const INPUT_CONFIG: Record<
  'sm' | 'md' | 'lg',
  {
    inputClass: string;
    basePaddingLeft: string;
    prefixClass: string;
    prefixPadding: string;
    clearBtnClass: string;
    countClass: string;
    countWithClearClass: string;
    paddingRightNormal: string;
    paddingRightCount: string;
    paddingRightClear: string;
    paddingRightBoth: string;
  }
> = {
  sm: {
    inputClass: 'h-[1.6rem]',
    basePaddingLeft: 'pl-2',
    prefixClass: 'left-2',
    prefixPadding: 'pl-6',
    clearBtnClass: 'right-1.5 w-3.5 h-3.5',
    countClass: 'right-2',
    countWithClearClass: 'group-hover:right-6 group-focus-within:right-6',
    paddingRightNormal: 'pr-2',
    paddingRightCount: 'pr-9',
    paddingRightClear: 'group-hover:pr-6 group-focus-within:pr-6',
    paddingRightBoth: 'pr-9 group-hover:pr-14 group-focus-within:pr-14',
  },
  md: {
    inputClass: 'h-[1.9rem]',
    basePaddingLeft: 'pl-2.5',
    prefixClass: 'left-2.5',
    prefixPadding: 'pl-7',
    clearBtnClass: 'right-2 w-4 h-4',
    countClass: 'right-2.5',
    countWithClearClass: 'group-hover:right-7 group-focus-within:right-7',
    paddingRightNormal: 'pr-2.5',
    paddingRightCount: 'pr-11',
    paddingRightClear: 'group-hover:pr-7 group-focus-within:pr-7',
    paddingRightBoth: 'pr-11 group-hover:pr-16 group-focus-within:pr-16',
  },
  lg: {
    inputClass: 'h-[2.3rem]',
    basePaddingLeft: 'pl-3',
    prefixClass: 'left-3',
    prefixPadding: 'pl-8',
    clearBtnClass: 'right-2.5 w-4.5 h-4.5',
    countClass: 'right-3',
    countWithClearClass: 'group-hover:right-8 group-focus-within:right-8',
    paddingRightNormal: 'pr-3',
    paddingRightCount: 'pr-13',
    paddingRightClear: 'group-hover:pr-8 group-focus-within:pr-8',
    paddingRightBoth: 'pr-13 group-hover:pr-18 group-focus-within:pr-18',
  },
};

const currentConfig = computed(() => INPUT_CONFIG[size] ?? INPUT_CONFIG.md);
const resolvedWidth = computed(() => resolveComponentWidth(width) ?? '100%');

const FONT_SIZE_CLASS: Record<string, string> = {
  xs: 'text-xs',
  md: 'text-xs',
  lg: 'text-sm',
};
const fontClass = computed(() => FONT_SIZE_CLASS[fontSize] ?? 'text-xs');

const computedPaddingRight = computed(() => {
  const hasClear = clearable && modelValue.value && !disabled;
  const hasCount = showCount && maxlength !== undefined;
  if (hasClear && hasCount) return currentConfig.value.paddingRightBoth;
  if (hasCount) return currentConfig.value.paddingRightCount;
  if (hasClear) return currentConfig.value.paddingRightClear;
  return currentConfig.value.paddingRightNormal;
});

const handleInput = (e: Event) => {
  modelValue.value = (e.target as HTMLInputElement).value;
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') e.stopPropagation();
};

const handleClear = () => {
  modelValue.value = '';
  emit('clear');
  inputRef.value?.focus();
};

const handleWheel = (e: WheelEvent) => {
  if (!horizontalWheel || disabled || !inputRef.value) return;
  e.preventDefault();
  const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
  inputRef.value.scrollBy({
    left: delta,
    behavior: 'smooth',
  });
};

onMounted(() => {
  if (autofocus) {
    nextTick(() => {
      inputRef.value?.focus();
    });
  }
});
</script>
