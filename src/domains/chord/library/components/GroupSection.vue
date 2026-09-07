<template>
  <EmptyState v-if="chordStore.groups.length === 0" description="还没有添加分组" icon="folder-open" />
  <div v-else v-grid-nav.stop="{ cols: 1, selector: '.group-title-row' }">
    <VueDraggable
      :animation="200"
      :disabled="!isAllCollapsed"
      :model-value="chordStore.groups"
      :swap-threshold="0.5"
      @update:model-value="chordStore.overwriteGroups($event)"
      chosen-class="drag-chosen-style"
      class="draggable-list box-border flex flex-col gap-sm"
      drag-class="drag-active-style"
      ghost-class="drag-ghost-style"
      handle=".group-title-row"
    >
      <div v-for="(group, index) in chordStore.groups" :key="group.id" class="box-border">
        <ContextMenu #="{ isOpen }" :items="getGroupMenuItems(group)">
          <div
            v-wave
            v-scroll-into-view.y="group.id === chordStore.selectedGroupId"
            :aria-expanded="isGroupContentOpen(group)"
            :aria-label="groupTitleAriaLabel(group)"
            :class="{
              'bg-tint-panelhover-50!': isGroupContentOpen(group),
              'bg-tint-panelhover-30!': isOpen,
            }"
            :data-group-id="group.id"
            @click="chordActions.executeGroupToggle(group)"
            @keydown.enter.prevent="chordActions.executeGroupToggle(group)"
            @keydown.space.prevent="chordActions.executeGroupToggle(group)"
            data-focusable-inline
            class="group-title-row group/row box-border flex h-[2.4rem] cursor-pointer items-center justify-between rounded-md border border-transparent px-3 transition-all duration-fast outline-none select-none hover:border-border-base hover:bg-surface-panel-hover"
            role="button"
            tabindex="0"
          >
            <div class="flex min-w-0 flex-1 items-center gap-sm" title="点击折叠/展开分组">
              <BaseIcon
                :class="{ '-rotate-90': !isGroupContentOpen(group) }"
                aria-hidden="true"
                class="shrink-0 text-fg-disabled transition-transform duration-fast group-hover/row:text-fg-title"
                icon-size="sm"
                icon-stroke="regular"
                name="chevron-down"
              />
              <div v-marquee.fade>
                <span class="text-xs font-bold whitespace-nowrap text-fg-title">
                  {{ group.name }}
                </span>
              </div>
              <div class="ml-auto flex shrink-0 items-center gap-sm">
                <BaseBadge
                  :aria-label="`按${getSortLabel(group)}自动排序`"
                  appearance="outline"
                  class="opacity-80"
                  size="xs"
                  title="排序方法"
                  variant="neutral"
                  width="2rem"
                >
                  <span v-chord-name="getSortLabel(group)" />
                </BaseBadge>
                <BaseBadge
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
            :is-open="isGroupContentOpen(group)"
            :ref="el => setContentOuterRef(el, index)"
            @delete-chord="handleLocalDeleteChord($event)"
            @open-delete-variants="emit('open-delete-variants', $event)"
            @open-move="emit('open-move', $event)"
            @open-references="emit('open-references', $event)"
            @select-chord="handleSelectChord($event)"
          />
        </ContextMenu>
      </div>
    </VueDraggable>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { VueDraggable } from 'vue-draggable-plus';

import LeftChordGroupContent from '@/domains/chord/library/components/GroupContent.vue';
import BaseBadge from '@/platform/ui/badge/BaseBadge.vue';
import ContextMenu from '@/platform/ui/context-menu/ContextMenu.vue';
import EmptyState from '@/platform/ui/feedback/EmptyState.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import { useChordActions } from '@/domains/chord/library/composables/useChordActions';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { getGroupSortKey } from '@/domains/chord/theory/entityFactories';
import { useChordTransfer } from '@/domains/chord/transfer/useChordTransfer';

import type { Chord, Group, GroupedChordCard } from '@/domains/chord/types';
import type { ContextMenuItem } from '@/platform/ui/context-menu/ContextMenuItems.vue';
import type { ComponentPublicInstance } from 'vue';

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
const { copyGroupText } = useChordTransfer();

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
      label: '复制分组',
      icon: 'copy',
      action: () => {
        void copyGroupText(group);
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
