<template>
  <Teleport :disabled="disabledTeleport" :to="teleportTo">
    <Transition
      :name="transitionName"
      @after-enter="emit('after-enter', $event)"
      @after-leave="emit('after-leave', $event)"
      @before-enter="emit('before-enter', $event)"
      @before-leave="emit('before-leave', $event)"
      @enter="emit('enter', $event)"
      @leave="emit('leave', $event)"
      appear
    >
      <button
        v-wave
        v-bind="$attrs"
        v-if="isButtonVisible"
        v-tooltip.top="computedTooltip"
        :aria-label="computedAriaLabel"
        :class="[positionClass, alignClass, zIndexClass, fabSizeClass]"
        :style="positionStyle"
        class="base-fab pointer-events-auto flex aspect-square shrink-0 cursor-pointer items-center justify-center rounded-full border border-glass-border bg-surface-panel/95 shadow-lg backdrop-blur-xl select-none hover:ring-2 hover:ring-primary/70 active:scale-95"
        type="button"
      >
        <slot>
          <BaseIcon :icon-size="computedIconSize" :icon-stroke="iconStroke ?? 'regular'" :name="icon" />
        </slot>
      </button>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import { logger } from '@/platform/utils/logger';

import { useFloatingPosition } from './floatingPosition';
import { ALIGN_CLASS_MAP } from './floatingPositions';
import { useKeepAliveVisible } from './useKeepAliveVisible';

import type { TooltipOptions } from '@/platform/directives/vTooltip';
import type { ComponentSize } from '@/platform/types';
import type { IconName } from '@/platform/ui/icons/icons.registry';
import type { IconSizePreset, IconSizeValue, IconStrokeValue } from '@/platform/ui/icons/iconSizes';

defineOptions({
  name: 'BaseFab',
  inheritAttrs: false,
});

const props = withDefaults(
  defineProps<{
    /** 图标名称 */
    icon: IconName;
    /** 是否显示 */
    visible?: boolean;
    /** 距底部距离；数值自动补齐 px。与 top 互斥，传 top 时忽略 bottom */
    bottom?: string | number;
    /** 距顶部距离；数值自动补齐 px。与 bottom 互斥，优先于 bottom */
    top?: string | number;
    /** 距左侧距离；数值自动补齐 px。显式指定时钉在左边、忽略 align 的左右选择 */
    left?: string | number;
    /** 距右侧距离；数值自动补齐 px。显式指定时钉在右边、忽略 align 的左右选择（默认靠右） */
    right?: string | number;
    /** 水平对齐方式：'center' (居中) | 'start' (靠左) | 'end' (靠右)；未显式传 left/right 时生效 */
    align?: 'center' | 'start' | 'end';
    /** 定位方式：'fixed' (相对于视口) | 'absolute' (相对于父级定位上下文) */
    position?: 'fixed' | 'absolute';
    /** 尺寸档位：'sm' (30px) | 'md' (36px) | 'lg' (42px) */
    size?: ComponentSize;
    /** 自定义图标尺寸（图标档位名 / px / CSS 长度），默认跟随 size 档位映射 */
    iconSize?: IconSizeValue;
    /** 图标描边粗细（档位名 thin/regular/bold 或数值），默认 regular */
    iconStroke?: IconStrokeValue;
    /** 自定义 z-index，支持数字或 Tailwind 类名，默认 'z-fab' */
    zIndex?: number | string;
    /** 提示框文案（接入 v-tooltip） */
    tooltip?: string;
    /** 提示框与按钮的间距（px），默认 12 */
    tooltipOffset?: number;
    /** 过渡动画名称 */
    transitionName?: string;
    /** 无障碍标签；未传时回退至 tooltip 或 '浮动操作按钮' */
    ariaLabel?: string;
    /** 是否叠加底部安全区（env(safe-area-inset-bottom)） */
    safeAreaInset?: boolean;
    /** Teleport 目标，默认 'body' */
    teleportTo?: string | HTMLElement;
    /** 禁用 Teleport，直接在本地定位 */
    disabledTeleport?: boolean;
  }>(),
  {
    visible: true,
    bottom: '2rem',
    top: undefined,
    align: 'end',
    position: 'fixed',
    size: 'md',
    iconSize: undefined,
    iconStroke: 'regular',
    zIndex: 'z-fab',
    tooltip: undefined,
    tooltipOffset: 12,
    transitionName: 'v-floating-bar-slide',
    ariaLabel: undefined,
    safeAreaInset: true,
    teleportTo: 'body',
    disabledTeleport: false,
  }
);

