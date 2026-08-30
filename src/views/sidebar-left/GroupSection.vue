<template>
  <EmptyState v-if="chordStore.groups.length === 0" :icon="FolderOpen" description="还没有添加分组" size="md" />
  <EmptyState
    v-else-if="searchQuery && totalMatchCount === 0"
    :icon="Search"
    description="未找到匹配的和弦"
    size="md"
  />
  <div v-else v-grid-nav.stop="{ cols: 1, selector: '.group-title-row' }">
    <VueDraggable
      :model-value="chordStore.groups"
      :animation="200"
      handle=".group-title-row"
      :disabled="!isAllCollapsed || Boolean(searchQuery)"
      class="draggable-list flex flex-col gap-sm box-border"
      ghost-class="drag-ghost-style"
      chosen-class="drag-chosen-style"
      drag-class="drag-active-style"
      :swap-threshold="0.5"
      @update:model-value="(val: Group[]) => chordStore.overwriteGroups(val)"
    >
      <div v-for="(group, index) in chordStore.groups" :key="group.id" class="box-border">
        <ContextMenu :items="getGroupMenuItems(group)" #="{ isOpen }">
          <div
            v-wave
            tabindex="0"
            data-focusable-inline
            role="button"
            :aria-expanded="isGroupContentOpen(group)"
            :aria-label="`${group.name} 分组，共 ${getGroupChordsCount(group.id)} 个和弦，${chordStore.isGroupCollapsed(group.id) ? '已折叠' : '已展开'}`"
            class="group-title-row group/row h-[2.4rem] px-3 flex items-center justify-between cursor-pointer rounded-md select-none box-border outline-none border border-transparent transition-all duration-fast hover:bg-bg-panel-hover hover:border-border-base"
            :class="{
              '!bg-tint-panelhover-50': isGroupContentOpen(group),
              '!bg-tint-panelhover-30': isOpen,
            }"
            @click="chordActions.executeGroupToggle(group)"
            @keydown.enter.prevent="chordActions.executeGroupToggle(group)"
            @keydown.space.prevent="chordActions.executeGroupToggle(group)"
          >
            <div class="flex items-center gap-sm min-w-0 flex-1" title="点击折叠/展开分组">
              <ChevronDown
                :size="14"
                :stroke-width="2.5"
                class="text-text-disabled shrink-0 transition-transform duration-fast group-hover/row:text-text-title"
                :class="{ '-rotate-90': !isGroupContentOpen(group) }"
                aria-hidden="true"
              />
              <div v-marquee>
                <span class="text-xs font-bold text-text-title whitespace-nowrap">
                  {{ group.name }}
                </span>
              </div>
              <div class="flex items-center gap-sm ml-auto shrink-0">
                <BaseBadge
                  variant="neutral"
                  appearance="outline"
                  size="xs"
                  class="opacity-80"
                  title="排序方法"
                  :aria-label="`按${getSortLabel(group)}自动排序`"
                  width="2rem"
                >
                  {{ getSortLabel(group) }}
                </BaseBadge>
                <BaseBadge
                  v-if="searchQuery"
                  :variant="hasMatchedChords(group.id) ? 'primary' : 'neutral'"
                  :appearance="hasMatchedChords(group.id) ? 'subtle' : 'filled'"
                  size="xs"
                  :aria-label="`匹配 ${getMatchCount(group.id)} 个，共 ${getGroupChordsCount(group.id)} 个和弦`"
                  width="2.5rem"
                >
                  <span
                    :class="{
                      'font-extrabold': hasMatchedChords(group.id),
                    }"
                  >
                    {{ getMatchCount(group.id) }}
                  </span>
                  <span aria-hidden="true">&nbsp;/&nbsp;{{ getGroupChordsCount(group.id) }} </span>
                </BaseBadge>
                <BaseBadge
                  v-else
                  variant="neutral"
                  :appearance="isGroupContentOpen(group) ? 'subtle' : 'filled'"
                  size="xs"
                  width="1.5rem"
                  class="font-mono"
                  :aria-label="`共 ${getGroupChordsCount(group.id)} 个和弦`"
                >
                  {{ getGroupChordsCount(group.id) }}
                </BaseBadge>
              </div>
            </div>
          </div>
          <LeftChordGroupContent
            :ref="el => setContentOuterRef(el, index)"
            :group
            :search-query
            :is-open="isGroupContentOpen(group)"
            @open-move="chord => emit('open-move', chord)"
            @open-delete-variants="cardData => emit('open-delete-variants', cardData)"
            @open-references="cardData => emit('open-references', cardData)"
            @delete-chord="handleLocalDeleteChord"
            @select-chord="handleSelectChord"
          />
        </ContextMenu>
      </div>
    </VueDraggable>
  </div>
</template>

