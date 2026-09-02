<template>
  <component
    v-bind="$attrs"
    v-if="resolvedComponent"
    :class="['base-icon shrink-0 align-middle', { 'animate-spin': spin }]"
    :is="resolvedComponent"
    :style="customStyle"
    aria-hidden="true"
  />
</template>

<script lang="ts" setup>
import { computed, type CSSProperties } from 'vue';

import { ICON_REGISTRY, type IconName } from './icons.registry';

export interface BaseIconProps {
  /** 图标名称（具备完整的 TypeScript 自动补全提示） */
  name: IconName;
  /**
   * 图标尺寸：
   * - 数字（如 16）：自动转换为 16px
   * - 字符串（如 '14px', '1.2rem', '1em'）：直接生效
   */
  size?: number | string;
  /** 图标颜色，默认 currentColor */
  color?: string;
  /** 旋转角度（如 90, 180） */
  rotate?: number;
  /** 是否添加旋转动画（用于加载中状态） */
  spin?: boolean;
}

const { name, size = '1em', color = undefined, rotate = undefined, spin = false } = defineProps<BaseIconProps>();

const resolvedComponent = computed(() => ICON_REGISTRY[name] || null);

const customStyle = computed<CSSProperties>(() => {
  const style: CSSProperties = {};

  if (size !== undefined) {
    const formattedSize = typeof size === 'number' ? `${size}px` : size;
    style.width = formattedSize;
    style.height = formattedSize;
    style.fontSize = formattedSize;
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
