<template>
  <div
    class="panel-left h-[calc(100%-24px)] flex flex-col shrink-0 relative rounded-xl z-10 box-border"
    :class="{ 'is-open': uiStore.isLeftOpen }"
  >
    <div
      class="p-4 px-5 h-[76px] border-b border-[var(--control-border)] flex items-center justify-between shrink-0 relative"
      :style="{ minWidth: LEFT_SIDEBAR_WIDTH_PIXEL }"
    >
      <h1 class="text-lg font-black tracking-tight uppercase text-title">Fret Logic</h1>

      <GlobalTooltip placement="bottom" content="新建分组">
        <button
          @click="openCreate"
          class="w-7 h-7 rounded-lg text-[var(--color-primary)] flex items-center justify-center active:scale-95 transition-transform header-add-btn"
        >
          <Plus :size="18" :stroke-width="3" />
        </button>
      </GlobalTooltip>
    </div>

    <LeftGroupList @open-rename="openRename" @open-delete="openDelete" @open-move="openMove" />
    <LeftPanelFooter />
  </div>

  <button
    @click="uiStore.isLeftOpen = !uiStore.isLeftOpen"
    class="sidebar-toggle-btn-left"
    :title="uiStore.isLeftOpen ? '收起左侧边栏' : '展开左侧边栏'"
    :class="{ 'is-open': uiStore.isLeftOpen }"
  >
    <Triangle :size="12" fill="currentColor" :style="{ rotate: uiStore.isLeftOpen ? '270deg' : '90deg' }" />
  </button>

  <BaseModal v-model:visible="modals.create" title="新建分组" @confirm="handleCreateGroup">
    <BaseInput
      v-model="modalData.inputValue"
      ref="createInputRef"
      placeholder="请输入分组名称..."
      clearable
      @enter="handleCreateGroup"
    />
  </BaseModal>

  <BaseModal v-model:visible="modals.rename" title="修改组名" @confirm="handleRenameGroup">
    <BaseInput
      v-model="modalData.inputValue"
      ref="renameInputRef"
      placeholder="请输入新名称..."
      clearable
      @enter="handleRenameGroup"
    />
  </BaseModal>

  <BaseModal v-model:visible="modals.delete" title="删除分组" confirm-type="danger" @confirm="handleDeleteGroup">
    <p class="text-sm font-semibold opacity-80 leading-relaxed text-body">
      确定要执行此删除操作吗？删除后组内的所有和弦资产都将同步清空，且不可恢复。
    </p>
  </BaseModal>

  <BaseModal v-model:visible="modals.move" title="移动至新分组" @confirm="handleMoveChord">
    <div class="flex flex-col gap-2 overflow-y-auto no-scrollbar pb-1">
      <button
        v-for="group in chordStore.groups"
        :key="group.id"
        @click="modalData.moveTargetId = group.id"
        :disabled="group.id === modalData.activeChord?.groupId"
        class="px-4 py-3 rounded-lg text-sm font-bold text-left transition-all border flex items-center justify-between"
        :class="
          group.id === modalData.activeChord?.groupId
            ? 'opacity-40 cursor-not-allowed grayscale bg-[var(--bg-main)] border-[var(--control-border)]'
            : modalData.moveTargetId === group.id
              ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-md'
              : 'bg-[var(--bg-body)] text-[var(--text-body)] border-[var(--control-border)] hover:border-blue-400/50'
        "
      >
        <span>{{ group.name }}</span>
        <span
          v-if="group.id === modalData.activeChord?.groupId"
          class="text-[11px] opacity-60 font-black uppercase tracking-wider"
        >
          当前分组
        </span>
      </button>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { LEFT_SIDEBAR_WIDTH_PIXEL } from '@/constants';
import { useGithubSyncService } from '@/services/useGithubSyncService';
import { useChordStore } from '@/stores/chordStore';
import { useEditorStore } from '@/stores/editorStore';
import { useUiStore } from '@/stores/uiStore';
import type { Chord, Group } from '@/types';
import { nextTick, reactive, ref } from 'vue';

