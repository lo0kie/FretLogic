<template>
  <div class="left-group-list-container left-group-list" :style="{ minWidth: LEFT_SIDEBAR_WIDTH_PIXEL }">
    <div class="scroll-body no-scrollbar">
      <div v-if="chordStore.groups.length === 0" class="empty-groups-view">
        <FolderOpen class="empty-folder-icon" />
        <p class="empty-groups-text">还没有添加分组</p>
      </div>

      <VueDraggable
        :model-value="chordStore.groups"
        @update:modelValue="(val: Group[]) => chordStore.overwriteGroups(val)"
        :animation="200"
        handle=".drag-handle"
        :disabled="!!searchQuery"
        class="draggable-group-list"
        ghost-class="drag-ghost-opacity"
        :touchStartThreshold="12"
        :swap-threshold="0.5"
      >
        <div
          v-for="group in chordStore.groups"
          :key="group.id"
          :ref="el => setGroupCardRef(el, group.id)"
          class="group-box-card"
        >
          <GlobalContextMenu :items="getGroupMenuItems(group)">
            <div @click="chordService.executeGroupToggle(group.id)" class="group-title-row">
              <div class="group-info-zone" title="点击折叠/展开分组">
                <ChevronDown
                  :size="14"
                  stroke-width="2.5"
                  class="arrow-toggle-icon"
                  :class="{ 'is-collapsed': group.collapsed }"
                />

                <BaseMarquee class="group-marquee">
                  <span class="group-name-text">
                    {{ group.name }}
                  </span>
                </BaseMarquee>

                <span class="count-badge">
                  <template v-if="searchQuery">
                    <span class="search-match-count">
                      {{ (filteredChordsGroupMap.get(group.id) || []).length }}
                    </span>
                    <span>&nbsp;/&nbsp;{{ getGroupChordsCount(group.id) }}</span>
                  </template>
                  <template v-else>
                    {{ getGroupChordsCount(group.id) }}
                  </template>
                </span>
              </div>

              <div @click.stop="" class="drag-action-zone">
                <div class="drag-handle" :class="{ 'is-hidden-by-search': !!searchQuery }" title="按住拖拽排序">
                  <GripVertical :size="14" stroke-width="2.5" />
                </div>
              </div>
            </div>
          </GlobalContextMenu>

          <div v-if="!group.collapsed" class="chord-content-wrapper">
            <VueDraggable
              :model-value="filteredChordsGroupMap.get(group.id) || []"
              :animation="200"
              ghost-class="drag-ghost-opacity"
              :disabled="!!searchQuery"
              class="chords-grid-layout"
              @update="e => chordService.handleChordSort(e, group.id)"
              :swap-threshold="0.5"
              :touchStartThreshold="12"
            >
              <LeftChordCard
                v-for="chord in filteredChordsGroupMap.get(group.id) || []"
                :key="chord.id"
                :chord="chord"
                :is-editing="editorStore.editingId === chord.id"
                @delete="handleLocalDeleteChord"
                @move="$emit('open-move', chord)"
                @click="chordService.loadChordToEditor(chord)"
                class="chord-item-grab-handle"
              />
            </VueDraggable>

            <div v-if="getGroupChordsCount(group.id) === 0" class="empty-placeholder-card z-index-bg">
              <p class="placeholder-card-text">暂无和弦</p>
            </div>
            <div
              v-else-if="searchQuery && (filteredChordsGroupMap.get(group.id) || []).length === 0"
              class="empty-placeholder-card is-search-empty z-index-bg"
            >
              <p class="placeholder-card-text">无匹配</p>
            </div>
          </div>
        </div>
      </VueDraggable>
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch, nextTick, onBeforeUpdate, computed } from 'vue';
import { LEFT_SIDEBAR_WIDTH_PIXEL } from '@/utils/constants/index.ts';
import { useChordService } from '@/services/useChordService';
import { useChordStore } from '@/stores/chordStore';
import { useEditorStore } from '@/stores/editorStore';
import type { Chord, Group } from '@/types';
import LeftChordCard from './LeftChordCard.vue';
import BaseMarquee from '@/components/BaseMarquee.vue';

import GlobalContextMenu, { type ContextMenuItem } from '@/components/GlobalContextMenu.vue';
import { ChevronDown, FolderOpen, GripVertical, SquarePen, Trash2 } from '@lucide/vue';
import { VueDraggable } from 'vue-draggable-plus';

const props = defineProps<{
  searchQuery: string;
}>();

const emit = defineEmits<{
  (e: 'open-rename', group: Group): void;
  (e: 'open-delete', group: Group): void;
  (e: 'open-move', chord: Chord): void;
}>();

const editorStore = useEditorStore();
const chordStore = useChordStore();
const chordService = useChordService();

