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
        :disabled="!!searchQuery"
        class="flex flex-col gap-4 relative"
        filter=".action-buttons"
        ghost-class="opacity-0"
        :touchStartThreshold="12"
        :swap-threshold="0.5"
      >
        <div v-for="group in chordLabStore.groups" :key="group.id" class="flex flex-col w-full group-box">
          <div
            @click="chordLabStore.handleGroupHeaderClick(group.id)"
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

              <span class="text-[12px] font-black px-1.5 py-0.5 count-badge shrink-0 font-mono">
                <template v-if="searchQuery">
                  <span style="color: var(--color-primary)">{{ getGroupMatchedCount(group.id) }}</span>
                  <span> / </span>
                  <span>{{ getGroupChordsCount(group.id) }}</span>
                </template>

                <span v-else>{{ getGroupChordsCount(group.id) }}</span>
              </span>
            </div>

            <div @click.stop="" class="flex items-center gap-2 shrink-0">
              <div class="action-buttons opacity-0 flex items-center gap-2 transition-opacity pointer-events-auto">
                <button
                  @click="uiStore.openModal('renameGroup', '修改组名', group.name, group)"
                  class="text-[14px] font-semibold hover:underline"
                  style="color: var(--color-primary)"
                >
                  改名
                </button>

                <button
                  @click="uiStore.openModal('deleteGroup', '删除分组', '', group)"
                  class="text-[14px] font-semibold hover:underline"
                  style="color: var(--color-danger)"
                >
                  删除
                </button>
              </div>

              <div
                class="drag-handle p-1 rounded hover:bg-[var(--bg-panel-hover)] transition-colors cursor-grab active:cursor-grabbing text-[var(--text-disabled)] hover:text-[var(--text-body)] flex items-center justify-center opacity-0"
                title="按住拖拽排序"
                :style="{ visibility: searchQuery.length !== 0 ? 'hidden' : 'visible' }"
                :class="{ 'w-0 px-0': searchQuery.length !== 0 }"
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
              :disabled="!!searchQuery"
              class="grid grid-cols-2 gap-2 items-center relative z-10 min-h-[64px]"
              @update="e => handleChordSort(e, group.id)"
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
                @click="chordLabStore.handleChordClick(chord)"
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
              v-else-if="searchQuery && searchFilteredChords(group.id).length === 0"
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
import { useChordLabStore, type Chord } from '@/stores/chordLabStore';
import { useUiStore } from '@/stores/uiStore';
import LeftChordCard from '@/views/sidebar-left/LeftChordCard.vue';
import LeftSearch from '@/views/sidebar-left/LeftSearch.vue';
import { ChevronDown, FolderOpen, GripVertical } from '@lucide/vue';
import { ref } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';

const uiStore = useUiStore();
const chordLabStore = useChordLabStore();
const searchQuery = ref('');

const getGroupChordsCount = (groupId: string) => {
  return chordLabStore.savedChordsList.filter(c => c.groupId === groupId).length;
};

const searchFilteredChords = (groupId: string) => {
  const chords = chordLabStore.savedChordsList.filter(c => c.groupId === groupId);
  const q = searchQuery.value.toLowerCase();
  if (!q) return chords;
  return chords.filter(c => c.chordName.toLowerCase().includes(q));
};

// 🌟 核心新增：获取当前具体分组下命中检索条件的新数量
const getGroupMatchedCount = (groupId: string) => {
  const chords = chordLabStore.savedChordsList.filter(c => c.groupId === groupId);
  const q = searchQuery.value.toLowerCase();
  if (!q) return chords.length;
  return chords.filter(c => c.chordName.toLowerCase().includes(q)).length;
};

const handleChordSort = (event: any, groupId: string) => {
  const { oldIndex, newIndex } = event;
  if (oldIndex === undefined || newIndex === undefined) return;

  const currentGroupChords = chordLabStore.savedChordsList.filter(c => c.groupId === groupId);
  const [movedChord] = currentGroupChords.splice(oldIndex, 1);
  currentGroupChords.splice(newIndex, 0, movedChord);

  const otherGroupsChords = chordLabStore.savedChordsList.filter(c => c.groupId !== groupId);
  chordLabStore.overwriteChords([...otherGroupsChords, ...currentGroupChords]);
};

const handleLocalMoveChord = (chord: Chord) => {
  uiStore.openModal('moveChord', '移动至新分组', '', null, chord);
};

const handleLocalDeleteChord = (chord: Chord) => {
  const isEditingCurrent = chordLabStore.editingId == chord.id;
  uiStore.triggerDeleteChord(chord);
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
  &:hover .drag-handle {
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
