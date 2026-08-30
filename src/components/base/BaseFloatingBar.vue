<template>
  <Teleport :to="teleportTo" :disabled="disabledTeleport">
    <Transition
      :name="transitionName"
      appear
      @before-enter="el => emit('before-enter', el)"
      @enter="el => emit('enter', el)"
      @after-enter="el => emit('after-enter', el)"
      @before-leave="el => emit('before-leave', el)"
      @leave="el => emit('leave', el)"
      @after-leave="el => emit('after-leave', el)"
    >
      <div
        v-if="isBarVisible"
        class="fixed flex items-center pointer-events-auto gap-sm py-sm px-md bg-bg-panel/95 backdrop-blur-xl border border-glass-border rounded-full shadow-floating box-border w-max max-w-[calc(100vw-2rem)] transition-[background-color,border-color,box-shadow,bottom] duration-slow ease-sidebar hover:ring-2 hover:ring-primary/70"
        :class="[alignClass, zIndexClass]"
        :style="outerStyle"
        role="toolbar"
        :aria-label="ariaLabel ?? '浮动操作栏'"
        tabindex="-1"
      >
        <slot :divider="FloatingBarDivider" />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onActivated, onDeactivated, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    visible?: boolean;
    /** 距底部距离；数值自动补齐 px */
    bottom?: string | number;
    /** 水平对齐方式：'center' (居中) | 'start' (靠左) | 'end' (靠右) */
    align?: 'center' | 'start' | 'end';
    /** 自定义 z-index，支持数字或 Tailwind 类名，默认 'z-fab' */
    zIndex?: number | string;
    /** 过渡动画名称 */
    transitionName?: string;
    /** 工具栏无障碍标签；role="toolbar" 时必填以声明功能意图 */
    ariaLabel?: string;
    /** 是否叠加底部安全区（env(safe-area-inset-bottom)），适配移动端/可折叠设备 */
    safeAreaInset?: boolean;
    /** Teleport 目标，默认 'body'；微前端/多窗口/Shadow DOM 等场景可指定挂载节点 */
    teleportTo?: string | HTMLElement;
    /** 禁用 Teleport，直接在本地渲染 */
    disabledTeleport?: boolean;
  }>(),
  {
    visible: true,
    bottom: '2rem',
    align: 'center',
    zIndex: 'z-fab',
    transitionName: 'v-floating-bar-slide',
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

const isBarVisible = computed(() => Boolean(props.visible && isViewActive.value));

const alignClass = computed(() => {
  switch (props.align) {
    case 'start':
      return 'left-4 right-auto';
    case 'end':
      return 'right-4 left-auto';
    case 'center':
    default:
      return 'left-0 right-0 mx-auto';
  }
});

const zIndexClass = computed(() => (typeof props.zIndex === 'string' ? props.zIndex : ''));

// 安全区与底部定位：将 bottom 直接作用于 fixed 容器
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
:global(.v-floating-bar-slide-enter-active),
:global(.v-floating-bar-slide-leave-active) {
  transition:
    opacity 0.2s cubic-bezier(0, 0, 0.2, 1),
    transform 0.2s cubic-bezier(0, 0, 0.2, 1);
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
