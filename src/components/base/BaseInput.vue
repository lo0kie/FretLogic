<template>
  <div class="group relative flex items-center box-border rounded-full" :style="{ width: resolvedWidth }">
    <div
      v-if="$slots.prefix"
      class="absolute inset-y-0 flex items-center justify-center text-text-disabled pointer-events-none"
      :class="currentConfig.prefixClass"
    >
      <slot name="prefix" />
    </div>

    <input
      :id="id"
      ref="inputRef"
      :type="resolvedType"
      :disabled="disabled"
      :readonly="readonly"
      :name="name"
      :minlength="minlength"
      :maxlength="maxlength"
      :pattern="pattern"
      :inputmode="inputmode"
      :required="required"
      :autocomplete="autocomplete"
      :placeholder="placeholder"
      :value="modelValue"
      :aria-invalid="invalid || undefined"
      class="w-full font-medium font-[inherit] box-border bg-bg-body border border-border-light rounded-full text-text-title caret-primary outline-none cursor-text min-w-0 overflow-hidden text-ellipsis transition-all duration-fast placeholder:text-text-disabled placeholder:font-normal placeholder:truncate hover:enabled:border-border-base focus:enabled:border-primary focus:enabled:bg-bg-body focus-visible:ring-2 focus-visible:ring-primary/70 disabled:opacity-45 disabled:cursor-not-allowed"
      :class="[
        currentConfig.inputClass,
        fontClass,
        $slots.prefix ? currentConfig.prefixPadding : currentConfig.basePaddingLeft,
      ]"
      :style="{ paddingRight: computedPaddingRight }"
      data-bitwarden-ignore
      data-focusable-inline
      @input="handleInput"
      @compositionstart="handleCompositionStart"
      @compositionend="handleCompositionEnd"
      @keyup.enter="$emit('enter')"
      @focus="(e: FocusEvent) => $emit('focus', e)"
      @blur="handleBlur"
      @change="(e: Event) => $emit('change', e)"
    />

    <!-- 右侧装饰：计数 / 清空 / 后缀(密码眼睛)，密码眼睛固定在最右侧，清空按钮在左侧展开不引起眼睛位移 -->
    <div
      v-if="hasCount || hasSuffix || hasClear"
      class="absolute inset-y-0 right-2 flex items-center gap-1.5 pointer-events-none"
    >
      <span
        v-if="showCount && maxlength !== undefined"
        class="text-2xs font-medium text-text-disabled whitespace-nowrap transition-all duration-fast"
        :class="{ '!text-danger font-bold': isAtLimit }"
        aria-live="polite"
      >
        {{ modelValue?.length ?? 0 }}/{{ maxlength }}
      </span>

      <button
        v-if="clearable && modelValue && !disabled && !readonly"
        v-wave
        type="button"
        class="pointer-events-auto flex items-center justify-center text-text-disabled bg-bg-panel-hover rounded-full border-none p-0 cursor-pointer overflow-hidden transition-all duration-fast hover:text-text-on-accent hover:bg-danger active:scale-90 w-0 opacity-0 h-4 group-hover:w-4 group-focus-within:w-4 group-hover:opacity-100 group-focus-within:opacity-100"
        title="清空内容"
        data-focusable-inline
        @click.stop="handleClear"
        @pointerdown.stop
        @mousedown.stop
      >
        <X :size="10" stroke-width="3" />
      </button>

      <div v-if="isPasswordMode || $slots.suffix" class="flex items-center justify-center pointer-events-none">
        <slot name="suffix">
          <button
            v-if="isPasswordMode"
            type="button"
            class="pointer-events-auto flex items-center justify-center text-text-disabled hover:text-text-body cursor-pointer transition-colors duration-fast bg-transparent border-none p-0"
            :title="showPassword ? '隐藏密码' : '显示密码'"
            :aria-label="showPassword ? '隐藏密码' : '显示密码'"
            @click.stop="showPassword = !showPassword"
          >
            <component :is="showPassword ? Eye : EyeOff" :size="14" stroke-width="2.5" />
          </button>
        </slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { type FormComponentWidth, resolveComponentWidth } from '@/utils/core/constants';
import { Eye, EyeOff, X } from '@lucide/vue';
import { useEventListener } from '@vueuse/core';
import { computed, nextTick, onMounted, ref, useId, useSlots, useTemplateRef } from 'vue';

const id = useId();
const slots = useSlots();

const {
  placeholder = '',
  disabled = false,
  readonly = false,
  clearable = false,
  isPassword = false,
  size = 'md',
  width = 'full',
  fontSize = 'md',
  autofocus = false,
  type = 'text',
  maxlength = undefined,
  minlength = undefined,
  pattern = undefined,
  inputmode = undefined,
  name = undefined,
  required = false,
  autocomplete = 'off',
  showCount = false,
  horizontalWheel = true,
  trim = false,
  formatter = undefined,
  invalid = false,
} = defineProps<{
  placeholder?: string;
  disabled?: boolean;
  readonly?: boolean;
  clearable?: boolean;
  isPassword?: boolean;
  size?: 'sm' | 'md' | 'lg';
  width?: FormComponentWidth;
  fontSize?: 'xs' | 'md' | 'lg';
  autofocus?: boolean;
  type?: string;
  maxlength?: number;
  minlength?: number;
  pattern?: string;
  inputmode?: 'none' | 'text' | 'numeric' | 'decimal' | 'tel' | 'email' | 'url' | 'search';
  name?: string;
  required?: boolean;
  autocomplete?: string;
  showCount?: boolean;
  horizontalWheel?: boolean;
  /** 失焦或提交时是否自动去除前后空格 */
  trim?: boolean;
  /** 自定义格式化处理函数 */
  formatter?: (val: string) => string;
  /** 校验非法状态（映射到 aria-invalid="true"） */
  invalid?: boolean;
}>();

