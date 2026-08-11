<template>
  <EmptyState v-if="chordStore.groups.length === 0" :icon="FolderOpen" description="还没有添加分组" size="md" />
  <div v-else ref="groupListContainerRef" @keydown="handleKeydown">
    <VueDraggable
      :model-value="chordStore.groups"
      @update:modelValue="(val: Group[]) => chordStore.overwriteGroups(val)"
      :animation="200"
      handle=".group-title-row"
      :disabled="!isAllCollapsed || Boolean(searchQuery) || uiStore.isMobile"
      class="draggable-list"
      ghost-class="drag-ghost-style"
      chosen-class="drag-chosen-style"
      drag-class="drag-active-style"
      :touchStartThreshold="12"
      :swap-threshold="0.5"
    >
      <div v-for="(group, index) in chordStore.groups" :key="group.id" class="group-box-card" ref="groupCardEls">
        <GlobalContextMenu :items="getGroupMenuItems(group)" #default="{ isOpen }">
          <div
            v-wave
            tabindex="0"
            data-focusable-inline
            role="button"
            :aria-expanded="isGroupContentOpen(group)"
            :aria-label="`${group.name} 分组，共 ${getGroupChordsCount(group.id)} 个和弦，${group.collapsed ? '已折叠' : '已展开'}`"
            @click="chordActions.executeGroupToggle(group)"
            @keydown.enter.prevent="chordActions.executeGroupToggle(group)"
            @keydown.space.prevent="chordActions.executeGroupToggle(group)"
            class="group-title-row"
            :class="{
              'is-expanded': isGroupContentOpen(group),
              'is-context-open': isOpen,
            }"
          >
            <div class="group-info-zone" title="点击折叠/展开分组">
              <ChevronDown
                :size="14"
                :stroke-width="2.5"
                class="arrow-toggle-icon"
                :class="{ 'is-collapsed': !isGroupContentOpen(group) }"
                aria-hidden="true"
              />
              <BaseMarquee>
                <span class="group-name-text">{{ group.name }}</span>
              </BaseMarquee>
              <div class="group-badges-zone">
                <BaseBadge
                  variant="neutral"
                  appearance="outline"
                  size="xs"
                  class="sort-rule-badge"
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
                  <span :class="{ 'search-match-count': hasMatchedChords(group.id) }">
                    {{ getMatchCount(group.id) }}
                  </span>
                  <span aria-hidden="true">&nbsp;/&nbsp;{{ getGroupChordsCount(group.id) }}</span>
                </BaseBadge>
                <BaseBadge
                  v-else
                  variant="neutral"
                  :appearance="isGroupContentOpen(group) ? 'subtle' : 'filled'"
                  size="xs"
                  width="1.5rem"
                  class="count-badge"
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
            @delete-chord="handleLocalDeleteChord"
            @select-chord="handleSelectChord"
          />
        </GlobalContextMenu>
      </div>
    </VueDraggable>
  </div>
</template>
<script setup lang="ts">
import BaseBadge from '@/components/BaseBadge.vue';
import BaseMarquee from '@/components/BaseMarquee.vue';
import EmptyState from '@/components/EmptyState.vue';
import GlobalContextMenu, { type ContextMenuItem } from '@/components/GlobalContextMenu.vue';
import { useChordActions } from '@/services/useChordActions.ts';
import { useGridNavigation } from '@/services/useGridNavigation';
import { useEditorStore } from '@/stores/chordEditorStore';
import { useChordStore } from '@/stores/chordStore';
import { useUiStore } from '@/stores/uiStore';
import type { Chord, Group, GroupedChordCard } from '@/types';
import { ArrowUpDown, ChevronDown, FolderOpen, SquarePen, Trash2 } from '@lucide/vue';
import { computed, nextTick, useTemplateRef, watch, type ComponentPublicInstance } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import LeftChordGroupContent from './LeftChordGroupContent.vue';

const props = defineProps<{
  searchQuery: string;
}>();
const emit = defineEmits<{
  (e: 'open-rename', group: Group): void;
  (e: 'open-delete', group: Group): void;
  (e: 'open-move', chord: Chord): void;
  (e: 'open-sort', group: Group): void;
  (e: 'open-delete-variants', cardData: GroupedChordCard): void;
}>();

const editorStore = useEditorStore();
const chordStore = useChordStore();
const chordActions = useChordActions();
const uiStore = useUiStore();

const groupListContainerRef = useTemplateRef<HTMLElement>('groupListContainerRef');
const groupCardEls = useTemplateRef<HTMLElement[]>('groupCardEls');
const contentOuterComponentEls = new Map<number, ComponentPublicInstance | Element | null>();

