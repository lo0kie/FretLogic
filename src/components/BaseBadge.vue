<template>
  <span
    class="base-badge"
    :class="[
      `variant-${variant}`,
      `size-${size}`,
      `appearance-${appearance}`,
      {
        'is-dot-only': isDotOnly,
        'is-interactive': interactive || $attrs.onClick,
      },
    ]"
  >
    <!-- 1. 指示圆点 (如状态灯) -->
    <span v-if="showDot && !isDotOnly" class="badge-dot"></span>

    <!-- 2. 前缀图标插槽 -->
    <slot name="prefix"></slot>

    <!-- 3. 主内容区域 (仅小红点模式时不渲染) -->
    <span v-if="!isDotOnly && ($slots.default || content !== undefined)" class="badge-content">
      <slot>{{ formattedContent }}</slot>
    </span>

    <!-- 4. 后缀图标 / 清除关闭按钮 -->
    <slot name="suffix">
      <button v-if="closable" type="button" class="badge-close-btn" title="关闭" @click.stop="handleClose">
        <X :size="closeIconSize" stroke-width="3" />
      </button>
    </slot>
  </span>
</template>

<script setup lang="ts">
import { X } from '@lucide/vue';
import { computed } from 'vue';

export type BadgeVariant = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
export type BadgeSize = 'xs' | 'sm' | 'md' | 'lg';
export type BadgeAppearance = 'filled' | 'subtle' | 'outline';

const props = withDefaults(
  defineProps<{
    /** 主题变体色彩 */
    variant?: BadgeVariant;
    /** 尺寸档位 */
    size?: BadgeSize;
    /** 视觉形态：filled (实心) | subtle (浅色弱化) | outline (描边) */
    appearance?: BadgeAppearance;
    /** 直接传入的文本/数字内容 */
    content?: string | number;
    /** 数字显示上限（例如 max=99 时，100 会显示为 99+） */
    max?: number;
    /** 是否只展示为小红点/指示点（忽略文字） */
    dot?: boolean;
    /** 是否在文本前展示状态指示圆点 */
    showDot?: boolean;
    /** 是否显示可关闭按钮 */
    closable?: boolean;
    /** 是否为可点击标签形态（提供悬浮高亮反馈） */
    interactive?: boolean;
  }>(),
  {
    variant: 'neutral',
    size: 'sm',
    appearance: 'filled',
    content: undefined,
    max: 99,
    dot: false,
    showDot: false,
    closable: false,
    interactive: false,
  }
);

const emit = defineEmits<{
  (e: 'close', event: MouseEvent): void;
}>();

/** 纯指示小红点模式：开启 dot 且无默认插槽/文本时 */
const isDotOnly = computed(() => props.dot && props.content === undefined);

/** 数字封顶格式化 (如 99+) */
const formattedContent = computed(() => {
  if (typeof props.content === 'number' && props.max && props.content > props.max) {
    return `${props.max}+`;
  }
  return props.content;
});

/** 根据 Badge 尺寸自动适配关闭图标大小 */
const closeIconSize = computed(() => {
  switch (props.size) {
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

  /* 可点击反馈 */
  &.is-interactive {
    cursor: pointer;

    &:hover {
      opacity: 0.85;
      transform: translateY(-1px);
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

  &:hover {
    opacity: 1;
    background-color: color-mix(in srgb, currentColor, transparent 82%);
  }
}
</style>
