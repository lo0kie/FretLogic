<template>
  <div class="fixed top-6 left-1/2 -translate-x-1/2 z-[3000] flex flex-col gap-2 items-center pointer-events-none">
    <TransitionGroup
      enter-from-class="translate-y-[-20px] opacity-0"
      leave-to-class="translate-y-[-20px] opacity-0"
      enter-active-class="transition duration-300 ease-out"
      leave-active-class="transition duration-300 ease-in"
    >
      <div
        v-for="toast in uiStore.toasts"
        :key="toast.id"
        class="px-5 py-2.5 rounded-full bg-slate-950 dark:bg-slate-100 text-white dark:text-slate-950 font-bold shadow-2xl flex items-center gap-3 text-xs pointer-events-auto"
      >
        <span class="toast-message-text">{{ toast.msg }}</span>

        <button v-if="toast.canUndo" @click="uiStore.undo()" class="text-primary font-bold underline text-[10px]">
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

.toast-message-text {
  // 浅色模式下采用 bg-slate-950，字呈亮白；深色模式下采用 bg-slate-100，字反转为深灰黑
  color: #ffffff;
}

.dark {
  .toast-message-text {
    color: #0f172a;
  }
}
</style>
