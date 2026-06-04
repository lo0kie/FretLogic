<template>
  <div class="fixed top-6 right-6 z-[3000] flex flex-col gap-2 items-end pointer-events-none">
    <TransitionGroup name="toast-transition">
      <div
        v-for="toast in uiStore.toasts"
        :key="toast.id"
        class="px-4 py-2.5 rounded-xl font-bold shadow-2xl flex items-center gap-3 text-xs pointer-events-auto transition-colors duration-300"
        :class="getToastThemeClass(toast.type)"
      >
        <Loader2 v-if="toast.type === 'loading'" class="w-4 h-4 animate-spin opacity-80" />

        <span>{{ toast.msg }}</span>

        <button
          v-if="toast.canUndo"
          @click="handleLocalUndo"
          class="btn-toast-undo font-bold underline text-xs ml-1 opacity-90 hover:opacity-100"
        >
          撤回
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { useUiStore } from '@/stores/uiStore';
import type { ToastType } from '@/types';
import { Loader2 } from '@lucide/vue';

const uiStore = useUiStore();

const handleLocalUndo = () => {
  uiStore.executeUndoRestore();
  uiStore.showToast('↩️ 刚刚删除的和弦已被完美恢复', false, 'success');
};

const getToastThemeClass = (type: ToastType) => {
  switch (type) {
    case 'success':
      return 'bg-emerald-500 text-white dark:bg-emerald-400 dark:text-slate-900';
    case 'error':
      return 'bg-red-500 text-white dark:bg-red-400 dark:text-slate-900';
    case 'loading':
      return 'bg-blue-600 text-white dark:bg-blue-500 dark:text-slate-900';
    default:
      return 'bg-slate-950 dark:bg-slate-100 text-white dark:text-slate-950';
  }
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.less';
.btn-toast-undo {
  transition: opacity @duration-fast @bezier-standard;
  &:active {
    opacity: 0.6;
  }
}
</style>
