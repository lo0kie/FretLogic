<template>
  <button
    v-wave="{ disabled }"
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    :aria-label="ariaLabel"
    :style="normalizedStyle"
    class="inline-flex items-center justify-center font-semibold border border-solid select-none box-border cursor-pointer shrink-0 outline-none transition-all duration-fast disabled:opacity-35 disabled:cursor-not-allowed disabled:shadow-none disabled:pointer-events-auto active:not-disabled:brightness-95 focus-visible:ring-2 focus-visible:ring-primary/70"
    :class="[sizeClasses, themeVariantClasses, roundedClasses, { '!p-0 !w-auto aspect-square': iconOnly }]"
    data-focusable-inline
    @click="handleInternalClick"
  >
    <Loader2 v-if="loading" :class="['loading-icon shrink-0 opacity-80 animate-spin', loaderSizeClass]" />
    <slot v-else name="prefix" />

    <span
      v-if="$slots.default && (!loading || !iconOnly)"
      class="button-content flex items-center justify-center whitespace-nowrap"
    >
      <slot :disabled />
    </span>

    <slot v-if="!loading || !iconOnly" name="suffix" />
  </button>
</template>

<script setup lang="ts">
import { Loader2 } from '@lucide/vue';
import { computed, watch } from 'vue';

const {
  type = 'button',
  color = 'default',
  primary = false,
  danger = false,
  warning = false,
  disabled = false,
  loading = false,
  iconOnly = false,
  variant = 'default',
  ariaLabel,
  size = 'md',
  rounded = 'full',
  width = undefined,
  height = undefined,
} = defineProps<{
  /** 原生 button 的 type，默认 'button' 避免在表单内意外触发表单提交 */
  type?: 'button' | 'submit' | 'reset';
  /** 统一主题色；显式传入时优先级高于 primary/danger/warning 布尔语法糖 */
  color?: 'default' | 'primary' | 'danger' | 'warning' | 'success';
  /** @deprecated 语法糖，建议改用 color */
  primary?: boolean;
  /** @deprecated 语法糖，建议改用 color */
  danger?: boolean;
  /** @deprecated 语法糖，建议改用 color */
  warning?: boolean;
  disabled?: boolean;
  loading?: boolean;
  iconOnly?: boolean;
  variant?: 'default' | 'subtle' | 'ghost' | 'text';
  /** iconOnly 场景下必须提供，保证无障碍可访问性 */
  ariaLabel?: string;
  size?: 'sm' | 'md' | 'lg';
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  width?: string | number;
  height?: string | number;
}>();

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void;
}>();

const handleInternalClick = (e: MouseEvent) => {
  // 禁用或加载中时拦截点击，避免样式覆盖/特殊事件触发导致意外冒泡
  if (disabled || loading) {
    e.preventDefault();
    return;
  }
  emit('click', e);
};

type ThemeType = 'default' | 'primary' | 'danger' | 'warning' | 'success';

const resolvedColor = computed<ThemeType>(() => {
  if (color && color !== 'default') return color;
  if (primary) return 'primary';
  if (danger) return 'danger';
  if (warning) return 'warning';
  return 'default';
});

// iconOnly 但缺少 aria-label 时给出开发期警告，提示补充无障碍标签
watch(
  () => [iconOnly, ariaLabel] as const,
  ([io, label]) => {
    if (import.meta.env.DEV && io && !label) {
      console.warn('[ActionButton] iconOnly 为 true 时应传入 ariaLabel，否则屏幕阅读器无法识别该按钮。');
    }
  },
  { immediate: true }
);

const SIZE_MAP: Record<string, string> = {
  sm: 'h-[1.6rem] px-md text-xs gap-xs',
  md: 'h-[1.9rem] px-lg text-xs gap-sm',
  lg: 'h-[2.3rem] px-xl text-sm gap-sm',
};

const LOADER_SIZE_MAP: Record<string, string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

const ROUNDED_MAP: Record<string, string> = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-pill',
};

const TEXT_THEME_MAP: Record<ThemeType, string> = {
  primary: 'text-primary hover:bg-bg-panel-hover',
  danger: 'text-danger hover:bg-bg-panel-hover',
  warning: 'text-warning hover:bg-bg-panel-hover',
  success: 'text-success hover:bg-bg-panel-hover',
  default: 'text-text-body hover:bg-bg-panel-hover',
};

const GHOST_THEME_MAP: Record<ThemeType, string> = {
  primary: 'text-primary hover:bg-bg-panel-hover',
  danger: 'text-danger hover:bg-bg-panel-hover',
  warning: 'text-warning hover:bg-bg-panel-hover',
  success: 'text-success hover:bg-bg-panel-hover',
  default: 'text-text-disabled hover:text-text-body hover:bg-bg-panel-hover',
};

const SUBTLE_THEME_MAP: Record<ThemeType, string> = {
  primary: 'bg-tint-primary-90 border-tint-primary-90 text-primary hover:bg-tint-primary-80',
  danger: 'bg-tint-danger-90 border-tint-danger-90 text-danger hover:bg-tint-danger-80',
  warning: 'bg-tint-warning-90 border-tint-warning-90 text-warning hover:bg-tint-warning-80',
  success: 'bg-tint-success-88 border-tint-success-88 text-success hover:bg-tint-success-82',
  default: 'bg-bg-panel-hover border-border-light text-text-body hover:bg-border-base',
};

const DEFAULT_THEME_MAP: Record<ThemeType, string> = {
  primary: 'bg-primary border-transparent text-text-on-accent shadow-[0_1px_4px_rgba(0,122,255,0.3)] hover:opacity-90',
  danger: 'bg-tint-danger-88 border-transparent text-danger hover:bg-tint-danger-78',
  warning: 'bg-tint-warning-88 border-transparent text-warning hover:bg-tint-warning-78',
  success: 'bg-success border-transparent text-text-on-accent shadow-[0_1px_4px_rgba(52,199,89,0.3)] hover:opacity-90',
  default:
    'bg-bg-body border-border-light text-text-body hover:border-border-base hover:bg-bg-panel-hover hover:text-text-title hover:shadow-xs',
};

const sizeClasses = computed(() => SIZE_MAP[size] ?? SIZE_MAP.md);
const loaderSizeClass = computed(() => LOADER_SIZE_MAP[size] ?? LOADER_SIZE_MAP.md);
const roundedClasses = computed(() => ROUNDED_MAP[rounded] ?? ROUNDED_MAP.full);

const themeVariantClasses = computed(() => {
  if (variant === 'ghost') {
    return `bg-transparent border-transparent ${GHOST_THEME_MAP[resolvedColor.value]}`;
  }
  if (variant === 'subtle') {
    return SUBTLE_THEME_MAP[resolvedColor.value];
  }
  if (variant === 'text') {
    return `px-[0.3rem] !bg-transparent border-transparent focus:border-primary active:enabled:border-primary focus-visible:border-primary focus-visible:ring-2 ${TEXT_THEME_MAP[resolvedColor.value]}`;
  }
  return DEFAULT_THEME_MAP[resolvedColor.value];
});

const normalizedStyle = computed(() => {
  const style: Record<string, string> = {};
  if (width !== undefined) {
    style.width = typeof width === 'number' ? `${width}px` : width;
  }
  if (height !== undefined) {
    style.height = typeof height === 'number' ? `${height}px` : height;
  }
  return style;
});
</script>
