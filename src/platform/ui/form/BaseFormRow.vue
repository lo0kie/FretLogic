<template>
  <div
    :class="[
      { 'is-disabled opacity-60': disabled, 'is-compacted': compacted },
      align === 'top' ? 'align-top' : 'align-center',
    ]"
    class="base-form-row box-border flex w-full flex-col"
  >
    <div
      :class="[
        layout === 'vertical'
          ? 'flex-col items-start gap-1.5'
          : [align === 'top' ? 'items-start' : 'items-center', compacted ? 'is-compacted gap-sm' : 'gap-md'],
        layout === 'horizontal' && align === 'center' ? CONTROL_HEIGHT_CLASSES.md : '',
      ]"
      class="form-row-main box-border flex w-full"
    >
      <label
        v-if="label || $slots['label']"
        :class="[
          'form-row-label shrink-0 truncate font-semibold select-none',
          resolvedLabelSize === '2xs' ? 'text-2xs' : 'text-xs',
          layout === 'horizontal' && align === 'top' ? labelTopPaddingClass : '',
          required ? 'flex items-center gap-1' : '',
          resolvedLabelTone === 'muted' ? 'text-fg-muted' : 'text-fg-body',
        ]"
        :for="effectiveForId"
        :style="layout === 'horizontal' ? labelStyle : undefined"
      >
        <slot name="label"> {{ label }} </slot>
        <span v-if="required" aria-hidden="true" class="leading-none text-danger">*</span>
      </label>

      <div
        :class="[
          layout === 'vertical' ? 'w-full' : 'flex-1',
          controlAlign === 'start' ? 'justify-start' : controlAlign === 'center' ? 'justify-center' : 'justify-end',
        ]"
        :style="controlStyle"
        class="form-row-control flex min-w-0 items-center *:max-h-full"
      >
        <slot :disabled :required :id="slotControlId" />
      </div>
    </div>

    <div
      v-if="resolvedHelp || resolvedError || $slots['help'] || $slots['error']"
      :class="[resolvedError ? 'text-danger' : 'text-fg-muted']"
      :role="resolvedError ? 'alert' : undefined"
      :style="feedbackStyle"
      aria-live="polite"
      class="form-row-feedback mt-1 w-full text-2xs/relaxed"
    >
      <slot :message="resolvedError" name="error">
        <span v-if="resolvedError">{{ resolvedError }}</span>
      </slot>
      <slot v-if="!resolvedError" :message="resolvedHelp" name="help">
        <span v-if="resolvedHelp">{{ resolvedHelp }}</span>
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, useId } from 'vue';

// 行高引用控件高度标尺契约（md 档），与全工程控件单一真理源保持一致
import { CONTROL_HEIGHT_CLASSES } from '@/platform/ui/controlSizes';
import { FORM_ROW_DENSITY_KEY } from '@/platform/ui/form/formRowContext';
import { resolveComponentWidth } from '@/platform/utils/constants';

import type { FormRowDensityContext } from '@/platform/ui/form/formRowContext';
import type { FormComponentWidth } from '@/platform/utils/constants';

