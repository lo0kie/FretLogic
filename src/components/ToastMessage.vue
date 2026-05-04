<script setup lang="ts">
import useToastStore from '@/store/toast';

const toastStore = useToastStore();

// 定义撤回事件，交给父组件处理具体的撤回逻辑
const emit = defineEmits(['undo']);

const handleUndo = (targetId: any, toastId: number) => {
  emit('undo', targetId);
  toastStore.removeToast(toastId);
};
</script>

<template>
  <div class="fixed top-6 left-1/2 -translate-x-1/2 z-[3000] flex flex-col gap-2 items-center pointer-events-none">
    <transition-group name="toast">
      <div
        v-for="toast in toastStore.toasts"
        :key="toast.id"
        class="px-5 py-2.5 rounded-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold shadow-2xl backdrop-blur-md flex items-center gap-3 text-sm pointer-events-auto"
      >
        <span>{{ toast.msg }}</span>

        <button
          v-if="toast.canUndo"
          @click="handleUndo(toast.targetId, toast.id)"
          class="text-blue-500 hover:text-blue-400 underline font-medium"
        >
          撤回
        </button>
      </div>
    </transition-group>
  </div>
</template>

<style lang="less" scoped>
/* 动画逻辑 */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(-20px) scale(0.9);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-20px) scale(0.9);
}
</style>
