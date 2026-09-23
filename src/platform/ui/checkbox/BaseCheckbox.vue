<template>
  <!-- buttonized：直接用 ActionButton 渲染（勾选=subtle 浅主色高亮、未勾选=ghost），
       复用其原生 button 的 mousedown 聚焦/键盘/禁用语义；点击驱动 toggle -->
  <ActionButton
    v-if="buttonized"
    :disabled
    :icon
    :icon-only
    :label
    :size
    :aria-checked="ariaCheckedState"
    :aria-disabled="disabled || undefined"
    :aria-label="ariaLabel || label"
    :color="isChecked && !indeterminate ? color : 'default'"
    :variant="isChecked && !indeterminate ? 'subtle' : 'ghost'"
    @click="toggle()"
    class="base-checkbox"
    icon-size="lg"
    role="checkbox"
  >
    <slot>{{ label }}</slot>
  </ActionButton>

  <label
    v-else
    :class="[
      sizeConfig.containerClass,
      hasDescription ? 'items-start' : 'items-center',
      {
        'cursor-not-allowed opacity-50': disabled,
        'cursor-pointer': !disabled && !readonly,
        'rounded-lg border border-border-base p-2.5 hover:bg-surface-panel-hover': bordered,
        'bg-surface-panel-subtle': bordered && isChecked,
      },
    ]"
    :for="resolvedId"
    class="base-checkbox group relative inline-flex transition-colors duration-fast select-none"
  >
    <input
      :aria-describedby
      :name
      :required
      :value
      :aria-checked="ariaCheckedState"
      :aria-disabled="disabled || undefined"
      :aria-label="ariaLabel || label"
      :aria-readonly="readonly || undefined"
      :checked="isChecked"
      :disabled="disabled || undefined"
      :id="resolvedId"
      @blur="emit('blur', $event)"
      @change="toggle()"
      @focus="emit('focus', $event)"
      class="peer sr-only"
      ref="inputRef"
      type="checkbox"
    />

    <span
      v-wave="{ disabled: disabled || readonly }"
      :class="[
        sizeConfig.boxClass,
        hasDescription ? 'mt-0.5' : '',
        isChecked || indeterminate ? colorConfig.checkedClass : colorConfig.uncheckedClass,
      ]"
      aria-hidden="true"
      class="checkbox-box relative inline-flex shrink-0 items-center justify-center transition-all duration-fast"
    >
      <slot v-if="indeterminate" name="indeterminate-icon">
        <BaseIcon
          :icon-size="sizeConfig.iconSize"
          class="scale-100 text-fg-on-accent transition-transform duration-fast"
          name="minus"
        />
      </slot>

      <slot v-else-if="isChecked" name="icon">
        <BaseIcon
          :icon-size="sizeConfig.iconSize"
          class="scale-100 text-fg-on-accent transition-transform duration-fast"
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
        :class="[
          sizeConfig.labelClass,
          isChecked ? 'font-medium text-fg-title' : 'text-fg-body',
          hasDescription ? 'leading-tight' : 'leading-none',
        ]"
        class="checkbox-label transition-colors duration-fast"
      >
        <slot>{{ label }}</slot>
      </span>

      <span
        v-if="description || $slots['description']"
        :class="sizeConfig.descriptionClass"
        class="checkbox-description text-fg-description mt-0.5 leading-normal"
      >
        <slot name="description">{{ description }}</slot>
      </span>
    </div>
  </label>
</template>

<script setup lang="ts">
import { computed, ref, useId, useSlots, useTemplateRef } from 'vue';

import ActionButton from '@/platform/ui/button/ActionButton.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import { useFormRowControlId } from '@/platform/ui/form/formRowContext';
import { ICON_SIZE_PRESETS } from '@/platform/ui/icons/iconSizes';

import type { ComponentSize } from '@/platform/types';
import type { IconName } from '@/platform/ui/icons/icons.registry';

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
  size?: ComponentSize;
  /** 主题色风格 */
  color?: 'primary' | 'success' | 'warning' | 'danger';
  /** 是否以带边框卡片形式展示 */
  bordered?: boolean;
  /** 按钮化：隐藏勾选框，渲染为方形/胶囊高亮按钮（选中=主色浅底、未选=幽灵按钮），保留 checkbox 语义与点击切换 */
  buttonized?: boolean;
  /** buttonized 形态前缀图标（注册表枚举），颜色随选中态前景色 */
  icon?: IconName;
  /** buttonized 形态为 icon-only（无 label/默认插槽文本时自动开启；方形等宽） */
  iconOnly?: boolean;
  /** 无障碍描述文字 */
  ariaLabel?: string;
  /** 无障碍关联描述元素 ID */
  ariaDescribedby?: string;
}

const modelValue = defineModel<unknown>({ default: undefined });

const indeterminate = defineModel<boolean>('indeterminate', { default: false });

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
  buttonized = false,
  icon = undefined,
  iconOnly = false,
  ariaLabel = undefined,
  ariaDescribedby = undefined,
} = defineProps<BaseCheckboxProps>();

const emit = defineEmits<{
  (e: 'change', checked: boolean, value: unknown): void;
  (e: 'focus', event: FocusEvent): void;
  (e: 'blur', event: FocusEvent): void;
}>();
const slots = useSlots();
const hasDescription = computed(() => Boolean(description || slots['description']));

const inputRef = useTemplateRef<HTMLInputElement>('inputRef');
const generatedId = useId();
const resolvedId = computed(() => id || generatedId);
/** 是否自带标签文案（label prop 或默认插槽）——决定它能否自我命名 */
const hasOwnLabelText = computed(() => Boolean(label || slots['default']));