const { handleKeydown } = useGridNavigation(1, groupListContainerRef, {
  selector: '.group-title-row',
  stop: true,
});

const setContentOuterRef = (el: Element | ComponentPublicInstance | null, index: number) => {
  if (el) contentOuterComponentEls.set(index, el);
  else contentOuterComponentEls.delete(index);
};

const isGroupContentOpen = (group: Group): boolean => !group.collapsed;
const isAllCollapsed = computed(() => chordStore.groups.every(g => g.collapsed));

const handleSelectChord = (chord: Chord) => {
  if (editorStore.draftChord.id === chord.id) {
    editorStore.resetEditor();
  } else {
    editorStore.setEditor(chord);
    if (uiStore.isMobile && uiStore.isLeftOpen) uiStore.isLeftOpen = false;
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

const getMatchCount = (groupId: string): number => groupMatchCountsMap.value.get(groupId) ?? 0;
const hasMatchedChords = (groupId: string): boolean => getMatchCount(groupId) > 0;

const getSortLabel = (group: Group): string => {
  switch (group.sortRule) {
    case 'ROOT_PITCH':
      return 'C-B';
    case 'KEY_DEGREE':
      return `${group.sortKey}调`;
    case 'NAME_ASC':
      return 'A-Z';
    default:
      return 'C-B';
  }
};

const getGroupChordsCount = (groupId: string) => {
  return chordStore.groupChordMap.get(groupId)?.length ?? 0;
};

const handleLocalDeleteChord = (chord: Chord) => {
  const isEditingCurrent = editorStore.draftChord.id === chord.id;
  chordActions.triggerDeleteChord(chord);
  if (isEditingCurrent) editorStore.resetEditor();
};

const getGroupMenuItems = (group: Group): ContextMenuItem[] => [
  {
    label: '修改名称',
    icon: SquarePen,
    action: () => emit('open-rename', group),
  },
  {
    label: '和弦排序',
    icon: ArrowUpDown,
    action: () => emit('open-sort', group),
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
    if (!newId) return;
    await nextTick();
    const idx = chordStore.groups.findIndex(g => g.id === newId);
    if (idx === -1) return;
    const targetElement = groupCardEls.value?.[idx];
    const contentComponent = contentOuterComponentEls.get(idx);
    if (!targetElement) return;
    const scrollToShowContent = () => {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    if (!contentComponent) {
      scrollToShowContent();
      return;
    }
    const contentOuter = ('$el' in contentComponent ? contentComponent.$el : contentComponent) as HTMLElement | null;
    if (!contentOuter) {
      scrollToShowContent();
      return;
    }
    const handleTransitionEnd = (e: TransitionEvent) => {
      if (e.propertyName !== 'grid-template-rows') return;
      contentOuter.removeEventListener('transitionend', handleTransitionEnd);
      scrollToShowContent();
    };
    contentOuter.addEventListener('transitionend', handleTransitionEnd);
  }
);
</script>
<style scoped lang="less">
@import '@/assets/tokens.module';
.draggable-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  box-sizing: border-box;
}

.group-box-card {
  box-sizing: border-box;
}

.group-title-row {
  height: 2.2rem;
  padding-left: 0.65rem;
  padding-right: 0.65rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  border-radius: @radius-md;
  user-select: none;
  box-sizing: border-box;
  transition: @transition-fast;
  outline: none;
  &:hover,
  &.is-context-open {
    background-color: var(--bg-panel-hover);
    .arrow-toggle-icon {
      color: var(--text-title);
    }
  }
  &.is-expanded {
    .arrow-toggle-icon {
      color: var(--color-primary);
    }
  }
}
.group-info-zone {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
  flex: 1;
}
.arrow-toggle-icon {
  color: var(--text-disabled);
  transition: transform @duration-fast ease;
  flex-shrink: 0;
  &.is-collapsed {
    transform: rotate(-90deg);
  }
}
.group-name-text {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-title);
  white-space: nowrap;
}
.group-badges-zone {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-left: auto;
  flex-shrink: 0;
}
.sort-rule-badge {
  font-size: 0.55rem;
  opacity: 0.8;
}
.count-badge {
  font-family: monospace;
}
.search-match-count {
  font-weight: 800;
}
@media (max-width: 768px) {
  .group-title-row {
    height: 2.85rem;
    padding-left: 0.85rem;
    padding-right: 0.85rem;
    border-radius: calc(@radius-lg * 1.2);
  }
  .group-name-text {
    font-size: 0.92rem;
  }
  .sort-rule-badge {
    font-size: 0.68rem;
  }
  .count-badge {
    font-size: 0.75rem;
  }
}
</style>
