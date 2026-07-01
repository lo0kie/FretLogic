<template>
  <div class="flex flex-col flex-1 overflow-hidden" :style="{ minWidth: LEFT_SIDEBAR_WIDTH_PIXEL }">
    <LeftSearch v-model="searchQuery" :disabled="chordStore.savedChordsList.length === 0" />

    <div class="flex-1 overflow-y-auto no-scrollbar p-4">
      <div
        v-if="chordStore.groups.length === 0"
        class="h-full flex flex-col items-center justify-center opacity-30 py-20"
      >
        <FolderOpen />
        <p
          class="text-xs font-black uppercase tracking-widest text-center leading-relaxed"
          style="color: var(--text-body)"
        >
          还没有添加分组
        </p>
      </div>

      <VueDraggable
        :model-value="chordStore.groups"
        @update:modelValue="(val: Group[]) => chordStore.overwriteGroups(val)"
        :animation="250"
        handle=".drag-handle"
        :disabled="!!debouncedQuery"
        class="flex flex-col gap-4 relative"
        filter=".action-buttons"
        ghost-class="opacity-0"
        :touchStartThreshold="12"
        :swap-threshold="0.5"
        @update="handleGroupDragUpdate"
      >
        <div
          v-for="group in chordStore.groups"
          :key="group.id"
          :id="'group-' + group.id"
          class="flex flex-col w-full group-box"
        >
          <div
            @click="chordService.executeGroupToggle(group.id)"
            class="group-title-row flex items-center justify-between py-2 px-2 cursor-pointer select-none"
          >
            <div
              class="flex items-center gap-2 hover:opacity-80 transition-opacity w-fit flex-1 mr-4"
              title="点击折叠/展开分组"
            >
              <ChevronDown
                :size="16"
                class="opacity-40 transition-transform duration-200 shrink-0"
                style="color: var(--text-body)"
                :class="{ '-rotate-90': group.collapsed }"
              />
              <span
                class="font-black tracking-widest uppercase group-name-text text-sm select-none truncate max-w-[140px]"
              >
                {{ group.name }}
              </span>

              <span
                class="text-[12px] font-black px-1.5 py-0.5 count-badge shrink-0 font-mono inline-flex items-center"
              >
                <template v-if="debouncedQuery">
                  <span style="color: var(--color-primary); line-height: 1">
                    {{ searchFilteredChords(group.id).length }}
                  </span>

                  <span style="line-height: 1">&nbsp;/&nbsp;{{ getGroupChordsCount(group.id) }}</span>
                </template>

                <template v-else>
                  {{ getGroupChordsCount(group.id) }}
                </template>
              </span>
            </div>

            <div @click.stop="" class="flex items-center gap-2 shrink-0">
              <div class="action-buttons opacity-0 flex items-center gap-2 transition-opacity pointer-events-auto">
                <button
                  @click="openRenameModal(group)"
                  class="text-[14px] font-semibold hover:underline"
                  style="color: var(--color-primary)"
                >
                  改名
                </button>
                <button
                  @click="openDeleteModal(group)"
                  class="text-[14px] font-semibold hover:underline"
                  style="color: var(--color-danger)"
                >
                  删除
                </button>
              </div>

              <div
                class="drag-handle p-1 rounded hover:bg-[var(--bg-panel-hover)] transition-all cursor-grab active:cursor-grabbing text-[var(--text-disabled)] hover:text-[var(--text-body)] flex items-center justify-center opacity-0 overflow-visible"
                :class="{ '!w-0 !px-0 pointer-events-none': debouncedQuery.length > 0 }"
                title="按住拖拽排序"
              >
                <GripVertical :size="16" class="opacity-50" />
              </div>
            </div>
          </div>

          <div v-if="!group.collapsed" class="chord-content-wrapper mt-2 relative">
            <VueDraggable
              :model-value="searchFilteredChords(group.id)"
              :animation="250"
              ghost-class="opacity-0"
              :disabled="!!debouncedQuery"
              class="grid grid-cols-3 gap-2 items-center relative z-10 min-h-[64px]"
              @update="e => chordService.handleChordSort(e, group.id)"
              :swap-threshold="0.5"
              :touchStartThreshold="12"
            >
              <LeftChordCard
                v-for="chord in searchFilteredChords(group.id)"
                :key="chord.id"
                :chord="chord"
                :is-editing="editorStore.editingId === chord.id"
                @delete="handleLocalDeleteChord"
                @move="openMoveModal"
                @click="chordService.loadChordToEditor(chord)"
                class="cursor-grab active:cursor-grabbing"
              />
            </VueDraggable>

            <div
              v-if="getGroupChordsCount(group.id) === 0"
              class="absolute inset-0 flex flex-col items-center justify-center empty-card-box opacity-60 pointer-events-none z-0"
            >
              <p class="text-xs font-bold uppercase tracking-widest" style="color: var(--text-disabled)">
                暂无保存的和弦
              </p>
            </div>
            <div
              v-else-if="debouncedQuery && searchFilteredChords(group.id).length === 0"
              class="absolute inset-0 flex flex-col items-center justify-center opacity-60 empty-card-box border-amber-500/20 bg-amber-500/[0.02] pointer-events-none z-0"
            >
              <p class="text-xs font-bold uppercase tracking-widest" style="color: var(--text-disabled)">
                没有匹配的和弦
              </p>
            </div>
          </div>
        </div>
      </VueDraggable>
    </div>

    <BaseModal v-model:visible="isRenameModalOpen" title="修改组名" @confirm="handleRenameGroup">
      <div class="relative w-full group flex items-center">
        <input
          v-model="renameInput"
          ref="renameInputRef"
          @keyup.enter="handleRenameGroup"
          type="text"
          class="modal-input-field w-full text-sm font-bold pr-9"
          placeholder="请输入新名称..."
        />
        <button
          v-if="renameInput"
          @click="
            renameInput = '';
            renameInputRef?.focus();
          "
          class="h-4 w-4 absolute right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 text-[var(--text-disabled)] hover:text-[var(--color-danger)] flex items-center justify-center hover:text-white bg-[var(--bg-main)] hover:bg-[var(--color-danger)] rounded-full active:scale-90 transition-all"
        >
          <X :size="14" stroke-width="3" />
        </button>
      </div>
    </BaseModal>

    <BaseModal v-model:visible="isDeleteModalOpen" title="删除分组" confirm-type="danger" @confirm="handleDeleteGroup">
      <p class="text-sm font-semibold opacity-80 leading-relaxed text-body">
        确定要执行此删除操作吗？删除后组内的所有和弦资产都将同步清空，且不可恢复。
      </p>
    </BaseModal>

    <BaseModal v-model:visible="isMoveModalOpen" title="移动至新分组" @confirm="handleMoveChord">
      <div class="flex flex-col gap-2 overflow-y-auto no-scrollbar pb-1">
        <button
          v-for="group in chordStore.groups"
          :key="group.id"
          @click="moveTargetGroupId = group.id"
          :disabled="group.id === activeChord?.groupId"
          class="px-4 py-3 rounded-lg text-sm font-bold text-left transition-all border flex items-center justify-between"
          :class="
            group.id === activeChord?.groupId
              ? 'opacity-40 cursor-not-allowed grayscale bg-[var(--bg-main)] border-[var(--control-border)]'
              : moveTargetGroupId === group.id
                ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-md'
                : 'bg-[var(--bg-body)] text-[var(--text-body)] border-[var(--control-border)] hover:border-blue-400/50'
          "
        >
          <span>{{ group.name }}</span>
          <span
            v-if="group.id === activeChord?.groupId"
            class="text-[11px] opacity-60 font-black uppercase tracking-wider"
          >
            当前分组
          </span>
        </button>
      </div>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
