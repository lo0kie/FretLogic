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
        handle=".group-title-row"
        :disabled="!!searchQuery"
        class="flex flex-col gap-4 relative"
      >
        <div v-for="group in chordLabStore.groups" :key="group.id" class="flex flex-col w-full group-box">
          <div
            @click="chordLabStore.handleGroupHeaderClick(group.id)"
            class="group-title-row flex items-center justify-between py-2 px-2 cursor-grab active:cursor-grabbing"
          >
            <div class="flex items-center gap-2">
              <ChevronDown
                :size="24"
                class="opacity-40 transition-transform duration-200"
                style="color: var(--text-body)"
                :class="{ '-rotate-90': group.collapsed }"
              />
              <span
                class="font-black tracking-widest uppercase group-name-text text-sm"
                :class="{ 'is-active': chordLabStore.selectedGroupId === group.id && !group.collapsed }"
              >
                {{ group.name }}
              </span>
              <span class="text-[12px] font-black px-1.5 py-0.5 count-badge">
                {{ getGroupChordsCount(group.id) }}
              </span>
            </div>

            <div class="action-buttons opacity-0 flex items-center gap-2 transition-opacity" @mousedown.stop>
              <button
                @click.stop="uiStore.openModal('renameGroup', '修改组名', group.name, group)"
                class="text-[14px] font-semibold hover:underline"
                style="color: var(--color-primary)"
              >
                改名
              </button>
              <button
                @click.stop="uiStore.openModal('deleteGroup', '删除分组', '', group)"
                class="text-[14px] font-semibold hover:underline"
                style="color: var(--color-danger)"
              >
                删除
              </button>
            </div>
          </div>

          <div v-if="!group.collapsed" class="chord-content-wrapper mt-2 relative">
            <VueDraggable
              :model-value="searchFilteredChords(group.id)"
              :animation="250"
              ghost-class="opacity-40"
              :disabled="!!searchQuery"
              class="grid grid-cols-2 gap-2 items-center relative z-10 min-h-[64px]"
              @update="e => handleChordSort(e, group.id)"
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
                暂无和弦或保存
              </p>
            </div>

            <div
              v-else-if="searchQuery && searchFilteredChords(group.id).length === 0"
              class="absolute inset-0 flex flex-col items-center justify-center empty-card-box border-amber-500/20 bg-amber-500/[0.02] pointer-events-none z-0"
            >
              <p class="text-xs font-bold text-amber-600/80">没有匹配的和弦</p>
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
import { ChevronDown, FolderOpen } from '@lucide/vue';
import { ref } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';

const uiStore = useUiStore();
const chordLabStore = useChordLabStore();
const searchQuery = ref('');

// 计算当前组内持有的和弦总数
const getGroupChordsCount = (groupId: string) => {
  return chordLabStore.savedChordsList.filter(c => c.groupId === groupId).length;
};

// 获取过滤后的和弦列表
const searchFilteredChords = (groupId: string) => {
  const chords = chordLabStore.savedChordsList.filter(c => c.groupId === groupId);
  const q = searchQuery.value.toLowerCase();
  if (!q) return chords;
  return chords.filter(c => c.chordName.toLowerCase().includes(q));
};

// 处理【组内】卡片无缝排序
const handleChordSort = (event: any, groupId: string) => {
  const { oldIndex, newIndex } = event;
  if (oldIndex === undefined || newIndex === undefined) return;

  const currentGroupChords = chordLabStore.savedChordsList.filter(c => c.groupId === groupId);
  const [movedChord] = currentGroupChords.splice(oldIndex, 1);
  currentGroupChords.splice(newIndex, 0, movedChord);

  const otherGroupsChords = chordLabStore.savedChordsList.filter(c => c.groupId !== groupId);
  chordLabStore.overwriteChords([...otherGroupsChords, ...currentGroupChords]);
};

// 基础业务逻辑
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

:deep(.sortable-chosen) {
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
  &:hover .action-buttons {
    opacity: 1;
  }
  .group-name-text {
    color: var(--text-body);
    &.is-active {
      color: @primary !important;
    }
  }
}
</style>