const emit = defineEmits<{
  (e: 'before-enter', el: Element): void;
  (e: 'enter', el: Element): void;
  (e: 'after-enter', el: Element): void;
  (e: 'before-leave', el: Element): void;
  (e: 'leave', el: Element): void;
  (e: 'after-leave', el: Element): void;
}>();

// left/right 与 top/bottom 的互斥规则分别落在 alignClass 与 positionStyle 两处、纯靠 !== undefined 约定。
// 同时传入时高优先级一方胜出、另一方被静默忽略（无类型层约束）——开发期显式提示，避免调用方踩空。
if (import.meta.env.DEV) {
  if (props.left !== undefined && props.right !== undefined) {
    logger.warn('BaseFab', 'left 与 right 同时传入：left 优先，right 被忽略');
  }
  if (props.top !== undefined && props.bottom !== undefined) {
    logger.warn('BaseFab', 'top 与 bottom 同时传入：top 优先，bottom 被忽略');
  }
}

const isViewActive = useKeepAliveVisible();

const isButtonVisible = computed(() => Boolean(props.visible && isViewActive.value));

const { positionClass, zIndexClass, positionStyle } = useFloatingPosition(props, 'BaseFab');

const alignClass = computed(() => {
  // 显式指定 left/right 时，仅用其对侧 auto 收边，距边距离交给 inline style 处理
  if (props.left !== undefined) return 'right-auto';
  if (props.right !== undefined) return 'left-auto';
  // 否则沿用 align 选择左右并保留 1rem 默认距边（向后兼容既有调用）
  if (props.align === 'start') return ALIGN_CLASS_MAP.start;
  if (props.align === 'center') return ALIGN_CLASS_MAP.center;
  return ALIGN_CLASS_MAP.end;
});

const FAB_SIZE_MAP: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-[1.9rem] w-[1.9rem]',
  md: 'h-[2.25rem] w-[2.25rem]',
  lg: 'h-[2.6rem] w-[2.6rem]',
};

const fabSizeClass = computed(() => FAB_SIZE_MAP[props.size]);

/** FAB 尺寸 → 图标档位映射：sm→lg(18) / md→xl(20) / lg→2xl(26) */
const ICON_SIZE_BY_FAB_SIZE: Record<ComponentSize, IconSizePreset> = { sm: 'lg', md: 'xl', lg: '2xl' };
// 映射表为必填全量 Record（ComponentSize 为 'sm'|'md'|'lg' 有限联合），索引结果非空，无需 ?? 兜底
const computedIconSize = computed<IconSizeValue>(() => props.iconSize ?? ICON_SIZE_BY_FAB_SIZE[props.size]);

const computedAriaLabel = computed(() => props.ariaLabel ?? props.tooltip ?? '浮动操作按钮');

const computedTooltip = computed<TooltipOptions | undefined>(() => {
  if (!props.tooltip) return undefined;
  return {
    content: props.tooltip,
    offset: props.tooltipOffset ?? 12,
  };
});
</script>

<style scoped lang="scss">
/* 常态 hover 过渡：只影响底色/边框/阴影，不与进出场动画抢 transition-property。
   进出场动画 v-floating-bar-slide-* 收拢于 assets/transitions.scss（与 BaseFloatingPill 共用） */
.base-fab {
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}
</style>