const groupCardsMap = new Map<string, HTMLElement>();

const setGroupCardRef = (el: unknown, groupId: string) => {
  if (el) {
    groupCardsMap.set(groupId, el as HTMLElement);
  }
};

onBeforeUpdate(() => {
  groupCardsMap.clear();
});

const getGroupChordsCount = (groupId: string) => {
  return chordStore.groupChordMap.get(groupId)?.length || 0;
};

const filteredChordsGroupMap = computed(() => {
  const map = new Map<string, Chord[]>();
  const queryKeyword = props.searchQuery.toLowerCase().trim();

  chordStore.groups.forEach(group => {
    const originalChords = chordStore.groupChordMap.get(group.id) || [];

    if (!queryKeyword) {
      map.set(group.id, originalChords);
    } else {
      map.set(
        group.id,
        originalChords.filter(c => c.chordName.toLowerCase().includes(queryKeyword))
      );
    }
  });

  return map;
});

const handleLocalDeleteChord = (chord: Chord) => {
  const isEditingCurrent = editorStore.editingId === chord.id;
  chordService.triggerDeleteChord(chord);
  if (isEditingCurrent) editorStore.resetEditor();
};

const getGroupMenuItems = (group: Group): ContextMenuItem[] => [
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
      const targetElement = groupCardsMap.get(newId);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }
);
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

:deep(.draggable-group-list:has(.group-box-card.sortable-chosen)) {
  .chord-content-wrapper {
    display: none !important;
  }
}

.left-group-list-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  box-sizing: border-box;
}

.scroll-body {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1rem;
  box-sizing: border-box;
}

.empty-groups-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  opacity: 0.35;
  padding: 4rem 0;
  box-sizing: border-box;
}

.empty-folder-icon {
  width: 1.5rem;
  height: 1.5rem;
  color: var(--text-disabled);
  margin-bottom: 0.5rem;
}

.empty-groups-text {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-disabled);
  margin: 0;
}

.draggable-group-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  position: relative;
  box-sizing: border-box;
}

.group-box-card {
  display: flex;
  flex-direction: column;
  width: 100%;
  box-sizing: border-box;
}

.group-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.45rem 0.5rem;
  user-select: none;
  background-color: transparent;
  border-radius: @radius-md;
  box-sizing: border-box;
  cursor: pointer;
  transition: @transition-fast;

  &:hover {
    background-color: var(--bg-panel-hover);

    .drag-handle:not(.is-hidden-by-search) {
      opacity: 1;
    }
  }
}

.group-info-zone {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex: 1;
  min-width: 0;
  margin-right: 0.5rem;
  box-sizing: border-box;
}

.arrow-toggle-icon {
  color: var(--text-disabled);
  flex-shrink: 0;
  transition: transform @duration-fast @bezier-standard;

  &.is-collapsed {
    transform: rotate(-90deg);
  }
}

.group-marquee {
  min-width: 0;
}

.group-name-text {
  font-weight: 700;
  font-size: 0.82rem;
  user-select: none;
  letter-spacing: 1px;
  color: var(--text-title);
}

.count-badge {
  background-color: var(--bg-body);
  color: var(--text-disabled);
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  padding: 0.1rem 0.45rem;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  box-sizing: border-box;
}

.search-match-count {
  color: var(--color-primary);
}

.drag-action-zone {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  box-sizing: border-box;
}

.drag-handle {
  padding: 0.15rem;
  border-radius: @radius-sm;
  color: var(--text-disabled);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  touch-action: none;
  box-sizing: border-box;
  cursor: grab;
  transition: @transition-fast;

  &:hover {
    color: var(--text-title);
  }

  &:active {
    cursor: grabbing;
  }

  &.is-hidden-by-search {
    width: 0 !important;
    padding: 0 !important;
    pointer-events: none;
  }
}

.chord-content-wrapper {
  margin-top: 0.4rem;
  position: relative;
  box-sizing: border-box;
}

.chords-grid-layout {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.4rem;
  align-items: center;
  position: relative;
  z-index: 10;
  min-height: 2.2rem;
  box-sizing: border-box;
}

.chord-item-grab-handle {
  cursor: grab;
  touch-action: none;

  &:active {
    cursor: grabbing;
  }
}

.empty-placeholder-card {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.5;
  pointer-events: none;
  border: 1px dashed var(--border-base);
  background-color: var(--bg-body);
  border-radius: @radius-md;
  box-sizing: border-box;
}

.placeholder-card-text {
  font-size: 0.68rem;
  font-weight: 500;
  color: var(--text-disabled);
  margin: 0;
}

.z-index-bg {
  z-index: 0;
}

.drag-ghost-opacity {
  opacity: 0;
}
</style>
