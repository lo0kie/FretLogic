<template>
  <component
    v-bind="$attrs"
    v-if="resolvedComponent"
    :class="['base-icon shrink-0 align-middle', { 'animate-spin': spin }]"
    :data-icon-stroke="strokeWidth !== undefined ? '' : undefined"
    :is="resolvedComponent"
    :style="customStyle"
    aria-hidden="true"
  />
</template>

<script lang="ts" setup>
import { computed, type CSSProperties } from 'vue';

import { ICON_REGISTRY, type IconName } from './icons.registry';
import { ICON_SIZE_PRESETS, type IconSizePreset } from './iconSizes';

export interface BaseIconProps {
  /** 图标名称（具备完整的 TypeScript 自动补全提示） */
  name: IconName;
  /**
   * 图标尺寸（默认 '1em'，跟随所在行字号）：
   * - 预设档位：'xs'(12) | 'sm'(14) | 'md'(16) | 'lg'(18) | 'xl'(20)，见 ICON_SIZE_PRESETS
   * - 数字（如 16）：自动转换为 16px（非常规档位或超大场景例外使用）
   * - 其它字符串（如 '14px', '1.2rem'）：直接生效
   */
  size?: IconSizePreset | number | string;
  /**
   * 图标描边粗细（针对 Lucide 等描边类图标）：
   * - 数字（如 2, 2.5, 3）：自动转换为 px 或数值生效
   * - 字符串（如 '2.5px'）：直接生效
   */
  strokeWidth?: number | string;
  /** 图标颜色，默认 currentColor */
  color?: string;
  /** 旋转角度（如 90, 180） */
  rotate?: number;
  /** 是否添加旋转动画（用于加载中状态） */
  spin?: boolean;
}

const {
  name,
  size = '1em',
  strokeWidth = undefined,
  color = undefined,
  rotate = undefined,
  spin = false,
} = defineProps<BaseIconProps>();

const resolvedComponent = computed(() => ICON_REGISTRY[name] || null);

/** 预设档位名 → px；数字 → px；其余字符串（px/rem/em）原样生效 */
const resolveIconSize = (value: IconSizePreset | number | string): string => {
  if (typeof value === 'number') return `${value}px`;
  const presetPx = ICON_SIZE_PRESETS[value as IconSizePreset];
  if (presetPx !== undefined) return `${presetPx}px`;
  return value;
};

const customStyle = computed<CSSProperties>(() => {
  const style: CSSProperties = {};

  if (size !== undefined) {
    const formattedSize = resolveIconSize(size);
    style.width = formattedSize;
    style.height = formattedSize;
    style.fontSize = formattedSize;
  }

  if (strokeWidth !== undefined) {
    style.strokeWidth = typeof strokeWidth === 'number' ? `${strokeWidth}px` : strokeWidth;
  }

  if (color) {
    style.color = color;
  }

  if (rotate !== undefined) {
    style.transform = `rotate(${rotate}deg)`;
  }

  return style;
});
</script>

<style>
/* Lucide 等描边图标把 stroke-width 写死在内部 path 的 SVG presentation attribute 上，
   根元素上的 CSS stroke-width 因优先级低于该 attribute 而传不下去——导致 BaseIcon 的
   strokeWidth 看似无效。这里当根显式声明了描边粗细（data-icon-stroke 标记）时，
   强制内部所有描边元素从根继承该值。 */
.base-icon[data-icon-stroke] :is(path, line, polyline, circle, ellipse, rect, polygon) {
  stroke-width: inherit !important;
}
</style>
