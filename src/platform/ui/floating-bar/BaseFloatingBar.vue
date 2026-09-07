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
      <div
        v-auto-width
        v-bind="$attrs"
        v-if="isBarVisible"
        :aria-label="ariaLabel ?? '浮动操作栏'"
        :class="[positionClass, alignClass, zIndexClass, sizeClass]"
        :style="outerStyle"
        class="base-floating-bar pointer-events-auto box-border flex w-max max-w-[calc(100vw-2rem)] items-center rounded-full border border-glass-border bg-surface-panel/95 shadow-floating backdrop-blur-xl hover:ring-2 hover:ring-primary/70"
        role="toolbar"
        tabindex="-1"
      >
        <slot :divider="FloatingBarDivider" />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onActivated, onDeactivated, ref } from 'vue';

defineOptions({
  name: 'BaseFloatingBar',
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

// 初始为 true：保证首次挂载（含 KeepAlive 初始激活）即可见；
// 切走时 onDeactivated 置 false 隐藏，切回时 onActivated 置 true 恢复。
const isViewActive = ref(true);

onActivated(() => {
  isViewActive.value = true;
});

onDeactivated(() => {
  isViewActive.value = false;
});

const isBarVisible = computed(() => Boolean(props.visible && isViewActive.value));

const positionClass = computed(() => (props.position === 'absolute' ? 'absolute' : 'fixed'));

const ALIGN_CLASS_MAP: Record<'start' | 'end' | 'center', string> = {
  start: 'right-auto left-4',
  end: 'right-4 left-auto',
  center: 'right-0 left-0 mx-auto',
};

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

const zIndexClass = computed(() => (typeof props.zIndex === 'string' ? props.zIndex : ''));

// 安全区与底部定位：将 bottom 直接作用于定位容器
const outerStyle = computed(() => {
  const b = typeof props.bottom === 'number' ? `${props.bottom}px` : props.bottom;
  const style: Record<string, string | number> = {
    bottom: props.safeAreaInset ? `calc(${b} + env(safe-area-inset-bottom, 0px))` : b,
  };
  if (typeof props.zIndex === 'number') {
    style['zIndex'] = props.zIndex;
  }
  return style;
});

// 纯静态分隔线组件，避免在 setup 渲染函数中重复创建闭包
const FloatingBarDivider = defineComponent({
  name: 'FloatingBarDivider',
  render() {
    return h('div', {
      'class': 'w-0.5 h-4 bg-border-base opacity-60 shrink-0 rounded-full',
      'role': 'separator',
      'aria-orientation': 'vertical',
    });
  },
});
</script>

<style scoped>
/* 常态 hover 过渡：只影响底色/边框/阴影，不与进出场动画抢 transition-property */
.base-floating-bar {
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

/* 进出场动画：!important 确保在 enter/leave 阶段强制覆盖 transition-property，
   否则容器任意 transition-* 工具类都会把 opacity/transform 排除导致动画瞬时完成 */
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
