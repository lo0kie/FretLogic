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
          <!-- 1. 标题行 -->
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

              <!-- 右侧 Badge 组 -->
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

          <!-- 2. 折叠区内容组件 -->
          <LeftChordGroupContent
            :ref="el => setContentOuterRef(el, index)"
            :group="group"
            :search-query="searchQuery"
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

// 分组标题行的单列垂直导航（1列）
// 用原生 div 包裹 VueDraggable，避免拿到组件实例而非 DOM 节点
// selector 限定只收集分组标题行，避免把展开分组内的和弦卡片一并扫入
// stop: true 防止事件继续冒泡（此处已是最外层，主要是保持语义一致）
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
    return;
  }
  editorStore.setEditor(chord);
};

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

const getMatchCount = (groupId: string): number => {
  return matchCountMap.value.get(groupId) || 0;
};

const hasMatchedChords = (groupId: string): boolean => {
  return getMatchCount(groupId) > 0;
};

const matchCountMap = computed(() => {
  const map = new Map<string, number>();
  filteredChordsMap.value.forEach((chords, groupId) => {
    map.set(groupId, chords.length);
  });
  return map;
});

const filteredChordsMap = computed(() => {
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
  gap: 0.5rem;
  position: relative;
  box-sizing: border-box;
}

.group-box-card {
  display: flex;
  flex-direction: column;
  width: 100%;
  box-sizing: border-box;
  scroll-margin-top: 0.8rem;
}

.group-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0.5rem;
  user-select: none;
  background-color: transparent;
  border-radius: @radius-md;
  box-sizing: border-box;
  cursor: pointer;
  border: 1px solid transparent;
  transition: @transition-fast;
  outline: none;

  &:hover {
    background-color: var(--bg-panel-hover);
  }

  &:hover,
  &:active,
  &.is-context-open {
    background-color: var(--bg-panel-hover) !important;
    border-color: var(--border-base);
  }

  &.is-expanded {
    background-color: color-mix(in srgb, var(--bg-panel-hover), transparent 50%);
    border-color: var(--border-light);
    border-width: 1px;
  }
}

.group-info-zone {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
}

.arrow-toggle-icon {
  color: var(--text-disabled);
  flex-shrink: 0;
  transition:
    transform @duration-fast @bezier-standard,
    color @duration-fast ease;

  &.is-collapsed {
    transform: rotate(-90deg);
  }
}

.group-name-text {
  font-weight: 700;
  font-size: 0.82rem;
  user-select: none;
  letter-spacing: 1px;
  color: var(--text-body);
  transition: color @duration-fast ease;
}

.group-badges-zone {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}
</style>