import BaseModal from '@/components/BaseModal.vue';
import { LEFT_SIDEBAR_WIDTH_PIXEL } from '@/constants';
import { useChordService } from '@/services/useChordService';
import { useGithubSyncService } from '@/services/useGithubSyncService';
import { useChordStore } from '@/stores/chordStore';
import { useEditorStore } from '@/stores/editorStore';
import { useUiStore } from '@/stores/uiStore';
import type { Chord, Group } from '@/types';
import LeftChordCard from '@/views/sidebar-left/LeftChordCard.vue';
import LeftSearch from '@/views/sidebar-left/LeftSearch.vue';
import { ChevronDown, FolderOpen, GripVertical, X } from '@lucide/vue';
import { refDebounced } from '@vueuse/core';
import { nextTick, ref, watch } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';

const editorStore = useEditorStore();
const chordStore = useChordStore();
const chordService = useChordService();
const uiStore = useUiStore();
const { triggerGlobalSync } = useGithubSyncService();

const searchQuery = ref('');
const debouncedQuery = refDebounced(searchQuery, 150);

// ===== 弹窗独立状态 =====
const activeGroup = ref<Group | null>(null);
const activeChord = ref<Chord | null>(null);

const isRenameModalOpen = ref(false);
const renameInput = ref('');
const renameInputRef = ref<HTMLInputElement | null>(null);

