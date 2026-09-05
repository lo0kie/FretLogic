<template>
  <div
    :class="{ 'cursor-not-allowed select-none': disabled }"
    :style="{ width: resolvedWidth }"
    @focusin="isFocused = true"
    @focusout="isFocused = false"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    class="group relative box-border flex items-center rounded-full"
  >
    <div
      v-if="hasPrefix"
      :class="currentConfig.prefixClass"
      class="text-text-disabled pointer-events-none absolute inset-y-0 flex items-center justify-center"
    >
      <slot name="prefix">
        <BaseIcon
          v-if="prefixIcon"
          :name="prefixIcon"
          aria-hidden="true"
          class="shrink-0"
          icon-size="sm"
          icon-stroke="regular"
        />
      </slot>
    </div>

    <input
      :autocomplete
      :disabled
      :id
      :inputmode
      :maxlength
      :minlength
      :name
      :pattern
      :placeholder
      :readonly
      :required
      :aria-invalid="invalid || undefined"
      :class="[
        currentConfig.inputClass,
        fontClass,
        stateBorderClasses,
        hasPrefix ? currentConfig.prefixPadding : currentConfig.basePaddingLeft,
      ]"
      :style="{ paddingRight: computedPaddingRight }"
      :type="resolvedType"
      :value="modelValue"
      @blur="handleBlur"
      @change="(e: Event) => $emit('change', e)"
      @compositionend="handleCompositionEnd"
      @compositionstart="handleCompositionStart"
      @focus="(e: FocusEvent) => $emit('focus', e)"
      @input="handleInput"
      @keyup.enter="$emit('enter')"
      data-focusable-inline
      class="bg-bg-body text-text-title caret-primary duration-fast placeholder:text-text-disabled focus:enabled:bg-bg-body box-border w-full min-w-0 cursor-text overflow-hidden rounded-full border border-solid font-[inherit] font-medium text-ellipsis transition-all outline-none placeholder:truncate placeholder:font-normal focus-visible:ring-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 disabled:select-none"
      data-1p-ignore="true"
      data-bwignore="true"
      data-form-type="other"
      data-lpignore="true"
      data-protonpass-ignore="true"
      ref="inputRef"
    />

    <div
      v-if="hasCount || hasSuffix || isClearAvailable"
      class="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1.5"
      ref="rightSlotRef"
    >
      <span
        v-if="showCount && maxlength !== undefined"
        :class="{ 'text-danger! font-bold': isAtLimit }"
        aria-live="polite"
        class="text-2xs text-text-disabled duration-fast font-medium whitespace-nowrap transition-all"
      >
        {{ modelValue?.length ?? 0 }}/{{ maxlength }}
      </span>

      <button
        v-wave
        v-if="isClearAvailable"
        :class="
          clearVisible
            ? 'pointer-events-auto h-4 w-4 scale-100 opacity-100'
            : 'pointer-events-none -mr-1.5 h-4 w-0 scale-0 opacity-0'
        "
        @mousedown.stop
        @pointerdown.stop
        @click.stop="handleClear"
        data-focusable-inline
        class="text-text-disabled bg-bg-panel-hover hover:bg-danger hover:text-text-on-accent flex cursor-pointer items-center justify-center overflow-hidden rounded-full border-none p-0 transition-all duration-200 outline-none active:scale-90"
        tabindex="0"
        title="清空内容"
        type="button"
      >
        <BaseIcon icon-size="sm" icon-stroke="bold" name="x" />
      </button>

      <div v-if="isPasswordMode || $slots['suffix']" class="pointer-events-none flex items-center justify-center">
        <slot name="suffix">
          <button
            v-if="isPasswordMode"
            v-wave="{ disabled }"
            :disabled
            :aria-label="showPassword ? '隐藏密码' : '显示密码'"
            :class="
              disabled
                ? 'pointer-events-none opacity-40'
                : 'hover:text-text-title hover:bg-bg-panel-hover pointer-events-auto cursor-pointer active:scale-90'
            "
            :title="showPassword ? '隐藏密码' : '显示密码'"
            @mousedown.stop
            @pointerdown.stop
            @click.stop="!disabled && (showPassword = !showPassword)"
            data-focusable-inline
            class="text-text-disabled duration-fast flex h-4 w-4 items-center justify-center rounded-full border-none bg-transparent p-0 transition-all outline-none"
            type="button"
          >
            <BaseIcon :icon-size="'xs'" :name="showPassword ? 'eye' : 'eye-off'" />
          </button>
        </slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, useSlots, useTemplateRef, watch } from 'vue';

