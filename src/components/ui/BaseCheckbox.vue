<template>
  <label
    :class="[
      sizeConfig.containerClass,
      {
        'cursor-not-allowed opacity-50': disabled,
        'cursor-pointer': !disabled && !readonly,
        'border-border-base dark:border-border-dark hover:bg-bg-panel-hover rounded-lg border p-2.5': bordered,
        'bg-bg-panel-hover/50': bordered && isChecked,
      },
    ]"
    :for="resolvedId"
    class="base-checkbox group duration-fast relative inline-flex items-start transition-colors select-none"
  >
    <input
      :aria-checked="ariaCheckedState"
      :aria-describedby="ariaDescribedby"
      :aria-disabled="disabled || undefined"
      :aria-label="ariaLabel || label"
      :checked="isChecked"
      :disabled="disabled || readonly"
      :id="resolvedId"
      :name="name"
      :required="required"
      :value="value"
      @blur="emit('blur', $event)"
      @change="handleChange"
      @focus="emit('focus', $event)"
      class="peer sr-only"
      ref="inputRef"
      type="checkbox"
    />

    <span
      v-wave="{ disabled: disabled || readonly }"
      :class="[
        sizeConfig.boxClass,
        isChecked || indeterminate ? colorConfig.checkedClass : colorConfig.uncheckedClass,
        {
          'peer-focus-visible:ring-primary/60 peer-focus-visible:ring-2 peer-focus-visible:ring-offset-1': !disabled,
        },
      ]"
      aria-hidden="true"
      class="checkbox-box duration-fast relative box-border inline-flex shrink-0 items-center justify-center transition-all"
    >
      <slot v-if="indeterminate" name="indeterminate-icon">
        <BaseIcon
          :size="sizeConfig.iconSize"
          class="duration-fast scale-100 text-white transition-transform"
          name="minus"
        />
      </slot>

      <slot v-else-if="isChecked" name="icon">
        <BaseIcon
          :size="sizeConfig.iconSize"
          class="duration-fast scale-100 text-white transition-transform"
          name="check"
        />
      </slot>
    </span>

    <div
      v-if="label || description || $slots['default'] || $slots['description']"
      :class="sizeConfig.labelWrapperClass"
      class="checkbox-content flex min-w-0 flex-col justify-center"
    >
      <span
        v-if="label || $slots['default']"
        :class="[sizeConfig.labelClass, isChecked ? 'text-text-title font-medium' : 'text-text-body']"
        class="checkbox-label duration-fast leading-tight transition-colors"
      >
        <slot>{{ label }}</slot>
      </span>

      <span
        v-if="description || $slots['description']"
        :class="sizeConfig.descriptionClass"
        class="checkbox-description text-text-description mt-0.5 leading-normal"
      >
        <slot name="description">{{ description }}</slot>
      </span>
    </div>
  </label>
</template>

<script lang="ts" setup>
import { computed, ref, useId, useTemplateRef } from 'vue';

import BaseIcon from '@/components/ui/BaseIcon.vue';

export interface BaseCheckboxProps {
  /** 当绑定为数组/集合时的选项自身值，或表单 value */
  value?: unknown;
  /** 选中时的映射值（默认 true） */
  trueValue?: unknown;
  /** 未选中时的映射值（默认 false） */
  falseValue?: unknown;
  /** 禁用交互 */
  disabled?: boolean;
  /** 只读状态（保留视觉但不可交互） */
  readonly?: boolean;
  /** 表单必填 */
  required?: boolean;
  /** 原生 name 属性 */
  name?: string;
  /** 元素 ID，默认自动生成全局唯一 ID */
  id?: string;
  /** 复选框标题文本 */
  label?: string;
  /** 标题下方的辅助说明文案 */
  description?: string;
  /** 尺寸大小 */
  size?: 'sm' | 'md' | 'lg';
  /** 主题色风格 */
  color?: 'primary' | 'success' | 'warning' | 'danger';
  /** 是否以带边框卡片形式展示 */
  bordered?: boolean;
  /** 无障碍描述文字 */
  ariaLabel?: string;
  /** 无障碍关联描述元素 ID */
  ariaDescribedby?: string;
}

const {
  value = undefined,
  trueValue = undefined,
  falseValue = undefined,
  disabled = false,
  readonly = false,
  required = false,
  name = undefined,
  id = undefined,
  label = undefined,
  description = undefined,
  size = 'md',
  color = 'primary',
  bordered = false,
  ariaLabel = undefined,
  ariaDescribedby = undefined,
} = defineProps<BaseCheckboxProps>();

const modelValue = defineModel<unknown>({ default: undefined });
const indeterminate = defineModel<boolean>('indeterminate', { default: false });

