<template>
  <div :class="['base-textarea relative box-border w-full', rootClass]" :style="rootStyle">
    <textarea
      v-bind="restAttrs"
      :autocomplete
      :disabled
      :id
      :maxlength
      :name
      :placeholder
      :readonly
      :required
      :rows
      :spellcheck
      :aria-invalid="invalid || undefined"
      :class="[variantClasses, stateBorderClasses]"
      :value="localValue"
      @blur="handleBlur($event)"
      @change="handleChange($event)"
      @compositionend="handleCompositionEnd($event)"
      @compositionstart="isComposing = true"
      @focus="handleFocus($event)"
      @input="handleInput($event)"
      data-focusable-inline
      class="no-scrollbar box-border size-full resize-none rounded-lg border border-solid p-xl font-[inherit] text-base/relaxed text-fg-title caret-primary transition-all duration-fast outline-none select-text placeholder:truncate placeholder:font-normal placeholder:text-fg-disabled focus-visible:ring-2 focus:enabled:bg-surface-panel disabled:cursor-not-allowed disabled:bg-surface-body disabled:opacity-45 disabled:select-none"
      ref="textareaRef"
    />
    <span
      v-if="showCount"
      :class="{ 'font-bold text-danger!': isAtLimit }"
      aria-live="polite"
      class="pointer-events-none absolute right-3 bottom-2 rounded-md px-1.5 py-0.5 text-2xs font-medium text-fg-muted opacity-80"
    >
      {{ maxlength !== undefined ? `${localValue?.length ?? 0}/${maxlength}` : `${localValue?.length ?? 0} 字` }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, useAttrs, useId, useTemplateRef, watch } from 'vue';

import type { CSSProperties } from 'vue';

/**
 * 通用多行文本域：
 * 与 BaseInput 对齐的多行输入控件，支持 v-model、占位符、字数统计（show-count）、maxlength、
 * 玻璃态 / 常规态两种视觉变体、聚焦/失焦事件与失焦合成文本补提交。
 * 覆盖最外层布局类走 fallthrough 到根容器（如 h-full w-full）；文本域自带固定内边距与圆角。
 */
defineOptions({ name: 'BaseTextarea', inheritAttrs: false });

const modelValue = defineModel<string>({ required: true });

const props = withDefaults(
  defineProps<{
    /** 空内容时显示的占位提示文本 */
    placeholder?: string;
    /** 禁用交互并置灰 */
    disabled?: boolean;
    /** 是否只读（可聚焦选中但不可编辑） */
    readonly?: boolean;
    /** 校验非法状态（映射到 aria-invalid="true"） */
    invalid?: boolean;
    /** 视觉变体：glass（半透明面板玻璃态，用于乐谱编辑等浮层场景）| default（实底常规态） */
    variant?: 'default' | 'glass';
    /** 是否在右下角展示实时字数统计（maxlength 存在时显示 x/max，否则显示 N 字） */
    showCount?: boolean;
    /** 最大输入长度；配合 showCount 显示 x/max */
    maxlength?: number;
    /** 原生表单字段名 */
    name?: string;
    /** 原生必填校验标记 */
    required?: boolean;
    /** 默认可见行数；未传时由外部高度样式决定 */
    rows?: number;
    /** 原生自动填充行为，默认 'off' */
    autocomplete?: string;
    /** 是否开启拼写检查，默认 true */
    spellcheck?: boolean;
    /** 挂载后自动聚焦 */
    autofocus?: boolean;
    /** v-model.lazy 修饰符载体：vue-tsc 对 defineModel 修饰符未生成 prop 类型，此处显式声明 */
    modelModifiers?: { lazy?: boolean };
  }>(),
  {
    placeholder: '',
    disabled: false,
    readonly: false,
    invalid: false,
    variant: 'default',
    showCount: false,
    maxlength: undefined,
    name: undefined,
    required: false,
    rows: undefined,
    autocomplete: 'off',
    spellcheck: true,
    autofocus: false,
  }
);

