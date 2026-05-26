<template>
  <div class="fixed top-6 left-1/2 -translate-x-1/2 z-[3000] flex flex-col gap-2 items-center pointer-events-none">
    <TransitionGroup
      enter-from-class="translate-y-[-20px] opacity-0"
      leave-to-class="translate-y-[-20px] opacity-0"
      enter-active-class="toast-transition"
      leave-active-class="toast-transition"
    >
      <div
        v-for="toast in uiStore.toasts"
        :key="toast.id"
        class="px-5 py-2.5 rounded-full bg-slate-950 dark:bg-slate-100 text-white dark:text-slate-950 font-bold shadow-2xl flex items-center gap-3 text-xs pointer-events-auto"
      >
        <span>{{ toast.msg }}</span>

        <button v-if="toast.canUndo" @click="uiStore.undo()" class="btn-toast-undo font-bold underline text-[10px]">
          撤回
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { useUiStore } from '@/stores/uiStore';

const uiStore = useUiStore();
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

// 🌟 核心优化 1：动画时序集权，接入设计系统的标准标准缓动
.toast-transition {
  transition: all 0.25s @bezier-standard;
}

// 🌟 核心优化 2：撤回按钮颜色完美连通全站皇家蓝血脉
.btn-toast-undo {
  color: @brand-primary;
  transition: opacity 0.15s @bezier-standard;

  &:hover {
    opacity: 0.8;
  }
  &:active {
    opacity: 0.6;
  }
}
</style>
