<template>
  <Teleport :disabled="disabledTeleport" :to="teleportTo">
    <Transition
      :name="transitionName"
      @after-enter="el => emit('after-enter', el)"
      @after-leave="el => emit('after-leave', el)"
      @before-enter="el => emit('before-enter', el)"
      @before-leave="el => emit('before-leave', el)"
      @enter="el => emit('enter', el)"
      @leave="el => emit('leave', el)"
      appear
    >
      <button
        v-wave
        v-bind="$attrs"
        v-if="isButtonVisible"
        v-tooltip.top="computedTooltip"
        :aria-label="computedAriaLabel"
        :class="[positionClass, alignClass, zIndexClass, fabSizeClass]"
        :style="outerStyle"
        class="base-fab bg-bg-panel/95 border-glass-border shadow-floating hover:ring-primary/70 pointer-events-auto box-border flex aspect-square shrink-0 cursor-pointer items-center justify-center rounded-full border backdrop-blur-xl select-none hover:ring-2 active:scale-95"
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
import { computed, onActivated, onDeactivated, ref } from 'vue';

import type { TooltipOptions } from '@/platform/directives/vTooltip';
import type { ComponentSize } from '@/platform/types';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
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

// 初始为 true：保证首次挂载（含 KeepAlive 初始激活）即可见；
// 切走时 onDeactivated 置 false 隐藏，切回时 onActivated 置 true 恢复。
const isViewActive = ref(true);

onActivated(() => {
  isViewActive.value = true;
});

onDeactivated(() => {
  isViewActive.value = false;
});

const isButtonVisible = computed(() => Boolean(props.visible && isViewActive.value));

const positionClass = computed(() => (props.position === 'absolute' ? 'absolute' : 'fixed'));

const ALIGN_CLASS_MAP: Record<'start' | 'end' | 'center', string> = {
  start: 'left-4 right-auto',
  end: 'right-4 left-auto',
  center: 'left-0 right-0 mx-auto',
};

const alignClass = computed(() => {
  // 显式指定 left/right 时，仅用其对侧 auto 收边，距边距离交给 inline style 处理
  if (props.left !== undefined) return 'right-auto';
  if (props.right !== undefined) return 'left-auto';
  // 否则沿用 align 选择左右并保留 1rem 默认距边（向后兼容既有调用）
  if (props.align === 'start') return ALIGN_CLASS_MAP.start;
  if (props.align === 'center') return ALIGN_CLASS_MAP.center;
  return ALIGN_CLASS_MAP.end;
});

const zIndexClass = computed(() => (typeof props.zIndex === 'string' ? props.zIndex : ''));

const FAB_SIZE_MAP: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-[1.9rem] w-[1.9rem]',
  md: 'h-[2.25rem] w-[2.25rem]',
  lg: 'h-[2.6rem] w-[2.6rem]',
};

const fabSizeClass = computed(() => FAB_SIZE_MAP[props.size] ?? FAB_SIZE_MAP.md);

/** FAB 尺寸 → 图标档位映射：sm→lg(18) / md→xl(20) / lg→2xl(26) */
const ICON_SIZE_BY_FAB_SIZE: Record<ComponentSize, IconSizePreset> = { sm: 'lg', md: 'xl', lg: '2xl' };
const computedIconSize = computed<IconSizeValue>(() => props.iconSize ?? ICON_SIZE_BY_FAB_SIZE[props.size] ?? 'xl');

const computedAriaLabel = computed(() => props.ariaLabel ?? props.tooltip ?? '浮动操作按钮');

const computedTooltip = computed<TooltipOptions | undefined>(() => {
  if (!props.tooltip) return undefined;
  return {
    content: props.tooltip,
    offset: props.tooltipOffset ?? 12,
  };
});

// 安全区与边定位：垂直优先 top，否则 bottom（叠加底部安全区）；水平优先 left/right，否则由 alignClass 决定（默认靠右 1rem）
const outerStyle = computed(() => {
  const style: Record<string, string | number> = {};
  if (props.top !== undefined) {
    const t = typeof props.top === 'number' ? `${props.top}px` : props.top;
    style['top'] = t;
  } else {
    const b = typeof props.bottom === 'number' ? `${props.bottom}px` : props.bottom;
    style['bottom'] = props.safeAreaInset ? `calc(${b} + env(safe-area-inset-bottom, 0px))` : b;
  }
  if (props.left !== undefined) {
    const l = typeof props.left === 'number' ? `${props.left}px` : props.left;
    style['left'] = l;
  } else if (props.right !== undefined) {
    const r = typeof props.right === 'number' ? `${props.right}px` : props.right;
    style['right'] = r;
  }
  if (typeof props.zIndex === 'number') {
    style['zIndex'] = props.zIndex;
  }
  return style;
});
</script>

<style scoped>
/* 常态 hover 过渡：只影响底色/边框/阴影，不与进出场动画抢 transition-property */
.base-fab {
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

/* 进出场动画：!important 确保在 enter/leave 阶段强制覆盖 transition-property */
:global(.v-floating-bar-slide-enter-active),
:global(.v-floating-bar-slide-leave-active) {
  transition:
    opacity 0.25s cubic-bezier(0, 0, 0.2, 1),
    transform 0.25s cubic-bezier(0, 0, 0.2, 1) !important;
}

:global(.v-floating-bar-slide-enter-from),
:global(.v-floating-bar-slide-leave-to) {
  opacity: 0;
  transform: translateY(16px) scale(0.96);
}

:global(.v-floating-bar-slide-enter-to),
:global(.v-floating-bar-slide-leave-from) {
  opacity: 1;
  transform: translateY(0) scale(1);
}
</style>
