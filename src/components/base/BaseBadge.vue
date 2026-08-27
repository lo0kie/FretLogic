<template>
  <component
    :is="isInteractive ? 'button' : 'span'"
    :type="isInteractive ? 'button' : undefined"
    class="inline-flex items-center justify-center shrink-0 rounded-full font-semibold leading-none tracking-tight box-border whitespace-nowrap select-none border border-transparent outline-none transition-all duration-fast"
    :class="[
      sizeClasses,
      variantAppearanceClasses,
      {
        'cursor-pointer hover:opacity-85 hover:-translate-y-px active:translate-y-0 active:scale-95': isInteractive,
        '!p-0 !w-2 !h-2 !min-w-0 !border-none': isDotOnly,
        '!px-0': Boolean(width),
        'group hover:!bg-tint-danger-88 hover:!text-danger hover:!border-tint-danger-75 focus-visible:!bg-tint-danger-88 focus-visible:!text-danger focus-visible:!border-tint-danger-75':
          hoverClose,
      },
    ]"
    :style="normalizedStyle"
    :role="isInteractive ? undefined : 'status'"
    :aria-label="ariaLabelText"
    data-focusable-inline
    @keydown.enter="handleKeydown"
    @keydown.space.prevent="handleKeydown"
    @click="handleClick"
  >
    <!-- 1. 指示圆点 (如状态灯) -->
    <span v-if="hasDot" class="w-1.5 h-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />

    <!-- 2. 前缀图标插槽 -->
    <slot name="prefix" />

    <!-- 3. 主内容区域 (仅小红点模式时不渲染) -->
    <span
      v-if="!isDotOnly && ($slots.default || content !== undefined)"
      class="inline-flex items-center justify-center overflow-hidden text-ellipsis h-full leading-none"
      :class="{ 'relative w-full h-full': hoverClose }"
    >
      <span
        class="inline-flex items-center justify-center h-full leading-none transition-opacity duration-fast"
        :class="{ 'group-hover:opacity-0': hoverClose }"
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

    <!-- 4. 后缀图标 / 清除关闭按钮 -->
    <slot name="suffix">
      <button
        v-if="closable && !hoverClose"
        :tabindex="isInteractive ? -1 : 0"
        type="button"
        class="p-0 ml-0.5 border-none bg-transparent text-current opacity-65 flex items-center justify-center cursor-pointer outline-none rounded-full transition-all duration-fast hover:opacity-100 hover:bg-tint-current-82"
        title="关闭"
        aria-label="关闭"
        @click.stop="handleClose"
      >
        <X :size="closeIconSize" stroke-width="3" aria-hidden="true" />
      </button>
    </slot>
  </component>
</template>

<script setup lang="ts">
import { X } from '@lucide/vue';
import { computed, useAttrs, useSlots } from 'vue';

type BadgeVariant = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
type BadgeSize = 'xs' | 'sm' | 'md' | 'lg';
type BadgeAppearance = 'filled' | 'subtle' | 'outline';

const {
  variant = 'neutral',
  size = 'sm',
  appearance = 'filled',
  content = undefined,
  max = 99,
  dot = false,
  showDot = false,
  closable = false,
  hoverClose = false,
  interactive = false,
  width = undefined,
} = defineProps<{
  variant?: BadgeVariant;
  size?: BadgeSize;
  appearance?: BadgeAppearance;
  content?: string | number;
  max?: number;
  dot?: boolean;
  showDot?: boolean;
  closable?: boolean;
  hoverClose?: boolean;
  interactive?: boolean;
  width?: string | number;
}>();

const emit = defineEmits<{
  (e: 'close', event: MouseEvent): void;
  (e: 'click', event: MouseEvent | KeyboardEvent): void;
}>();

const attrs = useAttrs();
const slots = useSlots();

const isInteractive = computed(() => interactive || hoverClose || Boolean(attrs.onClick));
const isDotOnly = computed(() => dot && content === undefined && !slots.default);
const hasDot = computed(() => (showDot || dot) && !isDotOnly.value);

const normalizedStyle = computed(() => {
  if (width === undefined) return {};
  const parsedWidth = typeof width === 'number' ? `${width}px` : width;
  return {
    width: parsedWidth,
    minWidth: parsedWidth,
  };
});

const formattedContent = computed(() => {
  if (typeof content === 'number' && max && content > max) {
    return `${max}+`;
  }
  return content;
});

const ariaLabelText = computed(() => {
  if (attrs['aria-label']) return String(attrs['aria-label']);
  if (isDotOnly.value) return '新消息提示';
  if (typeof content === 'number' && max && content > max) {
    return `超过 ${max} 条未读消息`;
  }
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

const sizeClasses = computed(() => SIZE_MAP[size] ?? SIZE_MAP.sm);
const variantAppearanceClasses = computed(
  () => VARIANT_APPEARANCE_MAP[variant]?.[appearance] ?? VARIANT_APPEARANCE_MAP.neutral.filled
);

const SIZE_TO_CLOSE_ICON: Record<string, number> = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
};
const closeIconSize = computed(() => SIZE_TO_CLOSE_ICON[size] ?? 14);

const handleClose = (e: MouseEvent) => {
  emit('close', e);
};

const handleKeydown = (e: KeyboardEvent) => {
  if (isInteractive.value) {
    emit('click', e);
  }
};

const handleClick = (e: MouseEvent) => {
  if (isInteractive.value) {
    emit('click', e);
  }
};
</script>
