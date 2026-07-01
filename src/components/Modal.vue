<template>
  <Teleport to="body">
    <Transition
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
      enter-active-class="transition duration-200 ease-out"
      leave-active-class="transition duration-200 ease-in"
    >
      <div v-if="modal.modalShow.value" class="fixed inset-0 z-[2000] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-950/40 dark:bg-slate-950/60" @click="modal.closeModal()"></div>

        <div class="modal-card w-80 p-6 relative z-10 animate-modal-in flex flex-col max-h-[80vh]">
          <h3 class="text-xs font-black mb-4 opacity-40 uppercase tracking-widest text-title shrink-0">
            {{ modal.modalTitle.value }}
          </h3>

          <template v-if="modal.modalType.value === 'createGroup' || modal.modalType.value === 'renameGroup'">
            <div class="relative w-full mb-4 group flex items-center">
              <input
                v-model="modal.modalInput.value"
                ref="inputRef"
                @keyup.enter="handleLocalConfirm"
                type="text"
                class="modal-input-field w-full text-sm font-bold pr-9"
                placeholder="请输入..."
              />
              <button
                v-if="modal.modalInput.value"
                @click="
                  modal.modalInput.value = '';
                  inputRef?.focus();
                "
                class="h-4 w-4 absolute right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 text-[var(--text-disabled)] hover:text-[var(--color-danger)] flex items-center justify-center hover:text-white bg-[var(--bg-main)] hover:bg-[var(--color-danger)] rounded-full active:scale-90 transition-all"
                title="清空内容"
              >
                <X :size="14" stroke-width="3" />
              </button>
            </div>
          </template>

          <template v-else-if="modal.modalType.value === 'moveChord'">
            <div class="flex flex-col gap-2 mb-6 overflow-y-auto no-scrollbar pb-1">
              <button
                v-for="group in chordStore.groups"
                :key="group.id"
                @click="handleGroupSelect(group.id)"
                :disabled="isCurrentGroup(group.id)"
                class="px-4 py-3 rounded-lg text-sm font-bold text-left transition-all border flex items-center justify-between"
                :class="
                  isCurrentGroup(group.id)
                    ? 'opacity-40 cursor-not-allowed grayscale bg-[var(--bg-main)] border-[var(--control-border)]'
                    : modal.modalInput.value === group.id
                      ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-md'
                      : 'bg-[var(--bg-body)] text-[var(--text-body)] border-[var(--control-border)] hover:border-blue-400/50'
                "
              >
                <span>{{ group.name }}</span>
                <span v-if="isCurrentGroup(group.id)" class="text-[11px] opacity-60 font-black uppercase tracking-wider"
                  >当前分组</span
                >
              </button>
            </div>
          </template>

          <p v-else class="text-sm font-semibold mb-6 opacity-80 leading-relaxed text-body">
            确定要执行此删除操作吗？删除后组内的所有和弦资产都将同步清空，且不可恢复。
          </p>

          <div class="flex gap-2 w-full shrink-0">
            <ActionButton @click="modal.closeModal()">取消</ActionButton>
            <ActionButton
              @click="handleLocalConfirm"
              :danger="modal.modalType.value === 'deleteGroup'"
              :primary="modal.modalType.value !== 'deleteGroup'"
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
import { useModal } from '@/composables/useModal';
import { useChordStore } from '@/stores/chordStore';
import { useEditorStore } from '@/stores/editorStore';
import { useUiStore } from '@/stores/uiStore';
import { ModalActionType } from '@/types';
import { X } from '@lucide/vue';
import { useEventListener, useScrollLock } from '@vueuse/core';
import { nextTick, ref, watch } from 'vue';

const editorStore = useEditorStore();
const uiStore = useUiStore();
const chordStore = useChordStore();
const modal = useModal();
const inputRef = ref<HTMLInputElement | null>(null);

const isBodyLocked = useScrollLock(document.body);

const isCurrentGroup = (groupId: string) => {
  return modal.activeTargetChord.value?.groupId === groupId;
};

const handleGroupSelect = (groupId: string) => {
  if (isCurrentGroup(groupId)) return;
  modal.modalInput.value = groupId;
};

const handleLocalConfirm = () => {
  const val = modal.modalInput.value.trim();

  if (['createGroup', 'renameGroup', 'moveChord'].includes(modal.modalType.value) && !val) {
    uiStore.showToast('❌ 确认失败：请输入或选择有效内容');
    return;
  }

  if (modal.modalType.value === 'createGroup') {
    if (chordStore.groups.some(g => g.name === val)) {
      uiStore.showToast('⚠️ 创建失败：该分组名称已存在');
      return;
    }
    const newId = 'g_' + crypto.randomUUID().slice(0, 8);
    chordStore.groups.forEach(g => {
      g.collapsed = true;
    });
    chordStore.groups.push({ id: newId, name: val, collapsed: false });
    chordStore.selectedGroupId = newId;
  } else if (modal.modalType.value === 'renameGroup' && modal.activeTargetGroup.value) {
    modal.activeTargetGroup.value.name = val;
  } else if (modal.modalType.value === 'deleteGroup' && modal.activeTargetGroup.value) {
    const targetGid = modal.activeTargetGroup.value.id;

    if (editorStore.editingId) {
      const editingChord = chordStore.savedChordsList.find(c => c.id === editorStore.editingId);
      if (editingChord && editingChord.groupId === targetGid) {
        editorStore.resetEditor();
      }
    }
    chordStore.overwriteChords(chordStore.savedChordsList.filter(c => c.groupId !== targetGid));
    chordStore.overwriteGroups(chordStore.groups.filter(g => g.id !== targetGid));

    if (chordStore.selectedGroupId === targetGid) {
      chordStore.selectedGroupId = chordStore.groups[0]?.id || null;
    }
    uiStore.clearUndoToasts();
  } else if (modal.modalType.value === 'moveChord' && modal.activeTargetChord.value) {
    const chordIdx = chordStore.savedChordsList.findIndex(c => c.id === modal.activeTargetChord.value!.id);
    if (chordIdx !== -1) {
      chordStore.savedChordsList[chordIdx].groupId = val;
      uiStore.clearUndoToasts();
    }
  }

  modal.closeModal();
  uiStore.showToast('✅ 操作成功完成');
};

useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape' && modal.modalShow.value) modal.closeModal();
});

watch(
  () => modal.modalShow.value,
  async isOpen => {
    isBodyLocked.value = isOpen;
    if (isOpen) {
      await nextTick();
      const inputFocusTypes: ModalActionType[] = ['createGroup', 'renameGroup'];
      if (inputFocusTypes.includes(modal.modalType.value)) {
        setTimeout(() => inputRef.value?.focus(), 50);
      }
    }
  },
  { immediate: true }
);
</script>

<style scoped lang="less">
@import '@/assets/tokens.less';
.modal-card {
  .mixin-floating-layer();
}
.modal-input-field {
  .mixin-input-base();
}
</style>
