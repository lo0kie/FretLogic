<template>
  <Feedback v-if="chordStore.groups.length === 0" description="还没有添加分组" icon="folder-open" />
  <div v-else v-grid-nav.stop="{ cols: 1, selector: '.group-title-row' }">
    <div class="draggable-list flex flex-col gap-sm" ref="groupListRef">
      <div v-for="(group, index) in chordStore.groups" :key="group.id">
        <BaseMenu #="{ isOpen }" :items="getGroupMenuItems(group)" trigger="contextmenu">
          <!-- 头部复用 BaseCollapse：点击/键盘切换、aria-expanded、chevron 旋转全部内聚在组件内；
               class/data-*/aria-* 经 $attrs 落到头部按钮本体（拖拽把手、键盘导航标记、状态 tint）。
               px-3 覆盖内置 px-2：Tailwind 同工具类按数值升序产出，px-3 必然在样式表中靠后 -->
          <BaseCollapse
            v-scroll-into-view.y.settle="group.id === editorStore.draftChord.groupId"
            :aria-label="groupTitleAriaLabel(group)"
            :class="[
              'group-title-row h-[2.4rem] border border-transparent px-3 transition-all duration-fast hover:border-border-base',
              isGroupContentOpen(group) ? 'bg-tint-panelhover-50!' : '',
              isOpen ? 'bg-tint-panelhover-30!' : '',
            ]"
            :data-group-id="group.id"
            :expanded="isGroupContentOpen(group)"
            @update:expanded="chordActions.executeGroupToggle(group)"
            data-focusable-inline
            initial-auto
            unpadded
          >
            <template #title>
              <div v-marquee.fade title="点击折叠/展开分组">
                <span class="text-xs font-bold whitespace-nowrap text-fg-title">
                  {{ group.name }}
                </span>
              </div>
            </template>

            <template #trailing>
              <div class="flex shrink-0 items-center gap-sm">
                <BaseBadge
                  :aria-label="`按${getSortLabel(group)}自动排序`"
                  appearance="outline"
                  class="opacity-80"
                  size="2xs"
                  title="排序方法"
                  variant="neutral"
                  width="2rem"
                >
                  <span v-chord-name="getSortLabel(group)" />
                </BaseBadge>

                <BaseBadge
                  :appearance="isGroupContentOpen(group) ? 'subtle' : 'filled'"
                  :aria-label="chordCountAriaLabel(group)"
                  :title="`${getGroupChordsCount(group.id)} 个和弦`"
                  class="font-mono"
                  size="2xs"
                  variant="neutral"
                  width="1.5rem"
                >
                  {{ getGroupChordsCount(group.id) }}
                </BaseBadge>
              </div>
            </template>

            <!-- 组内容（原 GroupContent 内联合并）：卡片网格 + 空状态；
                 折叠动画由外层 BaseCollapse 的折叠体承担，这里保持纯内容 -->
            <div :ref="el => setContentOuterRef(el, index)" @contextmenu.stop>
              <TransitionGroup
                v-grid-nav.stop="{ cols: GRID_COLS, selector: '.chord-thumb-card' }"
                v-if="getGroupedCards(group).length > 0"
                class="relative z-panel grid min-h-[2.2rem] grid-cols-3 items-center gap-sm px-sm pt-md pb-xs"
                name="v-transition-list"
                tag="div"
              >
                <ChordCard
                  v-for="cardData in getGroupedCards(group)"
                  v-scroll-into-view.y.once="cardData.mainChord.id === getActiveMainId(group)"
                  :card-data
                  :is-active="cardData.mainChord.id === getActiveMainId(group)"
                  :key="cardData.mainChord.id"
                  @delete="handleLocalDeleteChord($event)"
                  @delete-variants="emit('open-delete-variants', $event)"
                  @move="emit('open-move', $event)"
                  @open-references="emit('open-references', $event)"
                  @select="handleSelectChord($event)"
                />
              </TransitionGroup>
              <Feedback v-else description="暂无和弦" size="sm" />
            </div>
          </BaseCollapse>
        </BaseMenu>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';

import ChordCard from '@/domains/chord/library/components/ChordCard.vue';
import BaseBadge from '@/platform/ui/badge/BaseBadge.vue';
import BaseCollapse from '@/platform/ui/collapse/BaseCollapse.vue';
import Feedback from '@/platform/ui/feedback/Feedback.vue';
import BaseMenu from '@/platform/ui/menu/BaseMenu.vue';
import { useChordActions } from '@/domains/chord/library/composables/useChordActions';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { getGroupSortKey } from '@/domains/chord/theory/entityFactories';
import { getChordName } from '@/domains/chord/theory/theory';
import { useChordTransfer } from '@/domains/chord/transfer/useChordTransfer';
import { useSortableList } from '@/platform/composables/useSortableList';

import type { Chord, Group, GroupedChordCard } from '@/domains/chord/types';
import type { MenuItem } from '@/platform/ui/menu/types';
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

const groupListRef = useTemplateRef<HTMLElement>('groupListRef');

const contentOuterComponentEls = new Map<number, ComponentPublicInstance | Element | null>();

/** 按索引登记/注销分组内容组件的实例引用 */
const setContentOuterRef = (el: Element | ComponentPublicInstance | null, index: number) => {
  if (el) contentOuterComponentEls.set(index, el);
  else contentOuterComponentEls.delete(index);
};

// ==================== 组内容（原 GroupContent 内联合并） ====================

/** 卡片网格列数：与 v-grid-nav 的键盘导航配置共用 */
const GRID_COLS = 3;

/** 组内分组卡片数据 */
const getGroupedCards = (group: Group): GroupedChordCard[] => chordStore.getGroupedCards(group.id);

/** 当前激活卡片的主和弦 id：草稿是某变体时映射回主卡；编辑中同名同组草稿也视为激活 */
const getActiveMainId = (group: Group): string | null => {
  const cards = getGroupedCards(group);
  const draft = editorStore.draftChord;
  if (draft.id) {
    for (const card of cards) {
      if (card.variants.some(v => v.id === draft.id)) return card.mainChord.id;
    }
  }

  if (editorStore.isEditing) {
    const draftName = getChordName(draft).trim().toLowerCase();
    if (draftName) {
      for (const card of cards) {
        if (
          card.mainChord.groupId === draft.groupId &&
          getChordName(card.mainChord).trim().toLowerCase() === draftName
        ) {
          return card.mainChord.id;
        }
      }
    }
  }
  return null;
};

/** 分组内容是否展开（store 折叠状态取反） */
const isGroupContentOpen = (group: Group): boolean => !chordStore.isGroupCollapsed(group.id);
const isAllCollapsed = computed(() => chordStore.groups.every(g => chordStore.isGroupCollapsed(g.id)));

// 仅在全部折叠时允许拖拽排序：任一组展开时其内容会撑高行高，拖动会错位。
// Sortable 直接操作 DOM，拖拽结束按索引重排后经 overwriteGroups 持久化；
// 空列表守卫（groups 为空走 Feedback 分支）、容器就绪后再初始化、以及 disabled 的响应式跟随都由 useSortableList 承担。
useSortableList<Group>({
  target: groupListRef,
  items: () => chordStore.groups,
  enabled: computed(() => isAllCollapsed.value),
  handle: '.group-title-row',
  onReorder: next => chordStore.overwriteGroups(next),
});

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
const getGroupMenuItems = (group: Group): MenuItem[] => {
  const items: MenuItem[] = [
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
