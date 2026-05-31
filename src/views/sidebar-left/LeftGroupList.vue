<template>
  <div class="flex flex-col flex-1 overflow-hidden" :class="`min-w-[${SIDEBAR_WIDTH_PIXEL}]`">
    <LeftSearch v-model="searchQuery" :disabled="chordLabStore.savedChordsList.length === 0" />

    <div class="flex-1 overflow-y-auto no-scrollbar p-4">
      <div
        v-if="chordLabStore.groups.length === 0"
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
        v-else
        v-model="chordLabStore.groups"
        :animation="250"
        handle=".drag-handle"
        :disabled="!!debouncedQuery"
        class="flex flex-col gap-4 relative"
        filter=".action-buttons"
        ghost-class="opacity-0"
        :touchStartThreshold="12"
        :swap-threshold="0.5"
      >
        <div v-for="group in chordLabStore.groups" :key="group.id" class="flex flex-col w-full group-box">
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
                  <span style="color: var(--color-primary); line-height: 1">{{
                    searchFilteredChords(group.id).length
                  }}</span>
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
                  @click="modal.openModal('renameGroup', '修改组名', group.name, group)"
                  class="text-[14px] font-semibold hover:underline"
                  style="color: var(--color-primary)"
                >
                  改名
                </button>

                <button
                  @click="modal.openModal('deleteGroup', '删除分组', '', group)"
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
              class="grid grid-cols-2 gap-2 items-center relative z-10 min-h-[64px]"
              @update="e => chordService.handleChordSort(e, group.id)"
              :swap-threshold="0.5"
              :touchStartThreshold="12"
            >
              <LeftChordCard
                v-for="chord in searchFilteredChords(group.id)"
                :key="chord.id"
                :chord="chord"
                :is-editing="chordLabStore.editingId === chord.id"
                @delete="handleLocalDeleteChord"
                @move="handleLocalMoveChord"
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
  </div>
</template>

<script setup lang="ts">
import { SIDEBAR_WIDTH_PIXEL } from '@/constants';
import { useChordLabStore } from '@/stores/chordLabStore';
import { useModal } from '@/composables/useModal'; // 🌟 接入解耦的弹窗服务
import { useChordService } from '@/services/useChordService';
import LeftChordCard from '@/views/sidebar-left/LeftChordCard.vue';
import LeftSearch from '@/views/sidebar-left/LeftSearch.vue';
import { ChevronDown, FolderOpen, GripVertical } from '@lucide/vue';
import { refDebounced } from '@vueuse/core'; // 🌟 引入 VueUse 防抖核心
import { ref } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import type { Chord } from '@/stores/types'; // 馃専 挂载全新元组约束

const chordLabStore = useChordLabStore();
const chordService = useChordService();
const modal = useModal();

const searchQuery = ref('');
// 🌟 性能护城河：150ms 输入防抖，极大降低重新计算开销
const debouncedQuery = refDebounced(searchQuery, 150);

// 🌟 O(1) 字典直取，彻底消灭全表 filter 扫描
const getGroupChordsCount = (groupId: string) => {
  return chordLabStore.groupChordMap.get(groupId)?.length || 0;
};

// 🌟 基于字典 O(1) 取值后再做字符串比对，性能提升百倍
const searchFilteredChords = (groupId: string) => {
  const chords = chordLabStore.groupChordMap.get(groupId) || [];
  const q = debouncedQuery.value.toLowerCase().trim();
  if (!q) return chords;
  return chords.filter(c => c.chordName.toLowerCase().includes(q));
};

const handleLocalMoveChord = (chord: Chord) => {
  modal.openModal('moveChord', '移动至新分组', '', null, chord);
};

const handleLocalDeleteChord = (chord: Chord) => {
  const isEditingCurrent = chordLabStore.editingId === chord.id;
  chordService.triggerDeleteChord(chord);
  if (isEditingCurrent) chordLabStore.resetEditor();
};
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

:deep(.relative:has(.group-box.sortable-chosen)) {
  .chord-content-wrapper {
    display: none !important;
  }
}

.count-badge {
  background-color: var(--bg-body);
  color: var(--text-muted);
  border: @border-solid-base;
  border-radius: @radius-sm;
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
