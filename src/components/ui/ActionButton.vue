<template>
  <button
    v-wave="{ disabled: disabled || loading }"
    :aria-busy="loading || undefined"
    :aria-disabled="disabled || loading || undefined"
    :aria-label
    :class="[sizeClasses, themeVariantClasses, roundedClasses, { 'w-full': block }]"
    :disabled="disabled || loading"
    :style="normalizedStyle"
    :tabindex
    :type
    @click="handleInternalClick"
    class="action-button focus-visible:ring-primary/70 box-border inline-flex shrink-0 cursor-pointer items-center justify-center border border-solid font-semibold outline-none select-none focus-visible:ring-2 active:not-disabled:brightness-95 disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none"
    data-focusable-inline
  >
    <BaseIcon
      v-if="loading"
      :class="['loading-icon shrink-0 animate-spin opacity-80', loaderSizeClass]"
      name="loader-2"
    />
    <slot v-else :disabled :loading :size name="prefix" />

    <span
      v-if="$slots['default'] && (!loading || !iconOnly)"
      class="button-content flex items-center justify-center whitespace-nowrap"
    >
      <slot :disabled :loading :size />
    </span>

    <slot v-if="!loading || !iconOnly" :disabled :loading :size name="suffix" />
  </button>
</template>

<script lang="ts" setup>
import { computed, watch } from 'vue';

import BaseIcon from '@/components/ui/BaseIcon.vue';
import {
  BUTTON_COMPACTED_SIZE_MAP,
  BUTTON_DEFAULT_THEME_MAP,
  BUTTON_GHOST_THEME_MAP,
  BUTTON_ICON_ONLY_SIZE_MAP,
  BUTTON_LOADER_SIZE_MAP,
  BUTTON_ROUNDED_MAP,
  BUTTON_SIZE_MAP,
  BUTTON_SUBTLE_THEME_MAP,
  BUTTON_TEXT_THEME_MAP,
} from '@/components/ui/buttonThemes';
import { type ThemeColor } from '@/types';

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

/** 统一点击入口：禁用 / 加载中彻底拦截，其余透传 click */
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

type ThemeType = ThemeColor;

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

const sizeClasses = computed(() => {
  if (iconOnly) {
    // iconOnly 已通过 p-0! 强制方形无内边距，compacted 不再叠加
    return BUTTON_ICON_ONLY_SIZE_MAP[size] ?? BUTTON_ICON_ONLY_SIZE_MAP['md'];
  }
  const map = compacted ? BUTTON_COMPACTED_SIZE_MAP : BUTTON_SIZE_MAP;
  return map[size] ?? map['md'];
});

const loaderSizeClass = computed(() => BUTTON_LOADER_SIZE_MAP[size] ?? BUTTON_LOADER_SIZE_MAP['md']);
const roundedClasses = computed(() => BUTTON_ROUNDED_MAP[rounded] ?? BUTTON_ROUNDED_MAP['full']);

const themeVariantClasses = computed(() => {
  if (variant === 'ghost') {
    return `bg-transparent border-transparent ${BUTTON_GHOST_THEME_MAP[resolvedColor.value]}`;
  }
  if (variant === 'subtle') {
    return BUTTON_SUBTLE_THEME_MAP[resolvedColor.value];
  }
  if (variant === 'text') {
    // 紧凑模式下进一步收紧文字按钮的左右内边距
    return `px-[${compacted ? '0.15rem' : '0.3rem'}] bg-transparent! border-transparent focus:border-primary active:enabled:border-primary focus-visible:border-primary focus-visible:ring-2 ${BUTTON_TEXT_THEME_MAP[resolvedColor.value]}`;
  }
  return BUTTON_DEFAULT_THEME_MAP[resolvedColor.value];
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

<!--
  统一过渡：颜色 / 背景 / 边框 / 阴影 / 滤镜 / 不透明度 / 位移 一次声明，
  避免多个 Tailwind transition-* 工具类各自重写 transition-property 互相覆盖。
  用长写属性（不写 transition-delay），以免覆盖调用方加在按钮上的
  [transition-delay:40ms] / [transition-delay:80ms] 错峰延迟。
  时长锁定设计令牌 $duration-fast，缓动用 $bezier-standard。
-->
<style lang="scss" scoped>
@use '@/assets/tokens' as *;

.action-button {
  transition-property:
    color, background-color, border-color, box-shadow, filter, opacity, transform, translate, scale, rotate;
  transition-duration: $duration-fast;
  transition-timing-function: $bezier-standard;
}
</style>
