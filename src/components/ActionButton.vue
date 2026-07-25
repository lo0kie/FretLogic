<template>
  <button
    :disabled="disabled || loading"
    @click="handleInternalClick"
    :style="{ height, width }"
    class="action-button-base"
    :class="[sizeClass, themeClass, variantClass, roundedClass, { 'is-icon-only': iconOnly, 'is-active': active }]"
  >
    <Loader2 v-if="loading" class="loading-icon" />
    <slot v-else name="prefix"></slot>

    <span v-if="$slots.default" class="button-content">
      <slot></slot>
    </span>

    <slot name="suffix"></slot>
  </button>
</template>

<script setup lang="ts">
import { Loader2 } from '@lucide/vue';
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    primary?: boolean;
    danger?: boolean;
    warning?: boolean;
    disabled?: boolean;
    loading?: boolean;
    active?: boolean;
    iconOnly?: boolean;
    variant?: 'default' | 'subtle' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
    width?: string;
    height?: string;
  }>(),
  {
    size: 'md',
    loading: false,
    active: false,
    iconOnly: false,
    variant: 'default',
    rounded: 'full',
  }
);

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void;
}>();

const handleInternalClick = (e: MouseEvent) => {
  emit('click', e);
};

const themeClass = computed(() => {
  if (props.primary) return 'theme-primary';
  if (props.danger) return 'theme-danger';
  if (props.warning) return 'theme-warning';
  return 'theme-default';
});

const variantClass = computed(() => `variant-${props.variant}`);
const sizeClass = computed(() => `size-${props.size}`);
const roundedClass = computed(() => `rounded-${props.rounded}`);
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

/* 1. 基础容器：定义通用结构与动画 */
.action-button-base {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  border-style: solid;
  border-width: 1px;
  user-select: none;
  box-sizing: border-box;
  transition: @transition-fast;
  cursor: pointer;
  flex-shrink: 0;

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
    pointer-events: auto;
  }

  &:active:not(:disabled) {
    transform: scale(0.95);
  }
}

/* 2. 尺寸（Size）：统一控制高度、字体大小与内边距 */
.size-sm {
  height: 1.5rem;
  padding: 0 0.65rem;
  font-size: 0.68rem;
  gap: 0.3rem;
}

.size-md {
  height: 1.75rem;
  padding: 0 1rem;
  font-size: 0.72rem;
  gap: 0.45rem;
}

.size-lg {
  height: 2.5rem;
  padding: 0 1.25rem;
  font-size: 0.75rem;
  gap: 0.5rem;
}

/* 3. 变体（Variant）样式 */
.variant-subtle {
  background-color: color-mix(in srgb, var(--color-primary), transparent 90%);
  border-color: color-mix(in srgb, var(--color-primary), transparent 90%);
  color: var(--color-primary);

  &:hover:not(:disabled) {
    background-color: color-mix(in srgb, var(--color-primary), transparent 80%);
  }
}

.variant-ghost {
  background-color: transparent;
  border-color: transparent;
  color: var(--text-disabled);

  &:hover:not(:disabled) {
    background-color: var(--bg-panel-hover);
    color: var(--text-title);
  }
}

/* 4. 主题（Theme）样式 */
.theme-primary {
  background-color: var(--color-primary);
  border-color: transparent;
  color: #ffffff;
  box-shadow: 0 2px 10px color-mix(in srgb, var(--color-primary), transparent 60%);

  &:hover:not(:disabled) {
    opacity: 0.92;
  }
}

.theme-danger {
  color: var(--color-danger);
  border-color: transparent;
  background-color: color-mix(in srgb, var(--color-danger), transparent 88%);

  &:hover:not(:disabled) {
    background-color: color-mix(in srgb, var(--color-danger), transparent 78%);
  }
}

.theme-warning {
  color: var(--color-warning);
  border-color: transparent;
  background-color: color-mix(in srgb, var(--color-warning), transparent 88%);

  &:hover:not(:disabled) {
    background-color: color-mix(in srgb, var(--color-warning), transparent 78%);
  }
}

.theme-default:not(.variant-subtle):not(.variant-ghost) {
  background-color: var(--bg-body);
  border-color: var(--border-light);
  color: var(--text-body);

  &:hover:not(:disabled) {
    border-color: var(--border-base);
    background-color: var(--bg-panel-hover);
    color: var(--text-title);
  }
}

/* 5. 激活状态（Active） */
.action-button-base.is-active {
  background-color: color-mix(in srgb, var(--color-primary), transparent 88%);
  color: var(--color-primary);
  border-color: color-mix(in srgb, var(--color-primary), transparent 75%);
}

/* 6. Icon-Only 修正模式：严格保证正方形且继承当前 size 的 height */
.action-button-base.is-icon-only {
  padding: 0;
  width: auto;
  aspect-ratio: 1 / 1;
}

/* 7. 圆角（Rounded）：定义在文件最下方以保证 highest CSS priority */
.action-button-base.rounded-none {
  border-radius: 0;
}
.action-button-base.rounded-sm {
  border-radius: @radius-sm;
}
.action-button-base.rounded-md {
  border-radius: @radius-md;
}
.action-button-base.rounded-lg {
  border-radius: @radius-lg;
}
.action-button-base.rounded-full {
  border-radius: 9999px;
}

/* 辅助图标与内容样式 */
.loading-icon {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  opacity: 0.8;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.button-content {
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
}
</style>
