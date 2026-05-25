<template>
  <div class="relative inline-block w-full" @mouseenter="show = true" @mouseleave="show = false">
    <slot></slot>

    <Transition name="tooltip">
      <div
        v-if="show && content"
        class="absolute whitespace-nowrap px-3 py-1.5 bg-slate-900/95 dark:bg-slate-100/95 text-white dark:text-slate-900 font-black rounded-lg z-[100] text-xs shadow-xl border border-white/10 dark:border-black/5 pointer-events-none"
        :class="[
          placement === 'top' ? 'bottom-full left-1/2 -translate-x-1/2 mb-2' : '',
          placement === 'bottom' ? 'top-full left-1/2 -translate-x-1/2 mt-2' : '',
          placement === 'left' ? 'right-full top-50% -translate-y-50% mr-2' : '',
          placement === 'right' ? 'left-full top-50% -translate-y-50% ml-2' : '',
        ]"
      >
        {{ content }}
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

// 按照组件库级别设计标准的 Props 接口
withDefaults(
  defineProps<{
    content?: string; // 🌟 悬浮显示的提示文本
    placement?: 'top' | 'bottom' | 'left' | 'right'; // 弹出方向
  }>(),
  {
    placement: 'top',
  }
);

const show = ref(false);
</script>

<style scoped lang="less">
.tooltip- {
  &enter-active {
    transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  &leave-active {
    transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  }
  &enter-from,
  &leave-to {
    opacity: 0;
  }
}
</style>
