<template>
  <EmptyState v-if="chordStore.groups.length === 0" description="还没有添加分组" icon="folder-open" />
  <template v-else>
    <Transition name="v-transition-fade">
      <EmptyState v-if="searchQuery && totalMatchCount === 0" description="未找到匹配的和弦" icon="search" />
    </Transition>
    <div v-grid-nav.stop="{ cols: 1, selector: '.group-title-row' }" v-if="!searchQuery || totalMatchCount > 0">
      <VueDraggable
        :animation="200"
        :disabled="!isAllCollapsed || Boolean(searchQuery)"
        :model-value="chordStore.groups"
        :swap-threshold="0.5"
        @update:model-value="(val: Group[]) => chordStore.overwriteGroups(val)"
        chosen-class="drag-chosen-style"
        class="draggable-list gap-sm box-border flex flex-col"
        drag-class="drag-active-style"
        ghost-class="drag-ghost-style"
        handle=".group-title-row"
      >
        <div v-for="(group, index) in chordStore.groups" :key="group.id" class="box-border">
          <ContextMenu #="{ isOpen }" :items="getGroupMenuItems(group)">
            <div
              v-wave
              :aria-expanded="isGroupContentOpen(group)"
              :aria-label="groupTitleAriaLabel(group)"
              :class="{
                'bg-tint-panelhover-50!': isGroupContentOpen(group),
                'bg-tint-panelhover-30!': isOpen,
              }"
              @click="chordActions.executeGroupToggle(group)"
              @keydown.enter.prevent="chordActions.executeGroupToggle(group)"
              @keydown.space.prevent="chordActions.executeGroupToggle(group)"
              data-focusable-inline
              class="group-title-row group/row duration-fast hover:bg-bg-panel-hover hover:border-border-base box-border flex h-[2.4rem] cursor-pointer items-center justify-between rounded-md border border-transparent px-3 transition-all outline-none select-none"
              role="button"
              tabindex="0"
            >
              <div class="gap-sm flex min-w-0 flex-1 items-center" title="点击折叠/展开分组">
                <BaseIcon
                  :class="{ '-rotate-90': !isGroupContentOpen(group) }"
                  aria-hidden="true"
                  class="text-text-disabled duration-fast group-hover/row:text-text-title shrink-0 transition-transform"
                  icon-size="sm"
                  icon-stroke="regular"
                  name="chevron-down"
                />
                <div v-marquee>
                  <span class="text-text-title text-xs font-bold whitespace-nowrap">
                    {{ group.name }}
                  </span>
                </div>
                <div class="gap-sm ml-auto flex shrink-0 items-center">
                  <BaseBadge
                    :aria-label="`按${getSortLabel(group)}自动排序`"
                    appearance="outline"
                    class="opacity-80"
                    size="xs"
                    title="排序方法"
                    variant="neutral"
                    width="2rem"
                  >
                    <span v-chord-name="{ name: getSortLabel(group) }" />
                  </BaseBadge>
                  <BaseBadge
                    v-if="searchQuery"
                    :appearance="hasMatchedChords(group.id) ? 'subtle' : 'filled'"
                    :aria-label="matchCountAriaLabel(group)"
                    :variant="hasMatchedChords(group.id) ? 'primary' : 'neutral'"
                    size="xs"
                    width="2.5rem"
                  >
                    <span :class="{ 'font-extrabold': hasMatchedChords(group.id) }">
                      {{ getMatchCount(group.id) }}
                    </span>
                    <span aria-hidden="true">&nbsp;/&nbsp;{{ getGroupChordsCount(group.id) }} </span>
                  </BaseBadge>
                  <BaseBadge
                    v-else
                    :appearance="isGroupContentOpen(group) ? 'subtle' : 'filled'"
                    :aria-label="chordCountAriaLabel(group)"
                    class="font-mono"
                    size="xs"
                    variant="neutral"
                    width="1.5rem"
                  >
                    {{ getGroupChordsCount(group.id) }}
                  </BaseBadge>
                </div>
              </div>
            </div>
            <LeftChordGroupContent
              :group
              :search-query
              :is-open="isGroupContentOpen(group)"
              :ref="el => setContentOuterRef(el, index)"
              @delete-chord="handleLocalDeleteChord"
              @open-delete-variants="cardData => emit('open-delete-variants', cardData)"
              @open-move="chord => emit('open-move', chord)"
              @open-references="cardData => emit('open-references', cardData)"
              @select-chord="handleSelectChord"
            />
          </ContextMenu>
        </div>
      </VueDraggable>
    </div>
  </template>
