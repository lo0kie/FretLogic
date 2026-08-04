<template>
  <component
    :is="isInteractive ? 'button' : 'span'"
    :type="isInteractive ? 'button' : undefined"
    class="base-badge"
    :class="[
      `variant-${variant}`,
      `size-${size}`,
      `appearance-${appearance}`,
      {
        'is-dot-only': isDotOnly,
        'is-interactive': isInteractive,
      },
    ]"
    :role="isInteractive ? undefined : 'status'"
    :aria-label="ariaLabelText"
    @keydown.enter="handleKeydown"
    @keydown.space.prevent="handleKeydown"
    @click="handleClick"
  >
    <!-- 1. 指示圆点 (如状态灯) -->
    <span v-if="showDot && !isDotOnly" class="badge-dot" aria-hidden="true"></span>

    <!-- 2. 前缀图标插槽 -->
    <slot name="prefix"></slot>

    <!-- 3. 主内容区域 (仅小红点模式时不渲染) -->
    <span v-if="!isDotOnly && ($slots.default || content !== undefined)" class="badge-content">
      <slot>{{ formattedContent }}</slot>
    </span>

    <!-- 4. 后缀图标 / 清除关闭按钮 -->
    <slot name="suffix">
      <button
        v-if="closable"
        type="button"
        class="badge-close-btn"
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
import { BASE_BADGE_DEFAULTS } from '@/constants';
import { X } from '@lucide/vue';
import { computed, useAttrs, useSlots } from 'vue';

export type BadgeVariant = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
export type BadgeSize = 'xs' | 'sm' | 'md' | 'lg';
export type BadgeAppearance = 'filled' | 'subtle' | 'outline';

const {
  variant = BASE_BADGE_DEFAULTS.VARIANT,
  size = BASE_BADGE_DEFAULTS.SIZE,
  appearance = BASE_BADGE_DEFAULTS.APPEARANCE,
  content = undefined,
  max = BASE_BADGE_DEFAULTS.MAX,
  dot = false,
  showDot = false,
  closable = false,
  interactive = false,
} = defineProps<{
  variant?: BadgeVariant;
  size?: BadgeSize;
  appearance?: BadgeAppearance;
  content?: string | number;
  max?: number;
  dot?: boolean;
  showDot?: boolean;
  closable?: boolean;
  interactive?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close', event: MouseEvent): void;
  (e: 'click', event: MouseEvent | KeyboardEvent): void;
}>();

const attrs = useAttrs();
const slots = useSlots();

/** 是否属于可点击状态 */
const isInteractive = computed(() => interactive || Boolean(attrs.onClick));

/** 纯指示小红点模式：开启 dot 且无默认插槽/文本时 */
const isDotOnly = computed(() => dot && content === undefined && !slots.default);

/** 数字封顶格式化 (如 99+) */
const formattedContent = computed(() => {
  if (typeof content === 'number' && max && content > max) {
    return `${max}+`;
  }
  return content;
});

/** 读屏器友好文本：对于纯圆点或溢出数字（如 99+），提供明确的无障碍描述 */
const ariaLabelText = computed(() => {
  if (attrs['aria-label']) return String(attrs['aria-label']);
  if (isDotOnly.value) return '新消息提示';
  if (typeof content === 'number' && max && content > max) {
    return `超过 ${max} 条未读消息`;
  }
  return undefined;
});

/** 根据 Badge 尺寸自动适配关闭图标大小 */
const closeIconSize = computed(() => {
  switch (size) {
    case 'xs':
      return 8;
    case 'lg':
      return 12;
    case 'sm':
    case 'md':
    default:
      return 10;
  }
});

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

<style scoped lang="less">
@import '@/assets/tokens.module';

