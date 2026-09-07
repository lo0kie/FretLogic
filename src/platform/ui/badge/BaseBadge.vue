<template>
  <span v-if="$slots['target']" class="relative inline-flex shrink-0">
    <slot name="target" />
    <span
      v-auto-width="width === undefined"
      v-if="!isHidden"
      :aria-disabled="disabled || undefined"
      :aria-label="ariaLabelText"
      :class="[
        sizeClasses,
        variantAppearanceClasses,
        {
          'size-2! min-w-0! border-none! p-0!': isDotOnly,
          'cursor-not-allowed opacity-40': disabled,
        },
      ]"
      :style="[normalizedStyle, offsetStyle]"
      class="absolute top-0 right-0 z-panel box-border inline-flex translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-transparent leading-none font-semibold whitespace-nowrap shadow-xs transition-all duration-base select-none"
      role="status"
    >
      <span v-if="!isDotOnly">
        <slot> {{ formattedContent }} </slot>
      </span>
    </span>
  </span>

  <component
    v-auto-width="width === undefined"
    v-else-if="!isHidden"
    :aria-disabled="disabled || undefined"
    :aria-label="ariaLabelText"
    :class="[
      sizeClasses,
      variantAppearanceClasses,
      {
        'cursor-pointer hover:-translate-y-px hover:opacity-85 active:translate-y-0 active:scale-95':
          isInteractive && !disabled,
        'cursor-not-allowed opacity-40': disabled,
        'size-2! min-w-0! border-none! p-0!': isDotOnly,
        'px-0!': Boolean(width),
        'group hover:border-tint-danger-75! hover:bg-tint-danger-88! hover:text-danger! focus-visible:border-tint-danger-75! focus-visible:bg-tint-danger-88! focus-visible:text-danger!':
          hoverClose && !disabled,
      },
    ]"
    :disabled="isInteractive ? disabled : undefined"
    :is="isInteractive ? 'button' : 'span'"
    :role="isInteractive ? undefined : 'status'"
    :style="normalizedStyle"
    :type="isInteractive ? 'button' : undefined"
    @click="handleClick($event)"
    data-focusable-inline
    class="box-border inline-flex shrink-0 items-center justify-center rounded-full border border-transparent leading-none font-semibold tracking-tight whitespace-nowrap transition-all duration-fast outline-none select-none"
  >
    <span v-if="hasDot" aria-hidden="true" class="size-1.5 shrink-0 rounded-full bg-current" />

    <slot name="prefix" />

    <span
      v-if="!isDotOnly && ($slots['default'] || content !== undefined)"
      :class="{ 'relative size-full': hoverClose }"
      class="inline-flex h-full items-center justify-center overflow-hidden leading-none text-ellipsis"
    >
      <span
        :class="{ 'group-hover:opacity-0': hoverClose && !disabled }"
        class="inline-flex h-full items-center justify-center leading-none transition-opacity duration-fast"
      >
        <slot> {{ formattedContent }} </slot>
      </span>
      <BaseIcon
        v-if="hoverClose"
        :icon-size="closeIconSize"
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 m-auto flex items-center justify-center opacity-0 transition-opacity duration-fast group-hover:opacity-100"
        icon-stroke="bold"
        name="x"
      />
    </span>

    <button
      v-if="closable && !hoverClose"
      :disabled
      @click.stop="handleClose($event)"
      aria-label="关闭"
      class="ml-0.5 flex cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-0 text-current opacity-65 transition-all duration-fast outline-none hover:bg-tint-current-82 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
      title="关闭"
      type="button"
    >
      <BaseIcon :icon-size="closeIconSize" aria-hidden="true" icon-stroke="bold" name="x" />
    </button>
  </component>
</template>

<script setup lang="ts">
import { computed, useAttrs } from 'vue';

import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';

import type { IconSizePreset, IconSizeValue } from '@/platform/ui/icons/iconSizes';

type BadgeVariant = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
type BadgeSize = '2xs' | 'xs' | 'sm' | 'md' | 'lg';
type BadgeAppearance = 'filled' | 'subtle' | 'outline';

