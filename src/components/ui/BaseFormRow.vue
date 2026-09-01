<template>
  <div
    class="base-form-row flex flex-col w-full box-border"
    :class="[
      { 'is-disabled opacity-60': disabled, 'is-compacted': compacted },
      align === 'top' ? 'align-top' : 'align-center',
    ]"
  >
    <div
      class="form-row-main flex w-full box-border"
      :class="[
        layout === 'vertical'
          ? 'flex-col items-start gap-1.5'
          : [align === 'top' ? 'items-start' : 'items-center', compacted ? 'is-compacted gap-sm' : 'gap-md'],
      ]"
    >
      <label
        v-if="label || $slots['label']"
        class="form-row-label text-xs font-semibold text-text-body whitespace-nowrap shrink-0 select-none overflow-hidden text-ellipsis"
        :class="[
          layout === 'horizontal' && align === 'top' ? 'pt-[calc(0.5rem+1px)]' : '',
          required ? 'flex items-center gap-1' : '',
        ]"
        :style="layout === 'horizontal' ? labelStyle : undefined"
        :for="effectiveForId"
      >
        <slot name="label"> {{ label }} </slot>
        <span v-if="required" class="text-danger leading-none" aria-hidden="true">*</span>
      </label>

      <div
        class="form-row-control flex items-center min-w-0"
        :class="[
          layout === 'vertical' ? 'w-full' : 'flex-1',
          controlAlign === 'start' ? 'justify-start' : controlAlign === 'center' ? 'justify-center' : 'justify-end',
        ]"
        :style="controlStyle"
      >
        <slot :id="effectiveForId" :disabled :required />
      </div>
    </div>

    <div
      v-if="resolvedHelp || resolvedError || $slots['help'] || $slots['error']"
      class="form-row-feedback w-full mt-1 text-2xs leading-relaxed"
      :class="[resolvedError ? 'text-danger' : 'text-text-muted']"
      :style="feedbackStyle"
      :role="resolvedError ? 'alert' : undefined"
      aria-live="polite"
    >
      <slot name="error" :message="resolvedError">
        <span v-if="resolvedError">{{ resolvedError }}</span>
      </slot>
      <slot v-if="!resolvedError" name="help" :message="resolvedHelp">
        <span v-if="resolvedHelp">{{ resolvedHelp }}</span>
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { type FormComponentWidth, resolveComponentWidth } from '@/utils/core/constants';
import { computed, useId } from 'vue';

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
const effectiveForId = computed(() => forProp || inputId || `form-row-control-${autoId}`);

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
