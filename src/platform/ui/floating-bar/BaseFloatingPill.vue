<template>
  <Teleport :disabled="disabledTeleport" :to="teleportTo">
    <!-- data-ring-occluder：与 BaseFab 同因 —— 浮动胶囊也是**内容层**的覆盖元件（默认 z-fab 40，
         远低于聚焦环 overlay 的浮层基准层），环挂在 body 顶层、层号越不过它，不声明就会被环画在
         上面（穿帮）。见 focusRingOverlay 的「遮挡物策略」。标在容器上不影响胶囊内按钮自己聚焦：
         环只扫目标的**同层兄弟**，目标所在的那条祖先链（含本胶囊）天然排除在扫描之外。 -->
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
      <div
        v-auto-width
        v-bind="$attrs"
        v-if="isBarVisible"
        :aria-label="ariaLabel ?? '浮动胶囊'"
        :class="[positionClass, alignClass, zIndexClass, sizeClass]"
        :style="positionStyle"
        data-ring-occluder
        class="base-floating-pill pointer-events-auto flex w-max max-w-[calc(100vw-2rem)] items-center rounded-full border border-glass-border bg-surface-panel shadow-floating hover:ring-2 hover:ring-tint-primary-30"
        role="toolbar"
        tabindex="-1"
      >
        <slot />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useFloatingPosition } from './floatingPosition';
import { ALIGN_CLASS_MAP } from './floatingPositions';
import { useKeepAliveVisible } from './useKeepAliveVisible';

defineOptions({
  name: 'BaseFloatingPill',
  inheritAttrs: false,
});

const props = withDefaults(
  defineProps<{
    /** 是否显示浮动栏（还需组件未被 KeepAlive 停用） */
    visible?: boolean;
    /** 距底部距离；数值自动补齐 px */
    bottom?: string | number;
    /** 水平对齐方式：'center' (居中) | 'start' (靠左) | 'end' (靠右) */
    align?: 'center' | 'start' | 'end';
    /** 定位方式：'fixed' (相对于视口) | 'absolute' (相对于父级定位上下文) */
    position?: 'fixed' | 'absolute';
    /** 自定义 z-index，支持数字或 Tailwind 类名，默认 'z-fab' */
    zIndex?: number | string;
    /** 过渡动画名称 */
    transitionName?: string;
    /** 工具栏无障碍标签；role="toolbar" 时必填以声明功能意图 */
    ariaLabel?: string;
    /** 是否叠加底部安全区（env(safe-area-inset-bottom)），适配移动端/可折叠设备 */
    safeAreaInset?: boolean;
    /** 尺寸形态：'md' 常规操作栏（默认）| 'sm' 紧凑胶囊（内嵌小控件场景，如缩放控制器） */
    size?: 'sm' | 'md';
    /** Teleport 目标，默认 'body'；微前端/多窗口/Shadow DOM 等场景可指定挂载节点 */
    teleportTo?: string | HTMLElement;
    /** 禁用 Teleport，直接在本地渲染 */
    disabledTeleport?: boolean;
  }>(),
  {
    visible: true,
    bottom: '2rem',
    align: 'center',
    position: 'fixed',
    zIndex: 'z-fab',
    transitionName: 'v-floating-bar-slide',
    safeAreaInset: true,
    size: 'md',
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

const isViewActive = useKeepAliveVisible();

const isBarVisible = computed(() => Boolean(props.visible && isViewActive.value));

const { positionClass, zIndexClass, positionStyle } = useFloatingPosition(props, 'BaseFloatingPill');

const alignClass = computed(() =>
  props.align ? (ALIGN_CLASS_MAP[props.align] ?? ALIGN_CLASS_MAP.center) : ALIGN_CLASS_MAP.center
);

/** 尺寸形态映射：md 常规操作栏 / sm 紧凑胶囊。sm 的水平内边距与垂直对称（px-1.5），
 * 保证内容为单个方形控件（如图标开关）时整体呈正圆形，而非左右拉长的胶囊 */
const SIZE_CLASS_MAP: Record<'sm' | 'md', string> = {
  sm: 'gap-xs px-1.5 py-1.5',
  md: 'gap-sm px-md py-sm',
};
const sizeClass = computed(() => SIZE_CLASS_MAP[props.size] ?? SIZE_CLASS_MAP.md);
</script>

<style scoped lang="scss">
/* 常态 hover 过渡：只影响底色/边框/阴影，不与进出场动画抢 transition-property。
   进出场动画 v-floating-bar-slide-* 收拢于 assets/transitions.scss（与 BaseFab 共用） */
.base-floating-pill {
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}
</style>