import type { ComponentSize } from '@/platform/types';
import { CONTROL_HEIGHT_CLASSES } from '@/platform/ui/controlSizes';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import type { IconName } from '@/platform/ui/icons/icons.registry';
import { resolveComponentWidth, type FormComponentWidth } from '@/platform/utils/constants';

const id = useId();
const slots = useSlots();

const {
  placeholder = '',
  disabled = false,
  readonly = false,
  clearable = false,
  isPassword = false,
  prefixIcon = undefined,
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
  trim = false,
  formatter = undefined,
  invalid = false,
} = defineProps<{
  placeholder?: string;
  disabled?: boolean;
  readonly?: boolean;
  clearable?: boolean;
  isPassword?: boolean;
  /** 前缀图标名（注册表枚举）：无需包 #prefix slot 即可在输入框左侧渲染图标；传了 #prefix slot 时 slot 优先 */
  prefixIcon?: IconName;
  size?: ComponentSize;
  width?: FormComponentWidth;
  fontSize?: 'xs' | 'md' | 'lg';
  autofocus?: boolean;
  /** 原生 input 类型；password 走 isPasswordMode 的明文/密文切换逻辑 */
  type?: 'text' | 'password' | 'email' | 'search' | 'url' | 'tel' | (string & {});
  maxlength?: number;
  minlength?: number;
  pattern?: string;
  inputmode?: 'none' | 'text' | 'numeric' | 'decimal' | 'tel' | 'email' | 'url' | 'search';
  name?: string;
  required?: boolean;
  autocomplete?: string;
  showCount?: boolean;
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

// 边框/焦点环配色按校验状态二选一，避免两组同权重 Tailwind 类共存时由 CSS 顺序决定胜者
const stateBorderClasses = computed(() =>
  invalid
    ? 'border-danger hover:enabled:border-danger focus:enabled:border-danger focus-visible:ring-danger/70'
    : 'border-border-light hover:enabled:border-border-base focus:enabled:border-primary focus-visible:ring-primary/70'
);

const isClearAvailable = computed(() => clearable && !disabled && !readonly);
const hasCount = computed(() => showCount && maxlength !== undefined);
const hasSuffix = computed(() => Boolean(slots['suffix']) || isPasswordMode.value);

// 清空按钮仅在「有内容 且（悬停输入框 或 输入框聚焦）」时才可见；
// 不可见时塌缩为 w-0（不占任何布局位），故输入框文本不被预留空间挤占，也不会与省略号重叠
const isHovered = ref(false);
const isFocused = ref(false);
const clearVisible = computed(
  () => isClearAvailable.value && Boolean(modelValue.value) && (isHovered.value || isFocused.value)
);

// 右内边距预留：输入框右侧叠加了字数统计 / 清空按钮 / 密码眼睛等绝对定位元素，
// 需为其预留空间，否则计数文本会与输入框文本（含省略号）重叠。
// 直接用 ResizeObserver 测量「右侧叠加容器的真实渲染宽度」（含计数/清空/眼睛及其间 gap），
// 这是屏幕上的真实占宽，不依赖逐项估算，可覆盖字体异步加载变宽、字数增减、isAtLimit 加粗等场景。
const PR_BASE: Record<string, number> = { sm: 4, md: 6, lg: 8 };
const RIGHT_OFFSET = 8; // 叠加容器绝对定位在 right-2（8px）

const rightSlotRef = useTemplateRef<HTMLDivElement>('rightSlotRef');
// 首帧用估算兜底（clearable 按「常显清空」取最大值，预留偏宽更安全），挂载后实测纠正，避免首帧闪一下
const rightSlotWidth = ref(
  (() => {
    if (!(hasCount.value || hasSuffix.value || isClearAvailable.value)) return 0;
    const widths: number[] = [];
    if (hasCount.value && maxlength !== undefined) widths.push((String(maxlength).length * 2 + 1) * 6 + 12);
    if (isClearAvailable.value) widths.push(16); // 清空 w-4
    if (hasSuffix.value) widths.push(16); // 眼睛 w-4
    if (widths.length === 0) return 0;
    return widths.reduce((s, w) => s + w, 0) + (widths.length - 1) * 6;
  })()
);

/** 实测右侧叠加容器渲染宽度，纠正首帧估算的预留值 */
const measureRightSlot = () => {
  if (rightSlotRef.value) rightSlotWidth.value = rightSlotRef.value.offsetWidth;
};

// 字数 / maxlength / 清空显隐 / 后缀变化都可能改变右侧叠加宽度，重测（无 RO 环境兜底）
watch(
  () => [modelValue.value?.length ?? 0, maxlength, clearVisible.value, hasSuffix.value, hasCount.value] as const,
  () => nextTick(measureRightSlot)
);

const computedPaddingRight = computed(() => {
  const base = PR_BASE[size] ?? 10;
  // 叠加容器实测宽度 + right-2 偏移（8px）+ 文本间隙 base，即为距输入框右缘的总预留
  return `${base + (rightSlotWidth.value > 0 ? rightSlotWidth.value + RIGHT_OFFSET : 0)}px`;
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
    inputClass: `${CONTROL_HEIGHT_CLASSES.sm}`,
    basePaddingLeft: 'pl-2',
    prefixClass: 'left-2',
    prefixPadding: 'pl-6',
  },
  md: {
    inputClass: `${CONTROL_HEIGHT_CLASSES.md}`,
    basePaddingLeft: 'pl-2.5',
    prefixClass: 'left-2.5',
    prefixPadding: 'pl-7',
  },
  lg: {
    inputClass: `${CONTROL_HEIGHT_CLASSES.lg}`,
    basePaddingLeft: 'pl-3',
    prefixClass: 'left-3',
    prefixPadding: 'pl-8',
  },
};

const currentConfig = computed(() => INPUT_CONFIG[size] ?? INPUT_CONFIG.md);
/** 是否存在前缀区（#prefix slot 优先，其次 prefix-icon prop）：决定容器显隐与输入框左内边距 */
const hasPrefix = computed(() => Boolean(slots['prefix']) || Boolean(prefixIcon));
const resolvedWidth = computed(() => resolveComponentWidth(width) ?? '100%');

const FONT_SIZE_CLASS: Record<string, string> = {
  xs: 'text-xs',
  md: 'text-xs',
  lg: 'text-sm',
};
const fontClass = computed(() => FONT_SIZE_CLASS[fontSize] ?? 'text-xs');

const isComposing = ref(false);

/** 应用 trim 与 formatter 后写回模型，并同步 DOM 值 */
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

/** 输入同步：输入法合成期间跳过（由 compositionend 统一提交） */
const handleInput = (e: Event) => {
  if (isComposing.value) return;
  const targetVal = (e.target as HTMLInputElement).value;
  if (formatter) {
    formatAndCommit(targetVal);
  } else {
    modelValue.value = targetVal;
  }
};

/** 进入输入法合成态：暂停输入同步 */
const handleCompositionStart = () => {
  isComposing.value = true;
};

/** 合成结束：提交最终文本（走 trim / formatter） */
const handleCompositionEnd = (e: Event) => {
  isComposing.value = false;
  const targetVal = (e.target as HTMLInputElement).value;
  formatAndCommit(targetVal);
};

/** 失焦：补提交合成中 / 未 trim 的内容，并派发 blur */
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

/** 清空内容：重置模型与 DOM 值，补发 input / change 事件并保持聚焦 */
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

// 持续追踪右侧叠加容器真实宽度的观察器（覆盖字体异步加载变宽、字数增减、isAtLimit 加粗、清空显隐等场景）
let rightSlotObserver: ResizeObserver | undefined;

onMounted(() => {
  // 挂载后测量右侧叠加容器真实宽度，纠正首帧估算值，避免长 maxlength 下重叠
  nextTick(measureRightSlot);
  // ResizeObserver 在叠加容器宽度变化时（如 web font 替换 fallback 字体后变宽、清空按钮显隐）自动重测，
  // 防止「首帧用偏窄 fallback 字体测量 → 字体换上后变宽 → 预留不足 → 文本与计数重叠」的回归
  if (typeof ResizeObserver !== 'undefined' && rightSlotRef.value) {
    rightSlotObserver = new ResizeObserver(() => measureRightSlot());
    rightSlotObserver.observe(rightSlotRef.value);
  }
  // 兜底：异步字体加载完成后再测一次
  if (typeof document !== 'undefined' && 'fonts' in document) {
    document.fonts.ready.then(measureRightSlot).catch(() => undefined);
  }
  if (autofocus) {
    nextTick(() => inputRef.value?.focus());
  }
});

onBeforeUnmount(() => {
  rightSlotObserver?.disconnect();
});

// 暴露实例方法供父组件直接调用
defineExpose({
  focus: () => inputRef.value?.focus(),
  blur: () => inputRef.value?.blur(),
  select: () => inputRef.value?.select(),
  inputRef,
});
</script>
