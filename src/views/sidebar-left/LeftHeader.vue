<template>
  <div
    class="p-4 px-5 h-[76px] border-b border-[var(--control-border)] flex items-center justify-between relative"
    :style="{ minWidth: LEFT_SIDEBAR_WIDTH_PIXEL }"
  >
    <h1 class="text-lg font-black tracking-tight uppercase text-title">Fret Logic</h1>

    <GlobalTooltip placement="bottom" content="新建分组">
      <button
        @click="openCreateModal"
        class="w-7 h-7 rounded-lg text-[var(--color-primary)] flex items-center justify-center active:scale-95 transition-transform header-add-btn"
      >
        <Plus :size="18" :stroke-width="3" />
      </button>
    </GlobalTooltip>
  </div>

  <BaseModal v-model:visible="isCreateModalOpen" title="新建分组" @confirm="handleCreateGroup">
    <div class="relative w-full group flex items-center">
      <input
        v-model="groupNameInput"
        ref="inputRef"
        @keyup.enter="handleCreateGroup"
        type="text"
        class="modal-input-field w-full text-sm font-bold pr-9 cursor-pointer"
        placeholder="请输入分组名称..."
      />

      <button
        v-if="groupNameInput"
        @click="
          groupNameInput = '';
          inputRef?.focus();
        "
        class="h-4 w-4 absolute right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 text-[var(--text-disabled)] hover:text-[var(--color-danger)] flex items-center justify-center hover:text-white bg-[var(--bg-main)] hover:bg-[var(--color-danger)] rounded-full active:scale-90 transition-all"
        title="清空内容"
      >
        <X :size="14" stroke-width="3" />
      </button>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import BaseModal from '@/components/BaseModal.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { LEFT_SIDEBAR_WIDTH_PIXEL } from '@/constants';
import { useGithubSyncService } from '@/services/useGithubSyncService';
import { useChordStore } from '@/stores/chordStore';
import { useUiStore } from '@/stores/uiStore';
import { Plus, X } from '@lucide/vue';
import { nextTick, ref } from 'vue';

const uiStore = useUiStore();
const chordStore = useChordStore();
const { triggerGlobalSync } = useGithubSyncService();

const isCreateModalOpen = ref(false);
const groupNameInput = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

const openCreateModal = async () => {
  groupNameInput.value = '';
  isCreateModalOpen.value = true;
  await nextTick();
  setTimeout(() => inputRef.value?.focus(), 50);
};

const handleCreateGroup = () => {
  const val = groupNameInput.value.trim();

  if (!val) {
    uiStore.showToast('❌ 确认失败：请输入有效内容');
    return;
  }
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

  isCreateModalOpen.value = false;
  uiStore.showToast('✅ 操作成功完成');

  triggerGlobalSync();
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.less';
.header-add-btn {
  background-color: color-mix(in srgb, @primary, transparent 90%);
  border: @border-solid-light;
  transition: @transition-fast;
  &:hover {
    background-color: color-mix(in srgb, @primary, transparent 80%);
    border-color: color-mix(in srgb, @primary, transparent 50%);
  }
}

.modal-input-field {
  .mixin-input-base();
}
</style>
