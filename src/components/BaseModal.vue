<script setup lang="ts">
import useModalStore from '@/store/modal';
import { h, nextTick, watch } from 'vue';

const modalStore = useModalStore();

const renderContent = () => {
  const content = modalStore.options.message;
  if (!content) return null;
  if (typeof content === 'function') return content();
  if (typeof content === 'string') return h('span', { class: 'whitespace-pre-wrap' }, content);
  return content;
};

watch(
  () => modalStore.visible,
  async val => {
    if (val && modalStore.options.autoFocus) {
      await nextTick();
      const input = document.querySelector('.modal-content-area input') as HTMLElement;
      input?.focus();
    }
  }
);
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="modalStore.visible" class="fixed inset-0 z-[2000] flex items-center justify-center p-4">
        <!-- 遮罩触发 _triggerCancel -->
        <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" @click="modalStore._triggerCancel()"></div>

        <Transition name="modal-content" appear>
          <div
            class="glass-card w-[22rem] p-6 relative z-10 shadow-2xl bg-white dark:bg-slate-900 rounded-xl border border-white/10"
          >
            <h3 class="text-sm font-black mb-4 opacity-40 uppercase tracking-widest text-slate-500">
              {{ modalStore.options.title }}
            </h3>

            <div class="modal-content-area mb-6 text-sm text-slate-600 dark:text-slate-300">
              <component :is="renderContent" />
            </div>

            <div class="flex gap-2">
              <button
                @click="modalStore._triggerCancel()"
                class="flex-1 cursor-pointer py-3 rounded-xl font-bold text-xs bg-slate-100 dark:bg-slate-800 opacity-60 active:scale-95 transition-all"
              >
                取消
              </button>
              <button
                @click="modalStore._triggerConfirm()"
                :class="[
                  'flex-1 py-3 rounded-xl cursor-pointer font-bold text-xs text-white shadow-lg active:scale-95 transition-all',
                  modalStore.options.danger ? 'bg-red-500 shadow-red-500/30' : 'bg-blue-600 shadow-blue-500/30',
                ]"
              >
                {{ modalStore.options.confirmText }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-content-enter-active {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.modal-content-leave-active {
  transition: all 0.2s ease-in;
}
.modal-content-enter-from,
.modal-content-leave-to {
  opacity: 0;
  transform: scale(0.9) translateY(20px);
}
</style>
