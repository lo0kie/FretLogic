<template>
  <label
    :class="[
      buttonized
        ? ['inline-flex cursor-pointer items-center', { 'cursor-not-allowed opacity-50': disabled }]
        : [
            sizeConfig.containerClass,
            hasDescription ? 'items-start' : 'items-center',
            {
              'cursor-not-allowed opacity-50': disabled,
              'cursor-pointer': !disabled && !readonly,
              'border-border-base hover:bg-bg-panel-hover rounded-lg border p-2.5': bordered,
              'bg-bg-panel-hover/50': bordered && isChecked,
            },
          ],
    ]"
    :for="resolvedId"
    class="base-checkbox group duration-fast relative inline-flex transition-colors select-none"
  >
    <input
      :aria-describedby
      :name
      :required
      :value
      :aria-checked="ariaCheckedState"
      :aria-disabled="disabled || undefined"
      :aria-label="ariaLabel || label"
      :checked="isChecked"
      :disabled="disabled || readonly"
      :id="resolvedId"
      @blur="emit('blur', $event)"
      @change="handleChange"
      @focus="emit('focus', $event)"
      class="peer sr-only"
      ref="inputRef"
      type="checkbox"
    />

    <!-- buttonized：方形/胶囊高亮按钮，内容为图标 + 文本（无独立勾选框） -->
    <template v-if="buttonized">
      <span
        v-wave="{ disabled: disabled || readonly }"
        :class="[
          rootButtonizedClass,
          { 'peer-focus-visible:ring-primary/70 peer-focus-visible:ring-2': !disabled && !readonly },
        ]"
      >
        <BaseIcon v-if="icon" :icon-size :icon-stroke="'regular'" :name="icon" class="shrink-0" />
        <span v-if="label || $slots['default']" class="truncate whitespace-nowrap">
          <slot>{{ label }}</slot>
        </span>
      </span>
    </template>

    <template v-else>
      <span
        v-wave="{ disabled: disabled || readonly }"
        :class="[
          sizeConfig.boxClass,
          hasDescription ? 'mt-0.5' : '',
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
            :icon-size="sizeConfig.iconSize"
            class="duration-fast scale-100 text-white transition-transform"
            name="minus"
          />
        </slot>

        <slot v-else-if="isChecked" name="icon">
          <BaseIcon
            :icon-size="sizeConfig.iconSize"
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
          :class="[
            sizeConfig.labelClass,
            isChecked ? 'text-text-title font-medium' : 'text-text-body',
            hasDescription ? 'leading-tight' : 'leading-none',
          ]"
          class="checkbox-label duration-fast transition-colors"
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
    </template>
  </label>
</template>

<script setup lang="ts">
import { computed, ref, useId, useSlots, useTemplateRef } from 'vue';

import type { ComponentSize } from '@/platform/types';
import {
  BUTTON_GHOST_THEME_MAP,
  BUTTON_ICON_ONLY_SIZE_MAP,
  BUTTON_SIZE_MAP,
  BUTTON_SUBTLE_THEME_MAP,
} from '@/platform/ui/button/buttonThemes';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import { type IconName } from '@/platform/ui/icons/icons.registry';
import { ICON_SIZE_PRESETS } from '@/platform/ui/icons/iconSizes';

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

const slots = useSlots();
const hasDescription = computed(() => Boolean(description || slots['description']));

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
    boxClass: 'w-3.5 h-3.5 rounded-[3px]',
    iconSize: ICON_SIZE_PRESETS.md,
    labelWrapperClass: 'ml-0.5',
    labelClass: 'text-xs',
    descriptionClass: 'text-2xs',
  },
  md: {
    containerClass: 'gap-2',
    boxClass: 'w-4 h-4 rounded',
    iconSize: ICON_SIZE_PRESETS.lg,
    labelWrapperClass: 'ml-0.5',
    labelClass: 'text-sm',
    descriptionClass: 'text-xs',
  },
  lg: {
    containerClass: 'gap-2.5',
    boxClass: 'w-5 h-5 rounded-md',
    iconSize: ICON_SIZE_PRESETS.xl,
    labelWrapperClass: 'ml-1',
    labelClass: 'text-base',
    descriptionClass: 'text-sm',
  },
} as const;

const COLOR_CONFIGS = {
  primary: {
    checkedClass: 'bg-primary border-primary text-white group-hover:brightness-105',
    uncheckedClass: 'bg-bg-body dark:bg-bg-surface border border-border-base group-hover:border-primary/80',
  },
  success: {
    checkedClass: 'bg-success border-success text-white group-hover:brightness-105',
    uncheckedClass: 'bg-bg-body dark:bg-bg-surface border border-border-base group-hover:border-success/80',
  },
  warning: {
    checkedClass: 'bg-warning border-warning text-white group-hover:brightness-105',
    uncheckedClass: 'bg-bg-body dark:bg-bg-surface border border-border-base group-hover:border-warning/80',
  },
  danger: {
    checkedClass: 'bg-danger border-danger text-white group-hover:brightness-105',
    uncheckedClass: 'bg-bg-body dark:bg-bg-surface border border-border-base group-hover:border-danger/80',
  },
} as const;

const sizeConfig = computed(() => SIZE_CONFIGS[size]);
const colorConfig = computed(() => COLOR_CONFIGS[color]);

// ===== buttonized（按钮化）形态：视觉对齐 ActionButton（共享 buttonThemes 单源） =====

/** on（勾选）态取 subtle 色板、off 态取 ghost 色板，尺寸复用 ActionButton 的方形/胶囊映射 */
const buttonizedConfig = computed(() => ({
  text: BUTTON_SIZE_MAP[size] ?? BUTTON_SIZE_MAP['md'],
  square: BUTTON_ICON_ONLY_SIZE_MAP[size] ?? BUTTON_ICON_ONLY_SIZE_MAP['md'],
}));

/** 是否含文本内容（label prop 或默认插槽），用于决定方形(iconOnly) / 胶囊(带文本) */
const hasButtonizedText = computed(() => Boolean(label || slots['default']));
/** 是否为方形图标按钮：显式 iconOnly，或仅有图标且无文本 */
const isIconOnlySquare = computed(() => iconOnly || (Boolean(icon) && !hasButtonizedText.value));

/**
 * buttonized 内容外观：勾选=ActionButton subtle（浅主色高亮），未勾选=ActionButton ghost。
 * 宿主是 label（非 button），主题串的 hover:enabled: 前缀对 label 不生效，统一替换为 hover:；
 * 同时按需剥除主题里的 border-* 类（buttonized 为无边框形态，边框仅属于 ActionButton）
 */
const rootButtonizedClass = computed(() => {
  const sized = isIconOnlySquare.value ? buttonizedConfig.value.square : buttonizedConfig.value.text;
  const theme =
    isChecked.value && !indeterminate.value
      ? (BUTTON_SUBTLE_THEME_MAP[color] ?? BUTTON_SUBTLE_THEME_MAP['primary'])
      : BUTTON_GHOST_THEME_MAP['default'];
  const themePlain = theme
    .replace(/hover:enabled:/g, 'hover:')
    .split(' ')
    .filter(token => !token.startsWith('border'))
    .join(' ');
  return [
    sized,
    themePlain,
    'rounded-pill font-semibold align-middle duration-fast inline-flex items-center justify-center transition-all overflow-hidden select-none',
  ].join(' ');
});

/** buttonized 图标尺寸（px），随组件 size 档位缩放 */
const iconSize = computed(() => {
  const map: Record<'sm' | 'md' | 'lg', number> = { sm: 14, md: 16, lg: 18 };
  return map[size] ?? map['md'];
});

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
