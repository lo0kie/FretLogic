<template>
  <EmptyState v-if="chordStore.groups.length === 0" :icon="FolderOpen" description="还没有添加分组" size="md" />

  <VueDraggable
    v-else
    :model-value="chordStore.groups"
    @update:modelValue="(val: Group[]) => chordStore.overwriteGroups(val)"
    :animation="200"
    handle=".drag-handle"
    :disabled="Boolean(searchQuery) || uiStore.isMobile"
    class="draggable-list"
    ghost-class="drag-ghost-style"
    chosen-class="drag-chosen-style"
    drag-class="drag-active-style"
    :touchStartThreshold="12"
    :swap-threshold="0.5"
  >
    <template v-for="group in chordStore.groups" :key="group.id">
      <GlobalContextMenu ref="contextMenuRefs" :items="getGroupMenuItems(group)" class="group-box-card">
        <div
          ref="groupCardEls"
          @click="chordService.executeGroupToggle(group.id)"
          class="group-title-row"
          :class="{ 'is-context-open': isGroupMenuOpen(group.id) }"
        >
          <div class="group-info-zone" title="点击折叠/展开分组">
            <ChevronDown
              :size="14"
              stroke-width="2.5"
              class="arrow-toggle-icon"
              :class="{ 'is-collapsed': group.collapsed }"
            />

            <BaseMarquee>
              <span class="group-name-text">
                {{ group.name }}
              </span>
            </BaseMarquee>

            <BaseBadge
              v-if="searchQuery"
              :variant="hasMatchedChords(group.id) ? 'primary' : 'neutral'"
              :appearance="hasMatchedChords(group.id) ? 'subtle' : 'filled'"
              size="xs"
            >
              <span :class="{ 'search-match-count': hasMatchedChords(group.id) }">
                {{ getMatchCount(group.id) }}
              </span>
              <span>&nbsp;/&nbsp;{{ getGroupChordsCount(group.id) }}</span>
            </BaseBadge>

            <BaseBadge v-else variant="neutral" appearance="filled" size="xs">
              {{ getGroupChordsCount(group.id) }}
            </BaseBadge>
          </div>

          <div v-if="!uiStore.isMobile" @click.stop class="drag-action-zone">
            <div class="drag-handle" :class="{ 'is-hidden-by-search': Boolean(searchQuery) }" title="按住拖拽排序">
              <GripVertical :size="14" stroke-width="2.5" />
            </div>
          </div>
        </div>

        <div v-if="!group.collapsed" class="chord-content-wrapper">
          <VueDraggable
            v-if="(filteredChordsGroupMap.get(group.id) || []).length > 0"
            :model-value="filteredChordsGroupMap.get(group.id) || []"
            :animation="200"
            ghost-class="drag-ghost-style"
            chosen-class="drag-chosen-style"
            drag-class="drag-active-style"
            :disabled="Boolean(searchQuery) || uiStore.isMobile"
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

          <EmptyState v-else-if="getGroupChordsCount(group.id) === 0" size="sm" description="暂无和弦" />

          <EmptyState v-else-if="searchQuery" size="sm" description="无匹配" />
        </div>
      </GlobalContextMenu>
    </template>
  </VueDraggable>
</template>

<script setup lang="ts">
import BaseBadge from '@/components/BaseBadge.vue';
import BaseMarquee from '@/components/BaseMarquee.vue';
import EmptyState from '@/components/EmptyState.vue';
import GlobalContextMenu, { type ContextMenuItem } from '@/components/GlobalContextMenu.vue';
import { useChordService } from '@/services/useChordService';
import { useEditorStore } from '@/stores/chordEditorStore.ts';
import { useChordStore } from '@/stores/chordStore';
import { useUiStore } from '@/stores/uiStore';
import type { Chord, Group } from '@/types';
import { ChevronDown, FolderOpen, GripVertical, SquarePen, Trash2 } from '@lucide/vue';
import { computed, nextTick, useTemplateRef, watch } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import LeftChordCard from './LeftChordCard.vue';

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
const uiStore = useUiStore();

const groupCardEls = useTemplateRef<HTMLElement[]>('groupCardEls');
const contextMenuRefs = useTemplateRef<InstanceType<typeof GlobalContextMenu>[]>('contextMenuRefs');

const chordLowerNameCache = new WeakMap<Chord, string>();

const getMatchCount = (groupId: string): number => {
  return (filteredChordsGroupMap.value.get(groupId) || []).length;
};

const hasMatchedChords = (groupId: string): boolean => {
  return getMatchCount(groupId) > 0;
};
const getChordLowerName = (chord: Chord): string => {
  let cached = chordLowerNameCache.get(chord);
  if (!cached) {
    cached = chord.chordName.toLowerCase();
    chordLowerNameCache.set(chord, cached);
  }
  return cached;
};

const isGroupMenuOpen = (groupId: string) => {
  const idx = chordStore.groups.findIndex(g => g.id === groupId);
  if (idx === -1) return false;
  return contextMenuRefs.value?.[idx]?.isOpen ?? false;
};

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
        originalChords.filter(c => getChordLowerName(c).includes(queryKeyword))
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

      const idx = chordStore.groups.findIndex(g => g.id === newId);
      const targetElement = idx !== -1 ? groupCardEls.value?.[idx] : null;

      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }
);
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.draggable-list:has(.group-box-card.drag-chosen-style) {
  .chord-content-wrapper {
    display: none !important;
  }
}

.draggable-list {
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
  border: 1px solid transparent;
  transition: @transition-fast;

  &:hover {
    background-color: var(--bg-panel-hover);

    .drag-handle:not(.is-hidden-by-search) {
      opacity: 1;
    }
  }

  &:hover,
  &:active,
  &.is-context-open {
    background-color: var(--bg-panel-hover) !important;
    border-color: var(--border-base);
    box-shadow: 0 0 0 1px var(--border-base);
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

.group-name-text {
  font-weight: 700;
  font-size: 0.82rem;
  user-select: none;
  letter-spacing: 1px;
  color: var(--text-title);
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
</style>