const isDeleteModalOpen = ref(false);

const isMoveModalOpen = ref(false);
const moveTargetGroupId = ref('');

// ===== 弹窗逻辑 =====
const openRenameModal = async (group: Group) => {
  activeGroup.value = group;
  renameInput.value = group.name;
  isRenameModalOpen.value = true;
  await nextTick();
  setTimeout(() => renameInputRef.value?.focus(), 50);
};

const handleRenameGroup = () => {
  const val = renameInput.value.trim();
  if (!val) {
    uiStore.showToast('❌ 确认失败：请输入有效内容');
    return;
  }
  if (activeGroup.value) {
    activeGroup.value.name = val;
  }
  isRenameModalOpen.value = false;
  uiStore.showToast('✅ 操作成功完成');
  triggerGlobalSync();
};

const openDeleteModal = (group: Group) => {
  activeGroup.value = group;
  isDeleteModalOpen.value = true;
};

const handleDeleteGroup = () => {
  if (!activeGroup.value) return;
  const targetGid = activeGroup.value.id;

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
  isDeleteModalOpen.value = false;
  uiStore.showToast('✅ 操作成功完成');
  triggerGlobalSync();
};

const openMoveModal = (chord: Chord) => {
  activeChord.value = chord;
  moveTargetGroupId.value = '';
  isMoveModalOpen.value = true;
};

const handleMoveChord = () => {
  if (!moveTargetGroupId.value) {
    uiStore.showToast('❌ 确认失败：请选择有效分组');
    return;
  }
  if (!activeChord.value) return;

  const chordIdx = chordStore.savedChordsList.findIndex(c => c.id === activeChord.value!.id);
  if (chordIdx !== -1) {
    chordStore.savedChordsList[chordIdx].groupId = moveTargetGroupId.value;
    uiStore.clearUndoToasts();
  }

  isMoveModalOpen.value = false;
  uiStore.showToast('✅ 操作成功完成');
  triggerGlobalSync();
};

// ===== 其他功能逻辑 =====
const getGroupChordsCount = (groupId: string) => {
  return chordStore.groupChordMap.get(groupId)?.length || 0;
};

const searchFilteredChords = (groupId: string) => {
  const chords = chordStore.groupChordMap.get(groupId) || [];
  const q = debouncedQuery.value.toLowerCase().trim();
  if (!q) return chords;
  return chords.filter(c => c.chordName.toLowerCase().includes(q));
};

const handleLocalDeleteChord = (chord: Chord) => {
  const isEditingCurrent = editorStore.editingId === chord.id;
  chordService.triggerDeleteChord(chord);
  if (isEditingCurrent) editorStore.resetEditor();
};

const handleGroupDragUpdate = () => {
  triggerGlobalSync();
};

watch(
  () => chordStore.selectedGroupId,
  async newId => {
    if (newId) {
      await nextTick();
      document.getElementById(`group-${newId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
);
</script>

<style scoped lang="less">
@import '@/assets/tokens.less';

.modal-input-field {
  .mixin-input-base();
}

:deep(.relative:has(.group-box.sortable-chosen)) {
  .chord-content-wrapper {
    display: none !important;
  }
}

.count-badge {
  background-color: var(--bg-body);
  color: var(--text-muted);
  border: @border-solid-base;
  border-radius: @radius-md;
}
.empty-card-box {
  border: @border-dashed-base;
  background-color: var(--bg-body);
  border-radius: @radius-md;
}
.group-title-row {
  .mixin-interactive-card();
  border-radius: @radius-md;

  &:hover .action-buttons,
  &:hover .drag-handle:not(.invisible) {
    opacity: 1;
  }
  .group-name-text {
    color: var(--text-body);
    &.is-active {
      color: @primary !important;
    }
  }

  &:active:not(:disabled) {
    transform: none !important;
  }
  &:has(.action-buttons:active) {
    transform: scale(1) !important;
  }
}
</style>
