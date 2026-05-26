<template>
  <div class="fixed inset-0 z-[2000] flex items-center justify-center p-4">
    <div
      class="modal-overlay absolute inset-0 bg-slate-950/40 dark:bg-slate-950/60"
      @click="uiStore.modalShow = false"
    ></div>

    <div
      class="modal-card bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-80 p-6 relative z-10 shadow-2xl control-bordered"
    >
      <h3 class="text-xs font-black mb-4 opacity-40 uppercase tracking-widest">{{ uiStore.modalTitle }}</h3>

      <template v-if="uiStore.modalType === 'createGroup' || uiStore.modalType === 'renameGroup'">
        <input
          v-model="uiStore.modalInput"
          ref="inputRef"
          @keyup.enter="uiStore.handleModalConfirm"
          type="text"
          class="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-2xl px-4 py-3 text-sm font-bold outline-none text-slate-900 dark:text-white focus:border-blue-500 transition-all mb-4 control-bordered"
          placeholder="请输入..."
        />
      </template>

      <p v-else class="text-sm font-semibold mb-6 opacity-80 leading-relaxed">
        确定执行此删除操作吗？组内所有和弦都将被清空。
      </p>

      <div class="flex gap-2">
        <button
          @click="uiStore.modalShow = false"
          class="flex-1 h-12 rounded-xl font-bold text-xs bg-slate-100 dark:bg-slate-800 opacity-70 control-bordered btn-action"
        >
          取消
        </button>
        <button
          @click="uiStore.handleModalConfirm"
          :class="[
            'flex-1 h-12 rounded-xl font-bold text-xs text-white shadow-lg control-bordered btn-action',
            uiStore.modalType === 'deleteGroup'
              ? 'bg-red-500 shadow-red-500/20 hover:bg-red-600'
              : 'bg-blue-600 shadow-blue-500/20 hover:bg-blue-700',
          ]"
        >
          确认
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useUiStore } from '@/stores/uiStore';
import { onMounted, ref } from 'vue';

const uiStore = useUiStore();

const inputRef = ref<HTMLInputElement | null>(null);

onMounted(() => {
  // 当弹窗激活且为输入框模式时，自动获取焦点提升无鼠标操作体验
  if (['createGroup', 'renameGroup'].includes(uiStore.modalType)) {
    inputRef.value?.focus();
  }
});
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.modal-card {
  .mixin-floating-layer(); // 替换掉你在 HTML 写的控制边框和深色底色
}
</style>