/* 1. 基础容器样式 */
.base-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 9999px;
  font-weight: 700;
  line-height: 1;
  transition: @transition-fast;
  box-sizing: border-box;
  white-space: nowrap;
  user-select: none;
  border: 1px solid transparent;
  outline: none;

  /* 可点击反馈 */
  &.is-interactive {
    cursor: pointer;

    &:hover {
      opacity: 0.85;
      transform: translateY(-1px);
    }

    &:focus-visible {
      box-shadow: @focus-ring-primary;
    }

    &:active {
      transform: translateY(0) scale(0.96);
    }
  }

  /* 仅小圆点模式 */
  &.is-dot-only {
    padding: 0 !important;
    width: 0.5rem !important;
    height: 0.5rem !important;
    min-width: unset !important;
    border: none !important;
  }
}

/* 2. 尺寸档位控制 (Size) */
.size-xs {
  font-size: 0.55rem;
  padding: 0.05rem 0.3rem;
  gap: 0.2rem;
}

.size-sm {
  font-size: 0.65rem;
  padding: 0.08rem 0.42rem;
  gap: 0.25rem;
}

.size-md {
  font-size: 0.72rem;
  padding: 0.12rem 0.55rem;
  gap: 0.3rem;
}

.size-lg {
  font-size: 0.8rem;
  padding: 0.18rem 0.68rem;
  gap: 0.35rem;
}

/* 3. 主题色彩与形态 (Variant & Appearance) */

/* Neutral (中性) */
.variant-neutral {
  &.appearance-filled {
    background-color: var(--bg-body);
    color: var(--text-disabled);
    border-color: var(--border-light);
  }
  &.appearance-subtle {
    background-color: var(--bg-panel-hover);
    color: var(--text-body);
  }
  &.appearance-outline {
    background-color: transparent;
    border-color: var(--border-base);
    color: var(--text-body);
  }
}

/* Primary (主色) */
.variant-primary {
  &.appearance-filled {
    background-color: var(--color-primary);
    color: #ffffff;
  }
  &.appearance-subtle {
    background-color: color-mix(in srgb, var(--color-primary), transparent 88%);
    color: var(--color-primary);
  }
  &.appearance-outline {
    background-color: transparent;
    border-color: var(--color-primary);
    color: var(--color-primary);
  }
}

/* Success (成功) */
.variant-success {
  &.appearance-filled {
    background-color: var(--color-success);
    color: #ffffff;
  }
  &.appearance-subtle {
    background-color: color-mix(in srgb, var(--color-success), transparent 88%);
    color: var(--color-success);
  }
  &.appearance-outline {
    background-color: transparent;
    border-color: var(--color-success);
    color: var(--color-success);
  }
}

/* Warning (警告) */
.variant-warning {
  &.appearance-filled {
    background-color: var(--color-warning);
    color: #ffffff;
  }
  &.appearance-subtle {
    background-color: color-mix(in srgb, var(--color-warning), transparent 88%);
    color: var(--color-warning);
  }
  &.appearance-outline {
    background-color: transparent;
    border-color: var(--color-warning);
    color: var(--color-warning);
  }
}

/* Danger (危险) */
.variant-danger {
  &.appearance-filled {
    background-color: var(--color-danger);
    color: #ffffff;
  }
  &.appearance-subtle {
    background-color: color-mix(in srgb, var(--color-danger), transparent 88%);
    color: var(--color-danger);
  }
  &.appearance-outline {
    background-color: transparent;
    border-color: var(--color-danger);
    color: var(--color-danger);
  }
}

/* 4. 内部子元素与指示点 */
.badge-content {
  display: inline-flex;
  align-items: center;
}

.badge-dot {
  width: 0.35rem;
  height: 0.35rem;
  border-radius: 50%;
  background-color: currentColor;
  flex-shrink: 0;
}

.badge-close-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin-left: 0.1rem;
  border: none;
  background: transparent;
  color: currentColor;
  opacity: 0.65;
  cursor: pointer;
  border-radius: 50%;
  transition: @transition-fast;
  outline: none;

  &:focus-visible {
    opacity: 1;
    box-shadow: 0 0 0 2px currentColor;
  }

  &:hover {
    opacity: 1;
    background-color: color-mix(in srgb, currentColor, transparent 82%);
  }
}
</style>
