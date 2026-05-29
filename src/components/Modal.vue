<template>
  <Teleport to="body">
    <Transition
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
      enter-active-class="transition duration-200 ease-out"
      leave-active-class="transition duration-200 ease-in"
    >
      <div v-if="uiStore.modalShow" class="fixed inset-0 z-[2000] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-950/40 dark:bg-slate-950/60" @click="uiStore.modalShow = false"></div>

        <div class="modal-card w-80 p-6 relative z-10 animate-modal-in flex flex-col max-h-[80vh]">
          <h3 class="text-xs font-black mb-4 opacity-40 uppercase tracking-widest text-title shrink-0">
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

          <template v-else-if="uiStore.modalType === 'moveChord'">
            <div class="flex flex-col gap-2 mb-6 overflow-y-auto no-scrollbar pb-1">
              <button
                v-for="group in chordLabStore.groups"
                :key="group.id"
                @click="handleGroupSelect(group.id)"
                :disabled="isCurrentGroup(group.id)"
                class="px-4 py-3 rounded-lg text-sm font-bold text-left transition-all border flex items-center justify-between"
                :class="
                  isCurrentGroup(group.id)
                    ? 'opacity-40 cursor-not-allowed grayscale bg-[var(--bg-main)] border-[var(--control-border)]'
                    : uiStore.modalInput === group.id
                      ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-md'
                      : 'bg-[var(--bg-body)] text-[var(--text-body)] border-[var(--control-border)] hover:border-blue-400/50'
                "
              >
                <span>{{ group.name }}</span>
                <span v-if="isCurrentGroup(group.id)" class="text-[10px] opacity-60">当前分组</span>
                <span v-else-if="uiStore.modalInput === group.id" class="text-[14px]">✓</span>
              </button>
            </div>
          </template>

          <p v-else class="text-sm font-semibold mb-6 opacity-80 leading-relaxed text-body">
            确定执行此删除操作吗？组内所有和弦都将被清空。
          </p>

          <div class="flex gap-2 w-full shrink-0">
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
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import type { ModalActionType } from '@/constants';
import { useChordLabStore } from '@/stores/chordLabStore';
import { useUiStore } from '@/stores/uiStore';
import { useEventListener, useScrollLock } from '@vueuse/core';
import { nextTick, ref, watch } from 'vue';

const uiStore = useUiStore();
const chordLabStore = useChordLabStore();
const inputRef = ref<HTMLInputElement | null>(null);

// 🌟 核心修复 2：获取 Body 节点的滚动锁，彻底封杀弹窗时的“背景滚动流血”现象
const isBodyLocked = useScrollLock(document.body);

const isCurrentGroup = (groupId: string) => {
  return uiStore.activeTargetChord?.groupId === groupId;
};

const handleGroupSelect = (groupId: string) => {
  if (isCurrentGroup(groupId)) return;
  uiStore.modalInput = groupId;
};

useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape' && uiStore.modalShow) uiStore.modalShow = false;
});

watch(
  () => uiStore.modalShow,
  async isOpen => {
    isBodyLocked.value = isOpen; // 🌟 弹窗打开即加锁，关闭即解锁

    if (isOpen) {
      await nextTick();
      const inputFocusTypes: ModalActionType[] = ['createGroup', 'renameGroup'];
      if (inputFocusTypes.includes(uiStore.modalType)) {
        setTimeout(() => inputRef.value?.focus(), 50);
      }
    }
  },
  { immediate: true }
);
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