<script setup lang="ts">
import BaseBadge from '@/components/base/BaseBadge.vue';
import EmptyState from '@/components/base/EmptyState.vue';
import ContextMenu from '@/components/context-menu/ContextMenu.vue';
import type { ContextMenuItem } from '@/components/context-menu/ContextMenuItems.vue';
import { useChordActions } from '@/composables/fretboard/useChordActions';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { useChordStore } from '@/stores/chordStore';
import type { Chord, Group, GroupedChordCard } from '@/types';
import { ArrowUpDown, ChevronDown, FolderOpen, Search, SquarePen, Trash2 } from '@lucide/vue';
import { getGroupSortKey } from '@/utils/music/entityFactories';
import { computed, watch, type ComponentPublicInstance } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import LeftChordGroupContent from './GroupContent.vue';

const props = defineProps<{
  searchQuery: string;
}>();
const emit = defineEmits<{
  (e: 'open-rename', group: Group): void;
  (e: 'open-delete', group: Group): void;
  (e: 'open-move', chord: Chord): void;
  (e: 'open-sort', group: Group): void;
  (e: 'open-delete-variants', cardData: GroupedChordCard): void;
  (e: 'open-references', cardData: GroupedChordCard): void;
}>();

const chordStore = useChordStore();
const editorStore = useChordEditorStore();
const chordActions = useChordActions();

const contentOuterComponentEls = new Map<number, ComponentPublicInstance | Element | null>();

const setContentOuterRef = (el: Element | ComponentPublicInstance | null, index: number) => {
  if (el) contentOuterComponentEls.set(index, el);
  else contentOuterComponentEls.delete(index);
};

const isGroupContentOpen = (group: Group): boolean => !chordStore.isGroupCollapsed(group.id);
const isAllCollapsed = computed(() => chordStore.groups.every(g => chordStore.isGroupCollapsed(g.id)));

const handleSelectChord = (chord: Chord) => {
  if (editorStore.draftChord.id === chord.id) {
    editorStore.resetEditor();
  } else {
    editorStore.setEditor(chord);
  }
};

const groupMatchCountsMap = computed(() => {
  const map = new Map<string, number>();
  const q = props.searchQuery.trim();

  if (!q) {
    chordStore.groups.forEach(g => {
      map.set(g.id, chordStore.groupedChordMap.get(g.id)?.length ?? 0);
    });
    return map;
  }

  chordStore.groups.forEach(g => {
    map.set(g.id, chordStore.getGroupedCards(g.id, q).length);
  });

  return map;
});

const totalMatchCount = computed(() => {
  if (!props.searchQuery.trim()) return chordStore.savedChordsList.length;
  return Array.from(groupMatchCountsMap.value.values()).reduce((sum, c) => sum + c, 0);
});

const getMatchCount = (groupId: string): number => groupMatchCountsMap.value.get(groupId) ?? 0;
const hasMatchedChords = (groupId: string): boolean => getMatchCount(groupId) > 0;

const sortLabelStrategies: Record<Group['sortRule'], (group: Group) => string> = {
  ROOT_PITCH: () => 'C-B',
  KEY_DEGREE: group => `${getGroupSortKey(group) ?? 'C'}调`,
  NAME_ASC: () => 'A-Z',
};

const getSortLabel = (group: Group): string => sortLabelStrategies[group.sortRule]?.(group) ?? 'C-B';

const getGroupChordsCount = (groupId: string) => {
  return chordStore.groupChordMap.get(groupId)?.length ?? 0;
};

const handleLocalDeleteChord = (chord: Chord) => {
  const isEditingCurrent = editorStore.draftChord.id === chord.id;
  chordActions.triggerDeleteChord(chord);
  if (isEditingCurrent) editorStore.resetEditor();
};

const groupMenuItemsMap = new Map<string, ContextMenuItem[]>();
// 签名需包含组内和弦数，否则增删和弦后禁用态不会刷新
const groupIdsSignature = computed(() =>
  chordStore.groups.map(g => `${g.id}:${chordStore.groupChordMap.get(g.id)?.length ?? 0}`).join('\u0000')
);
watch(groupIdsSignature, () => groupMenuItemsMap.clear());

const resolveGroup = (groupId: string): Group | null => chordStore.groups.find(g => g.id === groupId) ?? null;

const getGroupMenuItems = (group: Group): ContextMenuItem[] => {
  const cached = groupMenuItemsMap.get(group.id);
  if (cached) return cached;
  const items: ContextMenuItem[] = [
    {
      label: '修改名称',
      icon: SquarePen,
      action: () => {
        const g = resolveGroup(group.id);
        if (g) emit('open-rename', g);
      },
    },
    {
      label: '和弦排序',
      icon: ArrowUpDown,
      disabled: getGroupChordsCount(group.id) === 0,
      action: () => {
        const g = resolveGroup(group.id);
        if (g) emit('open-sort', g);
      },
    },
    {
      label: '删除分组',
      icon: Trash2,
      danger: true,
      action: () => {
        const g = resolveGroup(group.id);
        if (g) emit('open-delete', g);
      },
    },
  ];
  groupMenuItemsMap.set(group.id, items);
  return items;
};
</script>