const emit = defineEmits<{
  (e: 'change', checked: boolean, value: unknown): void;
  (e: 'focus', event: FocusEvent): void;
  (e: 'blur', event: FocusEvent): void;
}>();

const inputRef = useTemplateRef<HTMLInputElement>('inputRef');
const generatedId = useId();
const resolvedId = computed(() => id || generatedId);

const resolvedTrueValue = computed(() => (trueValue !== undefined ? trueValue : true));
const resolvedFalseValue = computed(() => (falseValue !== undefined ? falseValue : false));

/** 内部非受控备用状态（当未传 v-model 时保证组件自身可独立交互） */
const innerChecked = ref(false);

const SIZE_CONFIGS = {
  sm: {
    containerClass: 'gap-1.5',
    boxClass: 'w-3.5 h-3.5 mt-0.5 rounded-[3px]',
    iconSize: 10,
    labelWrapperClass: 'ml-0.5',
    labelClass: 'text-xs',
    descriptionClass: 'text-2xs',
  },
  md: {
    containerClass: 'gap-2',
    boxClass: 'w-4 h-4 mt-0.5 rounded',
    iconSize: 12,
    labelWrapperClass: 'ml-0.5',
    labelClass: 'text-sm',
    descriptionClass: 'text-xs',
  },
  lg: {
    containerClass: 'gap-2.5',
    boxClass: 'w-5 h-5 mt-0.5 rounded-md',
    iconSize: 14,
    labelWrapperClass: 'ml-1',
    labelClass: 'text-base',
    descriptionClass: 'text-sm',
  },
} as const;

const COLOR_CONFIGS = {
  primary: {
    checkedClass: 'bg-primary border-primary text-white group-hover:brightness-105',
    uncheckedClass:
      'bg-bg-body dark:bg-bg-surface border border-border-base dark:border-border-dark group-hover:border-primary/80',
  },
  success: {
    checkedClass: 'bg-success border-success text-white group-hover:brightness-105',
    uncheckedClass:
      'bg-bg-body dark:bg-bg-surface border border-border-base dark:border-border-dark group-hover:border-success/80',
  },
  warning: {
    checkedClass: 'bg-warning border-warning text-white group-hover:brightness-105',
    uncheckedClass:
      'bg-bg-body dark:bg-bg-surface border border-border-base dark:border-border-dark group-hover:border-warning/80',
  },
  danger: {
    checkedClass: 'bg-danger border-danger text-white group-hover:brightness-105',
    uncheckedClass:
      'bg-bg-body dark:bg-bg-surface border border-border-base dark:border-border-dark group-hover:border-danger/80',
  },
} as const;

const sizeConfig = computed(() => SIZE_CONFIGS[size]);
const colorConfig = computed(() => COLOR_CONFIGS[color]);

/** 当前选中态解析（自动兼容数组列表绑定、Set 集合、自定义 trueValue 与基础 boolean） */
const isChecked = computed<boolean>(() => {
  const model = modelValue.value;
  if (model === undefined) {
    return innerChecked.value;
  }
  if (Array.isArray(model)) {
    return model.includes(value);
  }
  if (model instanceof Set) {
    return model.has(value);
  }
  return model === resolvedTrueValue.value;
});

const ariaCheckedState = computed<'true' | 'false' | 'mixed'>(() => {
  if (indeterminate.value) return 'mixed';
  return isChecked.value ? 'true' : 'false';
});

/** 切换勾选状态并派发更新 */
const toggle = () => {
  if (disabled || readonly) return;
  const currentChecked = isChecked.value;
  const nextChecked = indeterminate.value ? true : !currentChecked;

  if (indeterminate.value) {
    indeterminate.value = false;
  }

  const model = modelValue.value;
  let nextModelValue: unknown;

  if (model === undefined) {
    innerChecked.value = nextChecked;
    nextModelValue = nextChecked ? resolvedTrueValue.value : resolvedFalseValue.value;
  } else if (Array.isArray(model)) {
    const list = (model as unknown[]).slice();
    const idx = list.indexOf(value);
    if (nextChecked && idx === -1) {
      list.push(value);
    } else if (!nextChecked && idx !== -1) {
      list.splice(idx, 1);
    }
    nextModelValue = list;
  } else if (model instanceof Set) {
    const set = new Set(model);
    if (nextChecked) {
      set.add(value);
    } else {
      set.delete(value);
    }
    nextModelValue = set;
  } else {
    nextModelValue = nextChecked ? resolvedTrueValue.value : resolvedFalseValue.value;
  }

  modelValue.value = nextModelValue;
  emit('change', nextChecked, nextModelValue);
};

const handleChange = () => {
  toggle();
};

defineExpose({
  input: inputRef,
  checked: isChecked,
  toggle,
});
</script>
