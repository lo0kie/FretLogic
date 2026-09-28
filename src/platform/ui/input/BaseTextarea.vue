<template>
  <div
    :class="[
      'base-textarea relative w-full rounded-lg border border-solid p-xl transition-all duration-fast focus-within:bg-surface-panel',
      frameClasses,
      rootClass,
    ]"
    :style="rootStyle"
    data-focusable-outline
  >
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
      :aria-invalid="invalid || undefined"
      :spellcheck="!noSpellcheck"
      :value="localValue"
      @blur="handleBlur($event)"
      @change="handleChange($event)"
      @compositionend="handleCompositionEnd($event)"
      @compositionstart="isComposing = true"
      @focus="handleFocus($event)"
      @input="handleInput($event)"
      class="no-scrollbar size-full resize-none border-0 bg-transparent p-0 font-[inherit] text-base/relaxed text-fg-title caret-primary outline-none select-text placeholder:truncate placeholder:font-normal placeholder:text-fg-disabled disabled:cursor-not-allowed disabled:text-fg-disabled disabled:select-none"
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
import { computed, onMounted, ref, useAttrs, useId, useTemplateRef } from 'vue';

import { useLazyModel } from '@/platform/composables/useLazyModel';
import { useFormRowControlId } from '@/platform/ui/form/formRowContext';

import type { CSSProperties } from 'vue';

/**
 * 通用多行文本域：
 * 与 BaseInput 对齐的多行输入控件，支持 v-model、占位符、字数统计（show-count）、maxlength、
 * 玻璃态 / 常规态两种视觉变体、聚焦/失焦事件与失焦合成文本补提交。
 * 覆盖最外层布局类走 fallthrough 到根容器（如 h-full w-full）。
 *
 * **可见盒（描边 / 圆角 / 底色 / 内边距）画在根元素上，文本域只做透明的滚动出口。**
 * 这么分是有理由的：滚动容器的内边距属于**滚动口**（滚动口 = padding box），内容滚进去就把它盖住 ——
 * 长文本一滚，四周的内边距（尤其上边距）就全没了，滚到底时下边距同样看不见。把内边距挪到不滚动的
 * 包裹层上，内容才永远进不去，内边距「始终可见」。
 * 外框位置与改前逐像素一致：消费方给的 `size-full` 依旧落在根上，而原先文本域 `size-full` + 自带描边，
 * 它的边框盒就等于根盒；聚焦环标记（`data-focusable-outline`）也随可见盒落到根上 —— 环由 `closest()`
 * 找到它，几何同样不变（模板里因此**不能**在根元素之前写注释，见 BaseScrollArea 的同款硬约束）。
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
    /** 关闭拼写检查 */
    noSpellcheck?: boolean;
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
    noSpellcheck: false,
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
// 上报原生 textarea 的 id 给所在 BaseFormRow：行的 label 据此输出 for。
// 与 BaseInput 同理，外部传入的 id 会被内联 :id 覆盖，故上报这里生成的 id。
useFormRowControlId(() => id);
/** lazy 修饰符：输入期间只更新本地显示值，change/blur 等提交点才写回 model */
const isLazy = computed(() => Boolean(props.modelModifiers?.lazy));
/** 本地即时值 + lazy 门控提交：状态机与另两个受控控件共用（快照 / 外部同步 / 提交点落盘见 useLazyModel） */
const {
  local: localValue,
  commitLocal,
  flushIfLazy,
} = useLazyModel<string>({
  model: () => modelValue.value,
  commit: v => {
    modelValue.value = v;
  },
  lazy: () => isLazy.value,
});

const textareaRef = useTemplateRef<HTMLTextAreaElement>('textareaRef');

const attrs = useAttrs();
const { class: attrClass, style: attrStyle, ...restAttrs } = attrs;
/** 根容器类：合并调用方 fallthrough 的 class（如 h-full w-full） */
const rootClass = computed(() => attrClass);
/** 根容器内联样式：useAttrs 的 style 既可能是字符串（原生 style="..." 透传）也可能是对象，
 *  断言需覆盖两态，与声明类型 CSSProperties | string | undefined 保持一致 */
const rootStyle = computed<CSSProperties | string | undefined>(() => attrStyle as CSSProperties | string | undefined);

/**
 * 可见盒的类（底色 + 描边 + 悬停 / 校验态）：变体 × 校验态 × 禁用，**一次算全**。
 *
 * 为什么合并成一个 computed：三者都产出 `bg-*` / `border-*`，分成两份时「谁赢」只由 Tailwind 产物里的
 * 先后决定（与类数组顺序无关）。原来那份正是这么写的，属历史包袱，顺手收成一处后每个状态只产出唯一
 * 一份声明。搬过来时按产物顺序核对过两处旧口径：玻璃态的静止描边一直是 `border-glass-border`
 * （它排在 `border-border-light` 之后），而 `border-danger` 排在它之前 —— 玻璃态的 `invalid` 描边
 * 此前根本没显出来，收成一处后按语义生效。
 *
 * `:enabled` 前提改为显式判 disabled：`:enabled` 只对表单元素成立，而描边如今画在包裹盒（div）上，
 * `hover:enabled:` / `disabled:` 这类变体在 div 上永不匹配。
 *
 * 聚焦态只由 ring 指示（与 BaseInput 一致）：1px 边框变色叠加紧贴其外的 2px ring 会呈双边框 ——
 * 故这里不产出任何 `focus:` 描边，聚焦反馈只走根元素上那条 `focus-within:bg-surface-panel`。
 */
const frameClasses = computed(() => {
  if (props.disabled) return 'bg-surface-disabled border-border-disabled';
  const bg = props.variant === 'glass' ? 'bg-surface-panel' : 'bg-surface-body';
  if (props.invalid) return `${bg} border-danger hover:border-danger`;
  return props.variant === 'glass'
    ? `${bg} border-glass-border hover:border-border-base`
    : `${bg} border-border-light hover:border-border-base`;
});

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
  if (isLazy.value) flushIfLazy((e.target as HTMLTextAreaElement).value);
  emit('change', e);
};

/** 合成结束：提交最新文本到模型 */
const handleCompositionEnd = (e: Event) => {
  isComposing.value = false;
  commitLocal((e.target as HTMLTextAreaElement).value);
};

const handleFocus = (e: FocusEvent) => void emit('focus', e);

/** 失焦：补提交合成中未同步的内容，lazy 模式下失焦也是提交点，随后透传 blur */
const handleBlur = (e: FocusEvent) => {
  const wasComposing = isComposing.value;
  isComposing.value = false;
  // 两个独立的落盘理由：合成结束要落盘（否则合成期最后一段丢失），lazy 模式的失焦同样是提交点
  if (wasComposing) commitLocal((e.target as HTMLTextAreaElement).value);
  if (isLazy.value) flushIfLazy((e.target as HTMLTextAreaElement).value);

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
