<template>
  <span v-if="$slots['target']" class="relative inline-flex shrink-0">
    <slot name="target" />
    <span
      v-if="!isHidden"
      class="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 z-10 inline-flex items-center justify-center rounded-full font-semibold leading-none box-border whitespace-nowrap select-none border border-transparent shadow-xs"
      :class="[
        sizeClasses,
        variantAppearanceClasses,
        {
          '!p-0 !w-2 !h-2 !min-w-0 !border-none': isDotOnly,
          'opacity-40 cursor-not-allowed': disabled,
        },
      ]"
      :style="[normalizedStyle, offsetStyle]"
      role="status"
      :aria-label="ariaLabelText"
      :aria-disabled="disabled || undefined"
    >
      <span v-if="!isDotOnly">
        <slot> {{ formattedContent }} </slot>
      </span>
    </span>
  </span>

  <component
    :is="isInteractive ? 'button' : 'span'"
    v-else-if="!isHidden"
    :type="isInteractive ? 'button' : undefined"
    class="inline-flex items-center justify-center shrink-0 rounded-full font-semibold leading-none tracking-tight box-border whitespace-nowrap select-none border border-transparent outline-none transition-all duration-fast"
    :class="[
      sizeClasses,
      variantAppearanceClasses,
      {
        'cursor-pointer hover:opacity-85 hover:-translate-y-px active:translate-y-0 active:scale-95':
          isInteractive && !disabled,
        'opacity-40 cursor-not-allowed': disabled,
        '!p-0 !w-2 !h-2 !min-w-0 !border-none': isDotOnly,
        '!px-0': Boolean(width),
        'group hover:!bg-tint-danger-88 hover:!text-danger hover:!border-tint-danger-75 focus-visible:!bg-tint-danger-88 focus-visible:!text-danger focus-visible:!border-tint-danger-75':
          hoverClose && !disabled,
      },
    ]"
    :style="normalizedStyle"
    :role="isInteractive ? undefined : 'status'"
    :disabled="isInteractive ? disabled : undefined"
    :aria-disabled="disabled || undefined"
    :aria-label="ariaLabelText"
    data-focusable-inline
    @click="handleClick"
  >
    <span v-if="hasDot" class="w-1.5 h-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />

    <slot name="prefix" />

    <span
      v-if="!isDotOnly && ($slots['default'] || content !== undefined)"
      class="inline-flex items-center justify-center overflow-hidden text-ellipsis h-full leading-none"
      :class="{ 'relative w-full h-full': hoverClose }"
    >
      <span
        class="inline-flex items-center justify-center h-full leading-none transition-opacity duration-fast"
        :class="{ 'group-hover:opacity-0': hoverClose && !disabled }"
      >
        <slot> {{ formattedContent }} </slot>
      </span>
      <X
        v-if="hoverClose"
        :size="closeIconSize"
        :stroke-width="3"
        class="absolute inset-0 m-auto flex items-center justify-center opacity-0 pointer-events-none transition-opacity duration-fast group-hover:opacity-100"
        aria-hidden="true"
      />
    </span>

    <button
      v-if="closable && !hoverClose"
      type="button"
      :disabled
      title="关闭"
      aria-label="关闭"
      class="p-0 ml-0.5 border-none bg-transparent text-current opacity-65 flex items-center justify-center cursor-pointer outline-none rounded-full transition-all duration-fast hover:opacity-100 hover:bg-tint-current-82 disabled:cursor-not-allowed disabled:opacity-40"
      @click.stop="handleClose"
    >
      <X :size="closeIconSize" stroke-width="3" aria-hidden="true" />
    </button>
  </component>
</template>

<script setup lang="ts">
import { X } from '@lucide/vue';
import { computed, useAttrs } from 'vue';

type BadgeVariant = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
type BadgeSize = 'xs' | 'sm' | 'md' | 'lg';
type BadgeAppearance = 'filled' | 'subtle' | 'outline';

const props = withDefaults(
  defineProps<{
    variant?: BadgeVariant;
    size?: BadgeSize;
    appearance?: BadgeAppearance;
    content?: string | number;
    max?: number;
    /** 是否在数值为 0 时展示，默认为 true；设为 false 时 content===0 将隐藏 */
    showZero?: boolean;
    /** 小红点模式：仅渲染一个无内容的小圆点，忽略 content */
    dot?: boolean;
    /** 在文字前显示状态指示灯（前缀圆点） */
    statusDot?: boolean;
    closable?: boolean;
    /** 悬停显示关闭图标，整体作为关闭按钮（点击派发 close 事件而非 click） */
    hoverClose?: boolean;
    /** 显式声明为交互按钮，支持键盘焦点与原生 button 交互 */
    interactive?: boolean;
    /** 禁用状态，屏蔽点击与关闭事件并置灰 */
    disabled?: boolean;
    width?: string | number;
    /** 角标偏移量 [x, y]，支持数值（px）或带单位字符串 */
    offset?: [number | string, number | string];
  }>(),
  {
    variant: 'neutral',
    size: 'sm',
    appearance: 'filled',
    max: 99,
    showZero: true,
    dot: false,
    statusDot: false,
    closable: false,
    hoverClose: false,
    interactive: false,
    disabled: false,
  }
);

