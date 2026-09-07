<template>
  <component
    v-bind="$attrs"
    v-if="resolvedComponent"
    :class="['base-icon shrink-0 align-middle', { 'animate-spin': spin }]"
    :data-icon-stroke="iconStroke !== undefined ? '' : undefined"
    :is="resolvedComponent"
    :style="customStyle"
    aria-hidden="true"
  />
</template>

<script setup lang="ts">
import { computed, watchEffect } from 'vue';

import { logger } from '@/platform/utils/logger';

import { ICON_REGISTRY } from './icons.registry.ts';
import { resolveIconSize, resolveIconStroke } from './iconSizes.ts';

import type { IconName } from './icons.registry.ts';
import type { IconSizeValue, IconStrokeValue } from './iconSizes.ts';
import type { CSSProperties } from 'vue';

export interface BaseIconProps {
  /** 图标名称（具备完整的 TypeScript 自动补全提示） */
  name: IconName;
  /**
   * 图标尺寸（默认 '1em'，跟随所在行字号）：
   * - 预设档位：'xs'(12) | 'sm'(14) | 'md'(16) | 'lg'(18) | 'xl'(20) | '2xl'(26) | '3xl'(38)，见 ICON_SIZE_PRESETS
   * - 数字（如 22）：自动转换为 22px（非常规档位例外）
   * - 其它字符串（如 '14px', '1.2rem'）：直接生效
   *
   * 命名带 icon 前缀，以区别于各业务组件的 `size`（组件自身尺寸档位）。
   */
  iconSize?: IconSizeValue;
  /**
   * 图标描边粗细（针对 Lucide 等描边类图标）：
   * - 预设档位：'thin'(2.2) | 'regular'(2.5) | 'bold'(3)，见 ICON_STROKE_PRESETS
   * - 数字（如 3）：自动转换为 px
   * - 字符串（如 '2.5px'）：直接生效
   */
  iconStroke?: IconStrokeValue;
  /** 图标颜色，默认 currentColor */
  color?: string;
  /** 旋转角度（如 90, 180） */
  rotate?: number;
  /** 是否添加旋转动画（用于加载中状态） */
  spin?: boolean;
}

const {
  name,
  iconSize = '1em',
  iconStroke = undefined,
  color = undefined,
  rotate = undefined,
  spin = false,
} = defineProps<BaseIconProps>();

const resolvedComponent = computed(() => ICON_REGISTRY[name] || null);

// 未注册的图标名（拼写错误 / 后端动态返回的图标名强转为 IconName）会静默渲染成空白，
// 既看不出"没传"也看不出"传错"，排查成本极高——开发期显式告警。
// 用 watchEffect 而非 setup 内一次性判断：图标名可能随数据动态变化。
if (import.meta.env.DEV) {
  watchEffect(() => {
    if (name && !resolvedComponent.value) {
      logger.warn('BaseIcon', `图标名 "${name}" 未在 ICON_REGISTRY 中注册，图标不会渲染`);
    }
  });
}

const customStyle = computed<CSSProperties>(() => {
  const style: CSSProperties = {};

  // iconSize 默认 '1em'，恒有值——原 `!== undefined` 判断恒真且易误导为"存在不设尺寸的路径"，故直接解析
  const formattedSize = resolveIconSize(iconSize);
  style.width = formattedSize;
  style.height = formattedSize;
  style.fontSize = formattedSize;

  if (iconStroke !== undefined) {
    style.strokeWidth = resolveIconStroke(iconStroke);
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

<!-- 注意：本块**不可加 scoped**。
     规则要作用于图标子组件渲染的 SVG 内部元素（g/path/line…），而 scoped 会把作用域属性
     追加到末位选择器上，那些内部节点并不携带 BaseIcon 的 scope id —— 加了即整条规则失效、
     描边粗细覆盖全部失灵。故保持全局；碰撞风险由 `.base-icon[data-icon-stroke]` 双条件
     限定（需同时命中 class 与本组件独有的 data 标记），实际上足够特异。 -->
<style>
/* Lucide 等描边图标把 stroke-width 写死在内部 path/g 的 SVG presentation attribute 上，
   根元素上的 CSS stroke-width 因优先级低于该 attribute 而传不下去——导致 BaseIcon 的
   strokeWidth 看似无效。这里当根显式声明了描边粗细（data-icon-stroke 标记）时，
   强制内部所有容器与描边元素（包含 g 分组）从根继承该值。 */
.base-icon[data-icon-stroke] :is(g, path, line, polyline, circle, ellipse, rect, polygon) {
  stroke-width: inherit !important;
}
</style>