const modelValue = defineModel<string>({ required: true });

const emit = defineEmits<{
  (e: 'enter'): void;
  (e: 'clear'): void;
  (e: 'focus', event: FocusEvent): void;
  (e: 'blur', event: FocusEvent): void;
  (e: 'change', event: Event): void;
}>();

const inputRef = useTemplateRef<HTMLInputElement>('inputRef');
const showPassword = ref(false);

const isPasswordMode = computed(() => isPassword || type === 'password');

// 密码框模式下默认隐藏明文（'password'），点击眼睛时切换至 'text'
const resolvedType = computed(() => {
  if (isPasswordMode.value) {
    return showPassword.value ? 'text' : 'password';
  }
  return type;
});

const isAtLimit = computed(() => Boolean(maxlength) && (modelValue.value?.length ?? 0) >= (maxlength as number));

const hasClear = computed(() => clearable && modelValue.value && !disabled && !readonly);
const hasCount = computed(() => showCount && maxlength !== undefined);
const hasSuffix = computed(() => Boolean(slots.suffix) || isPasswordMode.value);

// 右内边距预留：按配置能力稳定预占空间，避免输入首字符时产生 padding 跳变与文字抖动
const PR_BASE: Record<string, number> = { sm: 8, md: 10, lg: 12 };
const computedPaddingRight = computed(() => {
  const base = PR_BASE[size] ?? 10;
  const extra = (clearable && !disabled && !readonly ? 24 : 0) + (hasCount.value ? 44 : 0) + (hasSuffix.value ? 24 : 0);
  return `${base + extra}px`;
});

const INPUT_CONFIG: Record<
  'sm' | 'md' | 'lg',
  {
    inputClass: string;
    basePaddingLeft: string;
    prefixClass: string;
    prefixPadding: string;
  }
> = {
  sm: {
    inputClass: 'h-[1.6rem]',
    basePaddingLeft: 'pl-2',
    prefixClass: 'left-2',
    prefixPadding: 'pl-6',
  },
  md: {
    inputClass: 'h-[1.9rem]',
    basePaddingLeft: 'pl-2.5',
    prefixClass: 'left-2.5',
    prefixPadding: 'pl-7',
  },
  lg: {
    inputClass: 'h-[2.3rem]',
    basePaddingLeft: 'pl-3',
    prefixClass: 'left-3',
    prefixPadding: 'pl-8',
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

const isComposing = ref(false);

const formatAndCommit = (raw: string) => {
  let val = raw;
  if (trim) {
    val = val.trim();
  }
  if (formatter) {
    val = formatter(val);
  }
  modelValue.value = val;
  if (inputRef.value && inputRef.value.value !== val) {
    inputRef.value.value = val;
  }
};

const handleInput = (e: Event) => {
  if (isComposing.value) return;
  const targetVal = (e.target as HTMLInputElement).value;
  if (formatter) {
    formatAndCommit(targetVal);
  } else {
    modelValue.value = targetVal;
  }
};

const handleCompositionStart = () => {
  isComposing.value = true;
};

const handleCompositionEnd = (e: Event) => {
  isComposing.value = false;
  const targetVal = (e.target as HTMLInputElement).value;
  formatAndCommit(targetVal);
};

const handleBlur = (e: FocusEvent) => {
  // 若在输入法合成状态下直接失焦，同步最新的 DOM Native Value
  if (isComposing.value) {
    isComposing.value = false;
    const targetVal = (e.target as HTMLInputElement).value;
    formatAndCommit(targetVal);
  } else if (trim) {
    formatAndCommit((e.target as HTMLInputElement).value);
  }
  emit('blur', e);
};

const handleClear = () => {
  modelValue.value = '';
  emit('clear');
  if (inputRef.value) {
    inputRef.value.value = '';
    inputRef.value.dispatchEvent(new Event('input', { bubbles: true }));
    inputRef.value.dispatchEvent(new Event('change', { bubbles: true }));
    inputRef.value.focus();
  }
};

// 响应式管理横向滚轮事件绑定，自动处理响应式切换与组件销毁解绑
useEventListener(
  inputRef,
  'wheel',
  (e: WheelEvent) => {
    if (!horizontalWheel || disabled || !inputRef.value) return;
    e.preventDefault();
    const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
    inputRef.value.scrollBy({
      left: delta,
      behavior: 'smooth',
    });
  },
  { passive: false }
);

onMounted(() => {
  if (autofocus) {
    nextTick(() => inputRef.value?.focus());
  }
});

// 暴露实例方法供父组件直接调用
defineExpose({
  focus: () => inputRef.value?.focus(),
  blur: () => inputRef.value?.blur(),
  select: () => inputRef.value?.select(),
  inputRef,
});
</script>
