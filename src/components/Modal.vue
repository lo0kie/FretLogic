<template>
  <div class="fixed inset-0 z-[2000] flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-slate-950/40 dark:bg-slate-950/60" @click="uiStore.modalShow = false"></div>

    <div class="modal-card w-80 p-6 relative z-10 animate-modal-in">
      <h3 class="text-xs font-black mb-4 opacity-40 uppercase tracking-widest text-title">
        {{ uiStore.modalTitle }}
      </h3>

      <template v-if="uiStore.modalType === 'createGroup' || uiStore.modalType === 'renameGroup'">
        <input
          v-model="uiStore.modalInput"
          ref="inputRef"
          @keyup.enter="uiStore.handleModalConfirm"
          type="text"
          class="modal-input-field w-full text-sm font-bold mb-4"
          placeholder="请输入..."
        />
      </template>

      <p v-else class="text-sm font-semibold mb-6 opacity-80 leading-relaxed text-body">
        确定执行此删除操作吗？组内所有和弦都将被清空。
      </p>

      <div class="flex gap-2 w-full">
        <ActionButton @click="uiStore.modalShow = false"> 取消 </ActionButton>
        <ActionButton
          @click="uiStore.handleModalConfirm"
          :danger="uiStore.modalType === 'deleteGroup'"
          :primary="uiStore.modalType !== 'deleteGroup'"
        >
          确认
        </ActionButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import type { ModalActionType } from '@/constants';
import { useUiStore } from '@/stores/uiStore';
import { useEventListener } from '@vueuse/core';
import { onMounted, ref } from 'vue';

const uiStore = useUiStore();
const inputRef = ref<HTMLInputElement | null>(null);

useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape' && uiStore.modalShow) uiStore.modalShow = false;
});

onMounted(() => {
  // 🌟 优化：显式指定数组属于 ModalActionType 类型，消除 TS includes 类型推导隐患
  const inputFocusTypes: ModalActionType[] = ['createGroup', 'renameGroup'];

  if (inputFocusTypes.includes(uiStore.modalType)) {
    setTimeout(() => inputRef.value?.focus(), 50);
  }
});
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.modal-card {
  .mixin-floating-layer();
}

.modal-input-field {
  .mixin-input-base();
}
</style>
