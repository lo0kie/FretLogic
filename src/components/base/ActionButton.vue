<template>
  <button
    v-wave="{ disabled: disabled || loading }"
    :type="type"
    :tabindex="tabindex"
    :disabled="disabled || loading"
    :aria-disabled="disabled || loading || undefined"
    :aria-busy="loading || undefined"
    :aria-label="ariaLabel"
    :style="normalizedStyle"
    class="inline-flex items-center justify-center font-semibold border border-solid select-none box-border cursor-pointer shrink-0 outline-none transition-all duration-fast disabled:opacity-35 disabled:cursor-not-allowed disabled:shadow-none disabled:pointer-events-auto active:not-disabled:brightness-95 focus-visible:ring-2 focus-visible:ring-primary/70"
    :class="[sizeClasses, themeVariantClasses, roundedClasses, { 'w-full': block }]"
    data-focusable-inline
    @click="handleInternalClick"
  >
    <Loader2 v-if="loading" :class="['loading-icon shrink-0 opacity-80 animate-spin', loaderSizeClass]" />
    <slot v-else name="prefix" :disabled="disabled" :loading="loading" :size="size" />

    <span
      v-if="$slots['default'] && (!loading || !iconOnly)"
      class="button-content flex items-center justify-center whitespace-nowrap"
    >
      <slot :disabled="disabled" :loading="loading" :size="size" />
    </span>

    <slot v-if="!loading || !iconOnly" name="suffix" :disabled="disabled" :loading="loading" :size="size" />
  </button>
</template>

<script setup lang="ts">
import { Loader2 } from '@lucide/vue';
import { computed, watch } from 'vue';

const {
  type = 'button',
  color = 'default',
  disabled = false,
  loading = false,
  iconOnly = false,
  variant = 'default',
  ariaLabel,
  size = 'md',
  rounded = 'full',
  block = false,
  width = undefined,
  height = undefined,
  /** 紧凑模式：左右内边距减半 */
  compacted = false,
} = defineProps<{
  /** 原生 button 的 type，默认 'button' 避免在表单内意外触发表单提交 */
  type?: 'button' | 'submit' | 'reset';
  /** 统一主题色 */
  color?: 'default' | 'primary' | 'danger' | 'warning' | 'success';
  disabled?: boolean;
  loading?: boolean;
  iconOnly?: boolean;
  variant?: 'default' | 'subtle' | 'ghost' | 'text';
  /** iconOnly 场景下必须提供，保证无障碍可访问性 */
  ariaLabel?: string;
  size?: 'sm' | 'md' | 'lg';
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  /** 是否占满父容器宽度 (w-full) */
  block?: boolean;
  width?: string | number;
  height?: string | number;
  /** 紧凑模式：左右内边距减半（不影响高度、圆角、iconOnly、显式 width/height） */
  compacted?: boolean;
  /** 原生 button 的 tabindex（不传则保持按钮默认可聚焦） */
  tabindex?: number;
}>();

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void;
}>();

const handleInternalClick = (e: MouseEvent) => {
  // 禁用或加载中时彻底拦截点击，阻断事件冒泡与后续监听器执行
  if (disabled || loading) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    return;
  }
  emit('click', e);
};

type ThemeType = 'default' | 'primary' | 'danger' | 'warning' | 'success';

const resolvedColor = computed<ThemeType>(() => color ?? 'default');

// 仅在开发环境中注册 a11y 警告监听，生产环境构建时被完全 Tree-shaking
if (import.meta.env.DEV) {
  watch(
    () => [iconOnly, ariaLabel] as const,
    ([io, label]) => {
      if (io && !label) {
        console.warn('[ActionButton] iconOnly 为 true 时应传入 ariaLabel，否则屏幕阅读器无法识别该按钮。');
      }
    },
    { immediate: true }
  );
}

const SIZE_MAP: Record<string, string> = {
  sm: 'h-[1.6rem] px-md text-xs gap-xs',
  md: 'h-[1.9rem] px-lg text-xs gap-sm',
  lg: 'h-[2.3rem] px-xl text-sm gap-sm',
};

/** 紧凑模式尺寸：仅左右内边距减半，高度/字号/间距保持与原尺寸一致 */
const COMPACTED_SIZE_MAP: Record<string, string> = {
  sm: 'h-[1.6rem] px-[0.4rem] text-xs gap-xs',
  md: 'h-[1.9rem] px-[0.6rem] text-xs gap-sm',
  lg: 'h-[2.3rem] px-[0.8rem] text-sm gap-sm',
};