</template>

<script setup lang="ts">
import { computed, type ComponentPublicInstance } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';

import LeftChordGroupContent from '@/domains/chord/library/components/GroupContent.vue';
import { useChordActions } from '@/domains/chord/library/composables/useChordActions';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { getGroupSortKey } from '@/domains/chord/theory/entityFactories';
import type { Chord, Group, GroupedChordCard } from '@/domains/chord/types';
import BaseBadge from '@/platform/ui/badge/BaseBadge.vue';
import ContextMenu from '@/platform/ui/context-menu/ContextMenu.vue';
import type { ContextMenuItem } from '@/platform/ui/context-menu/ContextMenuItems.vue';
import EmptyState from '@/platform/ui/feedback/EmptyState.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';

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

/** 按索引登记/注销分组内容组件的实例引用 */
const setContentOuterRef = (el: Element | ComponentPublicInstance | null, index: number) => {
  if (el) contentOuterComponentEls.set(index, el);
  else contentOuterComponentEls.delete(index);
};

/** 分组内容是否展开（store 折叠状态取反） */
const isGroupContentOpen = (group: Group): boolean => !chordStore.isGroupCollapsed(group.id);
const isAllCollapsed = computed(() => chordStore.groups.every(g => chordStore.isGroupCollapsed(g.id)));

/** 用户点击和弦卡片：若正在编辑同一和弦则退出编辑，否则载入编辑器 */
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

/** 搜索模式下该组匹配的和弦数（无搜索时等于组内总数） */
const getMatchCount = (groupId: string): number => groupMatchCountsMap.value.get(groupId) ?? 0;
/** 该组在当前搜索下是否有匹配和弦 */
const hasMatchedChords = (groupId: string): boolean => getMatchCount(groupId) > 0;

const sortLabelStrategies: Record<Group['sortRule'], (group: Group) => string> = {
  ROOT_PITCH: () => 'C-B',
  KEY_DEGREE: group => `${getGroupSortKey(group) ?? 'C'}调`,
  NAME_ASC: () => 'A-Z',
};

/** 分组排序徽标文案（C-B / X调 / A-Z，随 sortRule 切换） */
const getSortLabel = (group: Group): string => sortLabelStrategies[group.sortRule]?.(group) ?? 'C-B';

/** 组内和弦总数 */
const getGroupChordsCount = (groupId: string) => {
  return chordStore.groupChordMap.get(groupId)?.length ?? 0;
};

/** 分组行无障碍描述：名称、和弦数与展开/折叠状态 */
const groupTitleAriaLabel = (group: Group): string =>
  `${group.name} 分组，共 ${getGroupChordsCount(group.id)} 个和弦，${chordStore.isGroupCollapsed(group.id) ? '已折叠' : '已展开'}`;
/** 匹配计数无障碍描述：本次匹配数与组内总数 */
const matchCountAriaLabel = (group: Group): string =>
  `匹配 ${getMatchCount(group.id)} 个，共 ${getGroupChordsCount(group.id)} 个和弦`;
/** 组内和弦计数无障碍描述：仅显示总数 */
const chordCountAriaLabel = (group: Group): string => `共 ${getGroupChordsCount(group.id)} 个和弦`;

/** 删除和弦：若被删的正是编辑中的和弦，同步清空编辑器 */
const handleLocalDeleteChord = (chord: Chord) => {
  const isEditingCurrent = editorStore.draftChord.id === chord.id;
  chordActions.triggerDeleteChord(chord);
  if (isEditingCurrent) editorStore.resetEditor();
};

// 分组右键菜单项：每次直接构建（仅 3-4 项），不缓存
const getGroupMenuItems = (group: Group): ContextMenuItem[] => {
  const items: ContextMenuItem[] = [
    {
      label: '修改名称',
      icon: 'square-pen',
      action: () => {
        emit('open-rename', group);
      },
    },
    {
      label: '和弦排序',
      icon: 'arrow-up-down',
      disabled: getGroupChordsCount(group.id) === 0,
      action: () => {
        emit('open-sort', group);
      },
    },
    {
      label: '删除分组',
      icon: 'trash-2',
      danger: true,
      action: () => {
        emit('open-delete', group);
      },
    },
  ];
  return items;
};
</script>
