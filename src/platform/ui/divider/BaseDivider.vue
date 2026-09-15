<template>
  <div
    :aria-orientation="orientation"
    :class="[colorClass, stretchClass]"
    :style="lineStyle"
    class="shrink-0"
    role="separator"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';

/**
 * BaseDivider — 分割线组件。
 *
 * 只负责「线本身」：方向、粗细、长度、颜色与语义化 role="separator"。
 * - 默认占满交叉轴可用空间：竖线 self-stretch 撑满容器高、横线 w-full 撑满容器宽；
 *   传入 length 后改为定长（竖线定高 / 横线定宽）
 * - inset 控制左右留白，数字按 px、字符串原样；上下留白直接用 class
 * - 粗细/长度/留白统一走内联 style，任意 px/rem 值，不受 Tailwind 类覆盖顺序影响
 */
const props = withDefaults(
  defineProps<{
    /** 线的方向：horizontal 为横线，vertical 为竖线 */
    orientation?: 'horizontal' | 'vertical';
    /** 线色：跟随主题令牌，与既有散落写法的取值一一对应 */
    color?: 'light' | 'glass' | 'base';
    /** 线宽（粗细）：数字按 px，字符串原样输出（如 '2px' / '0.125rem'），默认 1 */
    thickness?: number | string;
    /** 线长：数字按 px，字符串原样输出；不传时占满交叉轴可用空间 */
    length?: number | string;
    /** 左右留白：数字按 px，字符串原样；上下留白场景少，直接用 class（my-*） */
    inset?: number | string;
  }>(),
  { orientation: 'horizontal', color: 'light', thickness: 1, length: undefined, inset: undefined }
);

const toCss = (v: number | string | undefined) => (v === undefined ? undefined : typeof v === 'number' ? `${v}px` : v);

const lineStyle = computed(() => {
  const thickness = toCss(props.thickness);
  const length = toCss(props.length);
  const inset = toCss(props.inset);
  const isVertical = props.orientation === 'vertical';
  return {
    [isVertical ? 'width' : 'height']: thickness,
    ...(length !== undefined ? { [isVertical ? 'height' : 'width']: length } : {}),
    ...(inset !== undefined ? { margin: `0 ${inset}` } : {}),
  };
});

/** 未指定 length 时占满交叉轴：竖线纵向拉伸、横线横向铺满 */
const stretchClass = computed(() =>
  props.length !== undefined ? '' : props.orientation === 'vertical' ? 'self-stretch' : 'w-full'
);

const colorClass = computed(() =>
  props.color === 'glass' ? 'bg-glass-border' : props.color === 'base' ? 'bg-border-base' : 'bg-border-light'
);
</script>
