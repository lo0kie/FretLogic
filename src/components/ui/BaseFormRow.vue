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
      ]"
      class="form-row-main box-border flex w-full"
    >
      <label
        v-if="label || $slots['label']"
        :class="[
          layout === 'horizontal' && align === 'top' ? 'pt-[calc(0.5rem+1px)]' : '',
          required ? 'flex items-center gap-1' : '',
        ]"
        :for="effectiveForId"
        :style="layout === 'horizontal' ? labelStyle : undefined"
        class="form-row-label text-text-body shrink-0 overflow-hidden text-xs font-semibold text-ellipsis whitespace-nowrap select-none"
      >
        <slot name="label"> {{ label }} </slot>
        <span v-if="required" aria-hidden="true" class="text-danger leading-none">*</span>
      </label>

      <div
        :class="[
          layout === 'vertical' ? 'w-full' : 'flex-1',
          controlAlign === 'start' ? 'justify-start' : controlAlign === 'center' ? 'justify-center' : 'justify-end',
        ]"
        :style="controlStyle"
        class="form-row-control flex min-w-0 items-center"
      >
        <slot :disabled :id="slotControlId" :required />
      </div>
    </div>

    <div
      v-if="resolvedHelp || resolvedError || $slots['help'] || $slots['error']"
      :class="[resolvedError ? 'text-danger' : 'text-text-muted']"
      :role="resolvedError ? 'alert' : undefined"
      :style="feedbackStyle"
      aria-live="polite"
      class="form-row-feedback text-2xs mt-1 w-full leading-relaxed"
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

<script lang="ts" setup>
import { computed, useId } from 'vue';

import { resolveComponentWidth, type FormComponentWidth } from '@/utils/core/constants';

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
  for: forProp,
  inputId,
} = defineProps<{
  label?: string;
  /** 布局方向：'horizontal' 水平并排（默认） | 'vertical' 上下堆叠 */
  layout?: 'horizontal' | 'vertical';
  /** 水平布局时的垂直对齐：'center' 居中（默认） | 'top' 顶部对齐 */
  align?: 'center' | 'top';
  /** 标签宽度；数值自动补齐 px */
  labelWidth?: string | number;
  controlWidth?: FormComponentWidth;
  controlAlign?: 'start' | 'center' | 'end';
  compacted?: boolean;
  /** 必填标记：显示 *，并通过默认插槽 props 透传 required（控件侧据此输出 aria-required / 原生 required） */
  required?: boolean;
  /** 禁用态：label 置灰且透传 disabled 状态 */
  disabled?: boolean;
  /** 错误信息文案（优先级高于 help），输出 role="alert" */
  error?: string;
  /** 说明文案 */
  help?: string;
  /** 语义关联：显式指定关联控件 id */
  for?: string;
  /** 自动关联控件 id；与 for 二选一 */
  inputId?: string;
}>();

// 使用 Vue 3.5 useId 保证 SSR 与客户端水合一致
const autoId = useId();
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
  return {
    paddingLeft: `calc(${normalizedLabelWidth.value} + ${compacted ? '0.5rem' : '0.75rem'})`,
  };
});

const resolvedError = computed(() => error || undefined);
const resolvedHelp = computed(() => (error ? undefined : help || undefined));
</script>
