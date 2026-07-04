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
        class="flex flex-col gap-2 relative"
        ghost-class="opacity-0"
        :touchStartThreshold="12"
        :swap-threshold="0.5"
      >
        <div
          v-for="group in chordStore.groups"
          :key="group.id"
          :id="'group-' + group.id"
          class="flex flex-col w-full group-box"
        >
          <GlobalContextMenu :items="getGroupMenuItems(group)">
            <div
              @click="chordService.executeGroupToggle(group.id)"
              class="group-title-row flex items-center justify-between p-2 cursor-pointer select-none"
            >
              <div
                class="flex items-center gap-2 hover:opacity-80 transition-opacity flex-1 min-w-0 mr-2"
                title="点击折叠/展开分组"
              >
                <ChevronDown
                  :size="16"
                  stroke-width="3"
                  class="opacity-40 transition-transform duration-200 shrink-0"
                  style="color: var(--text-body)"
                  :class="{ '-rotate-90': group.collapsed }"
                />

                <BaseMarquee class="min-w-0">
                  <span class="font-black tracking-widest uppercase group-name-text text-sm select-none">
                    {{ group.name }}
                  </span>
                </BaseMarquee>

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

              <div @click.stop="" class="flex items-center gap-1.5 shrink-0">
                <div
                  class="drag-handle p-1 rounded hover:bg-[var(--bg-panel-hover)] transition-all cursor-grab active:cursor-grabbing text-[var(--text-disabled)] hover:text-[var(--text-body)] flex items-center justify-center opacity-0 overflow-visible touch-none"
                  :class="{ '!w-0 !px-0 pointer-events-none': debouncedQuery.length > 0 }"
                  title="按住拖拽排序"
                >
                  <GripVertical :size="16" class="opacity-50" stroke-width="3" />
                </div>
              </div>
            </div>
          </GlobalContextMenu>

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
                @move="$emit('open-move', chord)"
                @click="chordService.loadChordToEditor(chord)"
                class="cursor-grab active:cursor-grabbing touch-none"
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
import { ref, watch, nextTick } from 'vue';
import { LEFT_SIDEBAR_WIDTH_PIXEL } from '@/constants';
import { useChordService } from '@/services/useChordService';
import { useChordStore } from '@/stores/chordStore';
import { useEditorStore } from '@/stores/editorStore';
import type { Chord, Group } from '@/types';
import LeftChordCard from '@/views/sidebar-left/LeftChordCard.vue';
import LeftSearch from '@/views/sidebar-left/LeftSearch.vue';
import BaseMarquee from '@/components/BaseMarquee.vue';

import GlobalContextMenu, { type ContextMenuItem } from '@/components/GlobalContextMenu.vue';
import { ChevronDown, FolderOpen, Folder, GripVertical, SquarePen, Trash2 } from '@lucide/vue';
import { VueDraggable } from 'vue-draggable-plus';
import { refDebounced } from '@vueuse/core';

const emit = defineEmits<{
  (e: 'open-rename', group: Group): void;
  (e: 'open-delete', group: Group): void;
  (e: 'open-move', chord: Chord): void;
}>();

const editorStore = useEditorStore();
const chordStore = useChordStore();
const chordService = useChordService();

const searchQuery = ref('');
const debouncedQuery = refDebounced(searchQuery, 150);

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

const getGroupMenuItems = (group: Group): ContextMenuItem[] => [
  {
    label: group.collapsed ? '展开分组' : '折叠分组',
    icon: group.collapsed ? FolderOpen : Folder,
    action: () => chordService.executeGroupToggle(group.id),
  },
  {
    label: '修改名称',
    icon: SquarePen,
    action: () => emit('open-rename', group),
  },
  {
    label: '删除分组',
    icon: Trash2,
    danger: true,
    action: () => emit('open-delete', group),
  },
];

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
}
</style>