const emit = defineEmits<{
  (e: 'close', event: MouseEvent | KeyboardEvent): void;
  (e: 'click', event: MouseEvent | KeyboardEvent): void;
}>();

const attrs = useAttrs();

// 交互态：仅当显式声明 interactive 或 hoverClose，且非独立 closable 时渲染为 button，
// 避免依据 attrs.onClick 推断造成的 SSR 水合不一致及标签意外切换。
const isInteractive = computed(() => !props.closable && (props.interactive || props.hoverClose));

// 小红点模式：仅渲染一个无内容的小圆点，忽略 content
const isDotOnly = computed(() => props.dot);
// 状态指示灯：在文字前显示前缀圆点（不与 dot 模式叠加）
const hasDot = computed(() => props.statusDot && !isDotOnly.value);

// showZero 控制：当 showZero 为 false 且 content 为 0 时自动隐藏
const isHidden = computed(() => {
  if (props.dot) return false;
  if (!props.showZero && props.content === 0) return true;
  return false;
});

const normalizedStyle = computed(() => {
  if (props.width === undefined) return {};
  const parsedWidth = typeof props.width === 'number' ? `${props.width}px` : props.width;
  return {
    width: parsedWidth,
    minWidth: parsedWidth,
  };
});

const offsetStyle = computed(() => {
  if (!props.offset) return {};
  const [x, y] = props.offset;
  const xStr = typeof x === 'number' ? `${x}px` : x;
  const yStr = typeof y === 'number' ? `${y}px` : y;
  return {
    transform: `translate(calc(50% + ${xStr}), calc(-50% + ${yStr}))`,
  };
});

const formattedContent = computed(() => {
  if (typeof props.content === 'number' && props.max && props.content > props.max) {
    return `${props.max}+`;
  }
  return props.content;
});

// 通用无障碍描述
const ariaLabelText = computed(() => {
  if (attrs['aria-label']) return String(attrs['aria-label']);
  if (props.hoverClose) return '关闭';
  if (typeof props.content === 'number' && props.max && props.content > props.max) return `${props.max}+`;
  return undefined;
});

const SIZE_MAP: Record<BadgeSize, string> = {
  xs: 'text-2xs h-[1.15rem] px-[0.35rem] gap-2xs',
  sm: 'text-2xs h-[1.35rem] px-sm gap-xs',
  md: 'text-xs h-[1.55rem] px-[0.6rem] gap-xs',
  lg: 'text-xs h-[1.8rem] px-md gap-sm',
};

const VARIANT_APPEARANCE_MAP: Record<BadgeVariant, Record<BadgeAppearance, string>> = {
  neutral: {
    filled: 'bg-bg-body text-text-disabled border-border-light',
    subtle: 'bg-bg-panel-hover text-text-body border-transparent',
    outline: 'bg-transparent border-border-base text-text-body',
  },
  primary: {
    filled: 'bg-primary text-text-on-accent border-transparent',
    subtle: 'bg-tint-primary-88 text-primary border-transparent',
    outline: 'bg-transparent border-primary text-primary',
  },
  success: {
    filled: 'bg-success text-text-on-accent border-transparent',
    subtle: 'bg-tint-success-88 text-success border-transparent',
    outline: 'bg-transparent border-success text-success',
  },
  warning: {
    filled: 'bg-warning text-text-on-accent border-transparent',
    subtle: 'bg-tint-warning-88 text-warning border-transparent',
    outline: 'bg-transparent border-warning text-warning',
  },
  danger: {
    filled: 'bg-danger text-text-on-accent border-transparent',
    subtle: 'bg-tint-danger-88 text-danger border-transparent',
    outline: 'bg-transparent border-danger text-danger',
  },
};

const sizeClasses = computed(() => SIZE_MAP[props.size] ?? SIZE_MAP.sm);
const variantAppearanceClasses = computed(
  () => VARIANT_APPEARANCE_MAP[props.variant]?.[props.appearance] ?? VARIANT_APPEARANCE_MAP.neutral.filled
);

const SIZE_TO_CLOSE_ICON: Record<string, number> = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
};
const closeIconSize = computed(() => SIZE_TO_CLOSE_ICON[props.size] ?? 14);

const handleClose = (e: MouseEvent | KeyboardEvent) => {
  if (props.disabled) return;
  emit('close', e);
};

const handleClick = (e: MouseEvent) => {
  if (props.disabled) return;
  if (props.hoverClose) {
    emit('close', e);
    return;
  }
  if (isInteractive.value) {
    emit('click', e);
  }
};
</script>