import BaseInput from '@/components/BaseInput.vue';
import BaseModal from '@/components/BaseModal.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import LeftGroupList from '@/views/sidebar-left/LeftGroupList.vue';
import LeftPanelFooter from '@/views/sidebar-left/LeftPanelFooter.vue';
import { Plus, Triangle } from '@lucide/vue';

const uiStore = useUiStore();
const chordStore = useChordStore();
const editorStore = useEditorStore();
const { triggerGlobalSync } = useGithubSyncService();

const modals = reactive({
  create: false,
  rename: false,
  delete: false,
  move: false,
});

const modalData = reactive({
  inputValue: '',
  activeGroup: null as Group | null,
  activeChord: null as Chord | null,
  moveTargetId: '',
});

const createInputRef = ref<InstanceType<typeof BaseInput> | null>(null);
const renameInputRef = ref<InstanceType<typeof BaseInput> | null>(null);

const openCreate = async () => {
  modalData.inputValue = '';
  modals.create = true;
  await nextTick();
  setTimeout(() => createInputRef.value?.focus(), 50);
};

const handleCreateGroup = () => {
  const val = modalData.inputValue.trim();
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

  modals.create = false;
  uiStore.showToast('✅ 操作成功完成');
  triggerGlobalSync();
};

const openRename = async (group: Group) => {
  modalData.activeGroup = group;
  modalData.inputValue = group.name;
  modals.rename = true;
  await nextTick();
  setTimeout(() => renameInputRef.value?.focus(), 50);
};

const handleRenameGroup = () => {
  const val = modalData.inputValue.trim();
  if (!val) {
    uiStore.showToast('❌ 确认失败：请输入有效内容');
    return;
  }
  if (modalData.activeGroup) {
    modalData.activeGroup.name = val;
  }
  modals.rename = false;
  uiStore.showToast('✅ 操作成功完成');
  triggerGlobalSync();
};

const openDelete = (group: Group) => {
  modalData.activeGroup = group;
  modals.delete = true;
};

const handleDeleteGroup = () => {
  if (!modalData.activeGroup) return;
  const targetGid = modalData.activeGroup.id;

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
  modals.delete = false;
  uiStore.showToast('✅ 操作成功完成');
  triggerGlobalSync();
};

const openMove = (chord: Chord) => {
  modalData.activeChord = chord;
  modalData.moveTargetId = '';
  modals.move = true;
};

const handleMoveChord = () => {
  if (!modalData.moveTargetId) {
    uiStore.showToast('❌ 确认失败：请选择有效分组');
    return;
  }
  if (!modalData.activeChord) return;

  const chordIdx = chordStore.savedChordsList.findIndex(c => c.id === modalData.activeChord!.id);
  if (chordIdx !== -1) {
    chordStore.savedChordsList[chordIdx].groupId = modalData.moveTargetId;
    uiStore.clearUndoToasts();
  }

  modals.move = false;
  uiStore.showToast('✅ 操作成功完成');
  triggerGlobalSync();
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.less';

.panel-left {
  .mixin-panel-base();
  width: 0px;
  opacity: 0;
  margin: 12px 0;
  transition:
    width @duration-slow @bezier-sidebar,
    opacity @duration-base ease,
    margin @duration-slow @bezier-sidebar;
  &.is-open {
    width: v-bind(LEFT_SIDEBAR_WIDTH_PIXEL);
    opacity: 1;
    margin: 12px;
  }
}

.sidebar-toggle-btn-left {
  .mixin-sidebar-toggle();
  border-radius: 0 6px 6px 0;
  transform: translateY(-50%) scale(1);
  transform-origin: left;
  left: 0px;
  transition:
    all 0.2s ease,
    left @duration-slow @bezier-sidebar;
  &.is-open {
    left: calc(v-bind(LEFT_SIDEBAR_WIDTH_PIXEL) + 12px);
  }

  &:active {
    transform: translateY(-50%) scale(0.93);
  }
}

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