const props = withDefaults(
  defineProps<{
    /** 徽标语义色：neutral/primary/success/warning/danger */
    variant?: BadgeVariant;
    /** 尺寸档位：2xs（微型角标）~lg */
    size?: BadgeSize;
    /** 视觉形态：filled 实底 / subtle 浅底 / outline 描边 */
    appearance?: BadgeAppearance;
    /** 徽标文本内容（数字超长时按 max 截断为 N+） */
    content?: string | number;
    /** 数字内容的上限，超出显示 N+（默认 99） */
    max?: number;
    /** 是否在数值为 0 时展示，默认为 true；设为 false 时 content===0 将隐藏 */
    showZero?: boolean;
    /** 小红点模式：仅渲染一个无内容的小圆点，忽略 content */
    dot?: boolean;
    /** 在文字前显示状态指示灯（前缀圆点） */
    statusDot?: boolean;
    /** 显示独立关闭小按钮，点击派发 close 事件 */
    closable?: boolean;
    /** 悬停显示关闭图标，整体作为关闭按钮（点击派发 close 事件而非 click） */
    hoverClose?: boolean;
    /** 显式声明为交互按钮，支持键盘焦点与原生 button 交互 */
    interactive?: boolean;
    /** 禁用状态，屏蔽点击与关闭事件并置灰 */
    disabled?: boolean;
    /** 显式固定宽度，数值按 px、字符串原样使用 */
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
  // 2xs：更紧凑的微型徽标（角标/密集列表行内），文字沿用最小档 text-2xs
  '2xs': 'h-[0.95rem] gap-2xs px-[0.3rem] text-2xs',
  'xs': 'h-[1.15rem] gap-2xs px-[0.35rem] text-2xs',
  'sm': 'h-[1.35rem] gap-xs px-sm text-2xs',
  'md': 'h-[1.55rem] gap-xs px-[0.6rem] text-xs',
  'lg': 'h-[1.8rem] gap-sm px-md text-xs',
};

const VARIANT_APPEARANCE_MAP: Record<BadgeVariant, Record<BadgeAppearance, string>> = {
  neutral: {
    filled: 'border-border-light bg-surface-body text-fg-disabled',
    subtle: 'border-transparent bg-surface-panel-hover text-fg-body',
    outline: 'border-border-base bg-transparent text-fg-body',
  },
  primary: {
    filled: 'border-transparent bg-primary text-fg-on-accent',
    subtle: 'border-transparent bg-tint-primary-88 text-primary',
    outline: 'border-primary bg-transparent text-primary',
  },
  success: {
    filled: 'border-transparent bg-success text-fg-on-accent',
    subtle: 'border-transparent bg-tint-success-88 text-success',
    outline: 'border-success bg-transparent text-success',
  },
  warning: {
    filled: 'border-transparent bg-warning text-fg-on-accent',
    subtle: 'border-transparent bg-tint-warning-88 text-warning',
    outline: 'border-warning bg-transparent text-warning',
  },
  danger: {
    filled: 'border-transparent bg-danger text-fg-on-accent',
    subtle: 'border-transparent bg-tint-danger-88 text-danger',
    outline: 'border-danger bg-transparent text-danger',
  },
};

const sizeClasses = computed(() => SIZE_MAP[props.size] ?? SIZE_MAP.sm);
const variantAppearanceClasses = computed(
  () => VARIANT_APPEARANCE_MAP[props.variant]?.[props.appearance] ?? VARIANT_APPEARANCE_MAP.neutral.filled
);

/** 徽标尺寸 → 关闭图标档位映射：2xs/xs/sm/md/lg 统一取图标档位表，取消私有数字 */
const CLOSE_ICON_SIZE_BY_BADGE_SIZE: Record<BadgeSize, IconSizePreset> = {
  '2xs': 'xs',
  'xs': 'xs',
  'sm': 'sm',
  'md': 'md',
  'lg': 'lg',
};
const closeIconSize = computed<IconSizeValue>(() => CLOSE_ICON_SIZE_BY_BADGE_SIZE[props.size] ?? 'md');

/** 关闭按钮：禁用态屏蔽，派发 close */
const handleClose = (e: MouseEvent | KeyboardEvent) => {
  if (props.disabled) return;
  emit('close', e);
};

/** 徽标本体点击：hoverClose 模式整体作为关闭按钮，交互态派发 click */
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