const ICON_ONLY_SIZE_MAP: Record<string, string> = {
  sm: '!p-0 w-[1.6rem] h-[1.6rem] aspect-square',
  md: '!p-0 w-[1.9rem] h-[1.9rem] aspect-square',
  lg: '!p-0 w-[2.3rem] h-[2.3rem] aspect-square',
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
  primary: 'text-primary hover:enabled:bg-bg-panel-hover',
  danger: 'text-danger hover:enabled:bg-bg-panel-hover',
  warning: 'text-warning hover:enabled:bg-bg-panel-hover',
  success: 'text-success hover:enabled:bg-bg-panel-hover',
  default: 'text-text-body hover:enabled:bg-bg-panel-hover',
};

const GHOST_THEME_MAP: Record<ThemeType, string> = {
  primary: 'text-primary hover:enabled:bg-bg-panel-hover',
  danger: 'text-danger hover:enabled:bg-bg-panel-hover',
  warning: 'text-warning hover:enabled:bg-bg-panel-hover',
  success: 'text-success hover:enabled:bg-bg-panel-hover',
  default: 'text-text-disabled hover:enabled:text-text-body hover:enabled:bg-bg-panel-hover',
};

const SUBTLE_THEME_MAP: Record<ThemeType, string> = {
  primary: 'bg-tint-primary-90 border-tint-primary-90 text-primary hover:enabled:bg-tint-primary-80',
  danger: 'bg-tint-danger-90 border-tint-danger-90 text-danger hover:enabled:bg-tint-danger-80',
  warning: 'bg-tint-warning-90 border-tint-warning-90 text-warning hover:enabled:bg-tint-warning-80',
  success: 'bg-tint-success-88 border-tint-success-88 text-success hover:enabled:bg-tint-success-82',
  default: 'bg-bg-panel-hover border-border-light text-text-body hover:enabled:bg-border-base',
};

const DEFAULT_THEME_MAP: Record<ThemeType, string> = {
  primary:
    'bg-primary border-transparent text-text-on-accent shadow-[0_1px_4px_rgba(0,122,255,0.3)] hover:enabled:opacity-90',
  danger: 'bg-tint-danger-88 border-transparent text-danger hover:enabled:bg-tint-danger-78',
  warning: 'bg-tint-warning-88 border-transparent text-warning hover:enabled:bg-tint-warning-78',
  success:
    'bg-success border-transparent text-text-on-accent shadow-[0_1px_4px_rgba(52,199,89,0.3)] hover:enabled:opacity-90',
  default:
    'bg-bg-body border-border-light text-text-body hover:enabled:border-border-base hover:enabled:bg-bg-panel-hover hover:enabled:text-text-title hover:enabled:shadow-xs',
};

const sizeClasses = computed(() => {
  if (iconOnly) {
    // iconOnly 已通过 !p-0 强制方形无内边距，compacted 不再叠加
    return ICON_ONLY_SIZE_MAP[size] ?? ICON_ONLY_SIZE_MAP['md'];
  }
  const map = compacted ? COMPACTED_SIZE_MAP : SIZE_MAP;
  return map[size] ?? map['md'];
});

const loaderSizeClass = computed(() => LOADER_SIZE_MAP[size] ?? LOADER_SIZE_MAP['md']);
const roundedClasses = computed(() => ROUNDED_MAP[rounded] ?? ROUNDED_MAP['full']);

const themeVariantClasses = computed(() => {
  if (variant === 'ghost') {
    return `bg-transparent border-transparent ${GHOST_THEME_MAP[resolvedColor.value]}`;
  }
  if (variant === 'subtle') {
    return SUBTLE_THEME_MAP[resolvedColor.value];
  }
  if (variant === 'text') {
    // 紧凑模式下进一步收紧文字按钮的左右内边距
    return `px-[${compacted ? '0.15rem' : '0.3rem'}] !bg-transparent border-transparent focus:border-primary active:enabled:border-primary focus-visible:border-primary focus-visible:ring-2 ${TEXT_THEME_MAP[resolvedColor.value]}`;
  }
  return DEFAULT_THEME_MAP[resolvedColor.value];
});

const normalizedStyle = computed(() => {
  const style: Record<string, string> = {};
  if (width !== undefined) {
    style['width'] = typeof width === 'number' ? `${width}px` : width;
  }
  if (height !== undefined) {
    style['height'] = typeof height === 'number' ? `${height}px` : height;
  }
  return style;
});
</script>