const {
  label = '',
  layout = 'horizontal',
  align = 'center',
  labelWidth,
  controlWidth,
  controlAlign = 'end',
  compacted = false,
  required = false,
  disabled = false,
  error,
  help,
  labelTone,
  labelSize,
  for: forProp,
  inputId,
} = defineProps<{
  /** 行标签文本（无 label 时不渲染标签列） */
  label?: string;
  /** 布局方向：'horizontal' 水平并排（默认） | 'vertical' 上下堆叠 */
  layout?: 'horizontal' | 'vertical';
  /** 水平布局时的垂直对齐：'center' 居中（默认） | 'top' 顶部对齐 */
  align?: 'center' | 'top';
  /** 标签宽度；数值自动补齐 px */
  labelWidth?: string | number;
  /** 控件区宽度档位或具体值；未传时自适应拉伸占满 */
  controlWidth?: FormComponentWidth;
  /** 控件区水平对齐：'start' 靠左 | 'center' 居中 | 'end' 靠右（默认） */
  controlAlign?: 'start' | 'center' | 'end';
  /** 紧凑模式：缩小标签与控件区的间距 */
  compacted?: boolean;
  /** 必填标记：显示 *，并通过默认插槽 props 透传 required（控件侧据此输出 aria-required / 原生 required） */
  required?: boolean;
  /** 禁用态：仅置灰 label 并通过默认插槽 props 透传 disabled——控件侧必须自接该 prop 才真正禁用 */
  disabled?: boolean;
  /** 错误信息文案（优先级高于 help），输出 role="alert" */
  error?: string;
  /** 说明文案 */
  help?: string;
  /** 标签亮度：'body' 常规（默认）| 'muted' 次级（弱化标签，用于让分组标题更突出） */
  labelTone?: 'body' | 'muted';
  /** 标签字号：'xs' 常规（默认）| '2xs' 缩小（用于弱化层级让分组标题更突出） */
  labelSize?: 'xs' | '2xs';
  /** 语义关联：显式指定关联控件 id */
  for?: string;
  /** 自动关联控件 id；与 for 二选一 */
  inputId?: string;
}>();

// 使用 Vue 3.5 useId 保证 SSR 与客户端水合一致
const autoId = useId();

// 密度上下文：BaseCollapse 等容器注入默认值，行内显式 props 优先
const densityContext = inject<FormRowDensityContext | null>(FORM_ROW_DENSITY_KEY, null);
const resolvedLabelTone = computed(() => labelTone ?? densityContext?.labelTone ?? 'body');
const resolvedLabelSize = computed(() => labelSize ?? densityContext?.labelSize ?? 'xs');
/** 供默认插槽接收的控件 id（自动生成一个稳定 id，便于需要自接 id 的控件使用） */
const slotControlId = computed(() => forProp || inputId || `form-row-control-${autoId}`);
// label 的 for 仅在调用方显式给出 for/inputId 时才输出：多数控件（BaseInput/BaseSwitch）用各自的
// useId() 自管原生 id，并不会接收此自动生成的 id，悬空关联会触发浏览器告警
// （Incorrect use of <label for="...">）
const effectiveForId = computed(() => forProp || inputId || undefined);

const normalizedLabelWidth = computed(() => {
  if (labelWidth === undefined) return undefined;
  return typeof labelWidth === 'number' ? `${labelWidth}px` : labelWidth;
});

const labelStyle = computed(() => {
  if (normalizedLabelWidth.value === undefined) return {};
  return { width: normalizedLabelWidth.value, maxWidth: normalizedLabelWidth.value };
});

const controlStyle = computed(() => {
  const width = resolveComponentWidth(controlWidth);
  return width ? { width, flex: 'none' } : {};
});

const feedbackStyle = computed(() => {
  if (layout !== 'horizontal' || normalizedLabelWidth.value === undefined || controlAlign === 'end') {
    return {};
  }
  // 补偿值必须与 form-row-main 的 gap-sm / gap-md 同源：直接引用 Tailwind @theme 注入的
  // --spacing-* 变量，间距 token 调整时此处的对齐缩进自动跟随，无需手工同步
  return {
    paddingLeft: `calc(${normalizedLabelWidth.value} + var(--spacing-${compacted ? 'sm' : 'md'}))`,
  };
});

const resolvedError = computed(() => error || undefined);
const resolvedHelp = computed(() => (resolvedError.value ? undefined : help || undefined));

/**
 * align="top" 时 label 的顶部内边距：间距档 sm 对齐控件内边距，+1px 补偿控件的 1px 边框宽度，
 * 使 label 首行文字与输入框内文字基线对齐（控件边框宽度变更时需同步调整此补偿值）
 */
const labelTopPaddingClass = 'pt-[calc(var(--spacing-sm)+1px)]';
</script>
