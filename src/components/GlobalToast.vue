<template>
  <div class="fixed top-6 right-6 z-[3000] flex flex-col gap-2 items-end pointer-events-none">
    <TransitionGroup
      enter-from-class="translate-x-[20px] opacity-0"
      leave-to-class="translate-x-[20px] opacity-0"
      enter-active-class="toast-transition"
      leave-active-class="toast-transition"
    >
      <div
        v-for="toast in uiStore.toasts"
        :key="toast.id"
        class="px-4 py-2.5 rounded-xl bg-slate-950 dark:bg-slate-100 text-white dark:text-slate-950 font-bold shadow-2xl flex items-center gap-3 text-xs pointer-events-auto"
      >
        <span>{{ toast.msg }}</span>

        <button v-if="toast.canUndo" @click="handleLocalUndo" class="btn-toast-undo font-bold underline text-xs">
          撤回
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { useUiStore } from '@/stores/uiStore';

const uiStore = useUiStore();

const handleLocalUndo = () => {
  uiStore.undo();
  uiStore.showToast('↩️ 刚才删除的和弦已被完美恢复');
};
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

// 🌟 核心优化 1：继续沿用系统级 @bezier-standard 贝塞尔阻尼
.toast-transition {
  transition: all 0.25s @bezier-standard;
}

// 🌟 核心优化 2：撤回高亮蓝色连接
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