const emit = defineEmits<{
  (e: 'focus', event: FocusEvent): void;
  (e: 'blur', event: FocusEvent): void;
  (e: 'change', event: Event): void;
  (e: 'clear'): void;
}>();
const id = useId();
/** lazy 修饰符：输入期间只更新本地显示值，change/blur 等提交点才写回 model */
const isLazy = computed(() => !!props.modelModifiers?.lazy);
/** 本地即时值：lazy 模式下输入中间态先落在这里，避免逐键写回 model（初值为一次性快照，后续由 watch 同步；AST 规则误报豁免） */
// eslint-disable-next-line vue/no-ref-object-reactivity-loss
const localValue = ref<string>(modelValue.value);
// 外部 model 变化时同步本地显示值（lazy 期间不写 model，无回环风险）
watch(modelValue, v => {
  localValue.value = v;
});
/** 统一写入入口：总是更新本地显示值；非 lazy 时同步写回 model */
const commitLocal = (val: string) => {
  localValue.value = val;
  if (!isLazy.value) modelValue.value = val;
};

const textareaRef = useTemplateRef<HTMLTextAreaElement>('textareaRef');

const attrs = useAttrs();
const { class: attrClass, style: attrStyle, ...restAttrs } = attrs;
/** 根容器类：合并调用方 fallthrough 的 class（如 h-full w-full） */
const rootClass = computed(() => attrClass);
/** 根容器内联样式：useAttrs 的 style 既可能是字符串（原生 style="..." 透传）也可能是对象，
 *  断言需覆盖两态，与声明类型 CSSProperties | string | undefined 保持一致 */
const rootStyle = computed<CSSProperties | string | undefined>(() => attrStyle as CSSProperties | string | undefined);

const variantClasses = computed(() =>
  props.variant === 'glass'
    ? 'bg-surface-panel border-glass-border'
    : 'bg-surface-body border-border-light hover:enabled:border-border-base'
);

const stateBorderClasses = computed(() =>
  props.invalid
    ? 'border-danger hover:enabled:border-danger focus:enabled:border-danger focus-visible:ring-danger/70'
    : 'border-border-light hover:enabled:border-border-base focus:enabled:border-primary focus-visible:ring-primary/70'
);

const isAtLimit = computed(
  () => Boolean(props.maxlength) && (localValue.value?.length ?? 0) >= (props.maxlength as number)
);

const isComposing = ref(false);

// 挂载后按 autofocus 聚焦（与 BaseInput 的同名 prop 行为对齐）
onMounted(() => {
  if (props.autofocus && !props.disabled && !props.readonly) textareaRef.value?.focus();
});

/** 输入同步：输入法合成期间跳过（由 compositionend 统一提交） */
const handleInput = (e: Event) => {
  if (isComposing.value) return;
  commitLocal((e.target as HTMLTextAreaElement).value);
};

/** change（失焦）：lazy 模式下的提交点，把最终输入写回 model */
const handleChange = (e: Event) => {
  if (isLazy.value) commitLocal((e.target as HTMLTextAreaElement).value);
  emit('change', e);
};

/** 合成结束：提交最新文本到模型 */
const handleCompositionEnd = (e: Event) => {
  isComposing.value = false;
  commitLocal((e.target as HTMLTextAreaElement).value);
};

const handleFocus = (e: FocusEvent) => {
  emit('focus', e);
};

/** 失焦：补提交合成中未同步的内容，lazy 模式下失焦也是提交点，随后透传 blur */
const handleBlur = (e: FocusEvent) => {
  const wasComposing = isComposing.value;
  isComposing.value = false;
  if (wasComposing || isLazy.value) {
    commitLocal((e.target as HTMLTextAreaElement).value);
  }
  emit('blur', e);
};

// 暴露实例方法供父组件直接调用
defineExpose({
  focus: () => textareaRef.value?.focus(),
  blur: () => textareaRef.value?.blur(),
  select: () => textareaRef.value?.select(),
  textareaRef,
});
</script>