/**
 * 上报原生 checkbox 的 id 给所在 BaseFormRow：行的 label 据此输出 for。两种情形不上报
 * （行标签随之降级为 span、不输出 for）：
 *  - buttonized：渲染的是 ActionButton（role=checkbox，非可标签化元素），行的 for 指不到会悬空；
 *  - 自身已有标签文案：控件用 <label for> 包着 input 自我命名，若行的 label 再指向同一个 input，
 *    无障碍名会按树序拼接成「行标签 + 自身标签」，读屏把同一件事念两遍。此时行标签只是分组名，
 *    名字交给控件自身更准。
 * 只有「裸复选框」（无自身文案、行内仅一个勾选框）才依赖行的 for 取得无障碍名。
 */
const shouldReportIdToRow = computed(() => !buttonized && !hasOwnLabelText.value);
useFormRowControlId(() => (shouldReportIdToRow.value ? resolvedId.value : undefined));

const resolvedTrueValue = computed(() => (trueValue !== undefined ? trueValue : true));
const resolvedFalseValue = computed(() => (falseValue !== undefined ? falseValue : false));

/** 内部非受控备用状态（当未传 v-model 时保证组件自身可独立交互） */
const innerChecked = ref(false);

/**
 * 受控 / 非受控契约：`modelValue === undefined` 视为「未绑定 v-model」→ 组件自管内部态。
 * 注意：因此绑定值**不可有意用 undefined 承接**（例如 `v-model="obj.maybeUndefinedField"` 且字段恰为
 * undefined 时会静默切到内部态，与外部脱节）；需占位请用 null 或具体空值。此语义为固有设计权衡。
 */

const SIZE_CONFIGS = {
  sm: {
    containerClass: 'gap-1.5',
    boxClass: 'h-3.5 w-3.5 rounded-[3px]',
    iconSize: ICON_SIZE_PRESETS.md,
    labelWrapperClass: 'ml-0.5',
    labelClass: 'text-xs',
    descriptionClass: 'text-2xs',
  },
  md: {
    containerClass: 'gap-2',
    boxClass: 'h-4 w-4 rounded-sm',
    iconSize: ICON_SIZE_PRESETS.lg,
    labelWrapperClass: 'ml-0.5',
    labelClass: 'text-sm',
    descriptionClass: 'text-xs',
  },
  lg: {
    containerClass: 'gap-2.5',
    boxClass: 'h-5 w-5 rounded-md',
    iconSize: ICON_SIZE_PRESETS.xl,
    labelWrapperClass: 'ml-1',
    labelClass: 'text-base',
    descriptionClass: 'text-sm',
  },
} as const;

const COLOR_CONFIGS = {
  primary: {
    checkedClass: 'border-primary bg-primary text-fg-on-accent group-hover:brightness-105',
    uncheckedClass:
      'border border-border-base bg-surface-body group-hover:border-tint-primary-20 dark:bg-(--bg-surface)',
  },
  success: {
    checkedClass: 'border-success bg-success text-fg-on-accent group-hover:brightness-105',
    uncheckedClass:
      'border border-border-base bg-surface-body group-hover:border-tint-success-20 dark:bg-(--bg-surface)',
  },
  warning: {
    checkedClass: 'border-warning bg-warning text-fg-on-accent group-hover:brightness-105',
    uncheckedClass:
      'border border-border-base bg-surface-body group-hover:border-tint-warning-20 dark:bg-(--bg-surface)',
  },
  danger: {
    checkedClass: 'border-danger bg-danger text-fg-on-accent group-hover:brightness-105',
    uncheckedClass:
      'border border-border-base bg-surface-body group-hover:border-tint-danger-20 dark:bg-(--bg-surface)',
  },
} as const;

const sizeConfig = computed(() => SIZE_CONFIGS[size]);
const colorConfig = computed(() => COLOR_CONFIGS[color]);

// ===== buttonized（按钮化）形态：直接渲染 ActionButton =====
// 勾选→subtle（浅主色高亮）、未勾选→ghost；Appearance/尺寸/聚焦环/禁用/键盘等全部由
// ActionButton 自身承载（原生 button 在 mousedown 即聚焦，聚焦环按下即显），不再手写样式。
// 未选中态刻意统一用 ghost 中性色、不随 color 变化（未选中无需强调色），仅选中态按 color 取 subtle 色板。

/** 当前选中态解析（自动兼容数组列表绑定、Set 集合、自定义 trueValue 与基础 boolean） */
const isChecked = computed<boolean>(() => {
  const model = modelValue.value;
  if (model === undefined) return innerChecked.value;

  if (Array.isArray(model)) return model.includes(value);

  if (model instanceof Set) return model.has(value);

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

  if (indeterminate.value) indeterminate.value = false;

  const model = modelValue.value;
  let nextModelValue: unknown;

  if (model === undefined) {
    innerChecked.value = nextChecked;
    nextModelValue = nextChecked ? resolvedTrueValue.value : resolvedFalseValue.value;
  } else if (Array.isArray(model)) {
    const list = (model as unknown[]).slice();
    const idx = list.indexOf(value);
    if (nextChecked && idx === -1) list.push(value);
    else if (!nextChecked && idx !== -1) list.splice(idx, 1);

    nextModelValue = list;
  } else if (model instanceof Set) {
    const set = new Set(model);
    if (nextChecked) set.add(value);
    else set.delete(value);

    nextModelValue = set;
  } else nextModelValue = nextChecked ? resolvedTrueValue.value : resolvedFalseValue.value;

  modelValue.value = nextModelValue;
  emit('change', nextChecked, nextModelValue);
};

defineExpose({
  input: inputRef,
  checked: isChecked,
  toggle,
});
</script>
