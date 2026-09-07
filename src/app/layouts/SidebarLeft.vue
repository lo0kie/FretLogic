<template>
  <aside
    v-bind="$attrs"
    :aria-label="route.path === ROUTE_PATHS.SCORE ? '乐谱库' : '指法库'"
    :style="{
      width: LEFT_SIDEBAR_WIDTH_PIXEL,
      transform: uiStore.isLeftOpen ? 'translateX(0)' : 'translateX(-100%)',
      opacity: uiStore.isLeftOpen ? 1 : 0,
      pointerEvents: uiStore.isLeftOpen ? 'auto' : 'none',
      boxShadow: uiStore.isLeftOpen ? 'var(--shadow-panel)' : 'none',
    }"
    class="panel-left absolute inset-y-0 left-0 z-sidebar box-border flex h-full flex-col overflow-hidden border-r border-glass-border bg-surface-panel/90 backdrop-blur-xl transition-[transform,opacity] duration-slow ease-sidebar will-change-transform"
  >
    <div
      class="panel-header box-border flex h-10 shrink-0 items-center justify-between gap-sm border-b border-glass-border px-lg"
    >
      <div
        v-if="route.path === ROUTE_PATHS.WORKBENCH"
        class="v-fade-in-quick flex w-full min-w-0 items-center justify-between gap-sm"
        key="workbench"
      >
        <BaseInput
          v-model="searchQuery"
          :search-item-count="searchResults.length"
          @select-search-index="handleSelectSearchIndex($event)"
          clearable
          searchable
          class="header-search-input min-w-0 flex-1"
          font-size="xs"
          placeholder="搜索和弦..."
          prefix-icon="search"
          size="sm"
          title="搜索和弦（支持名称与和弦级数检索）"
        >
          <template #search-results="{ query, close, activeIndex, setActiveIndex }">
            <template v-if="query.trim()">
              <div v-if="searchResults.length > 0" class="flex flex-col gap-0.5">
                <button
                  v-wave
                  v-for="(item, itemIndex) in searchResults"
                  :class="[
                    itemIndex === activeIndex
                      ? 'bg-primary/12 text-primary'
                      : isCardActive(item.card)
                        ? 'bg-primary/8 text-primary'
                        : 'text-fg-title hover:bg-surface-panel-hover',
                  ]"
                  :key="item.card.mainChord.id"
                  :title="getSearchItemTitle(item)"
                  @click="
                    selectSearchResult(item.card);
                    searchQuery = '';
                    close();
                  "
                  @mouseenter="setActiveIndex(itemIndex)"
                  class="flex min-h-[2rem] w-full cursor-pointer items-center justify-between rounded-md border-none px-2.5 py-1 text-left transition-colors duration-fast ease-out outline-none select-none"
                  type="button"
                >
                  <!-- 左侧：和弦名（首字绝对左对齐） + 激活标记（紧贴和弦名后缀，不顶开左右边缘） -->
                  <span class="flex min-w-0 flex-1 items-center gap-1.5 py-0.5 leading-normal">
                    <span class="truncate text-xs/normal font-semibold">
                      <span v-chord-name="{ chord: item.card.mainChord }" />
                    </span>
                    <BaseIcon
                      v-if="isCardActive(item.card)"
                      aria-hidden="true"
                      class="shrink-0 text-primary"
                      icon-size="xl"
                      icon-stroke="bold"
                      name="check"
                      title="当前正在编辑的和弦"
                    />
                  </span>

                  <!-- 右侧：指法数微徽标与分组名（右边缘绝对对齐） -->
                  <span class="flex shrink-0 items-center gap-1.5 text-2xs/normal">
                    <BaseBadge
                      v-if="item.card.variantCount > 1"
                      :title="`共 ${item.card.variantCount}个指法`"
                      appearance="subtle"
                      size="2xs"
                      variant="primary"
                    >
                      {{ item.card.variantCount }}指法
                    </BaseBadge>

                    <span
                      :title="`所属分组：${item.groupName}`"
                      class="max-w-[40px] truncate py-0.5 text-2xs/normal font-semibold text-fg-disabled"
                    >
                      {{ item.groupName }}
                    </span>
                  </span>
                </button>
              </div>

              <!-- 搜索无结果：复用通用空状态（search 预设） -->
              <EmptyState v-else :description="noResultText" size="sm" type="search" />
            </template>

            <!-- 未输入时的引导提示：复用通用空状态 -->
            <EmptyState v-else description="输入和弦名称搜索..." icon="search" size="sm" />
          </template>
        </BaseInput>

        <div class="header-actions flex shrink-0 items-center gap-xs">
          <ActionButton
            v-tooltip="'新建分组'"
            @click="groupModals.openCreate"
            icon-only
            aria-label="新建分组"
            icon="plus"
            icon-size="xl"
            icon-stroke="regular"
            variant="ghost"
          />
        </div>
      </div>

      <div
        v-else-if="route.path === ROUTE_PATHS.SCORE"
        class="v-fade-in-quick flex w-full min-w-0 items-center justify-between gap-sm"
        key="score"
      >
        <div class="header-title-zone flex min-w-0 items-center gap-sm">
          <span class="sidebar-title text-xs font-bold tracking-tight whitespace-nowrap text-fg-title">乐谱列表</span>
          <BaseBadge appearance="filled" size="xs" variant="neutral">
            {{ songStore.songs.length }}
          </BaseBadge>
        </div>

        <div class="header-actions flex shrink-0 items-center gap-xs">
          <PopoverMenu
            :items="songSortMenuItems"
            aria-label="切换乐谱排序方式"
            placement="bottom"
            title="切换乐谱排序方式"
          >
            <template #icon>
              <BaseIcon :name="currentSortIcon" icon-size="xl" icon-stroke="regular" />
            </template>
          </PopoverMenu>

          <ActionButton
            v-tooltip="'新建乐谱'"
            @click="songModals.openCreateSongModal"
            icon-only
            aria-label="新建乐谱"
            icon="plus"
            icon-size="xl"
            icon-stroke="regular"
            variant="ghost"
          />
        </div>
      </div>
    </div>

    <div
      class="left-group-list-container left-group-list relative box-border flex min-h-0 w-full flex-1 flex-col overflow-hidden"
    >
      <div
        v-scrollbar="{ onScroll: closeAllPopovers }"
        class="scroll-body no-scrollbar box-border flex-1 overflow-y-auto p-md"
        ref="scrollRef"
      >
        <KeepAlive :max="12">
          <GroupSection
            v-if="route.path === ROUTE_PATHS.WORKBENCH"
            @open-delete="groupModals.openDelete"
            @open-delete-variants="groupModals.openChordVariantsDelete"
            @open-move="groupModals.openMove"
            @open-references="groupModals.openChordReferences"
            @open-rename="groupModals.openRename"
            @open-sort="groupModals.openSort"
            key="workbench"
          />

          <SongSection
            v-else-if="route.path === ROUTE_PATHS.SCORE"
            @open-clear="songModals.openClear"
            @open-config="songModals.openConfig"
            key="score"
          />
        </KeepAlive>
      </div>

      <!-- 顶部/底部滚动渐隐 -->
      <component :is="topFade" />
      <component :is="bottomFade" />
    </div>

    <div class="left-panel-footer box-border w-full shrink-0 border-t border-glass-border p-md px-lg">
      <div class="footer-actions-row box-border grid grid-cols-2 items-stretch gap-md">
        <ActionButton @click="handleImportTrigger()" icon="download" label="导入备份" width="100%" />
        <ActionButton @click="backupModals.openExport" icon="upload" label="导出备份" width="100%" />
      </div>
    </div>
  </aside>

  <GroupModalsContainer />
  <ChordModalsContainer />
  <ChordReferencesModal />
  <SongModalsContainer />
  <BackupModalsContainer />
</template>

<script setup lang="ts">
import { computed, nextTick, provide, ref, useTemplateRef, watch } from 'vue';

import { useRoute } from 'vue-router';

import BackupModalsContainer from '@/app/modals/BackupModalsContainer.vue';
import ChordReferencesModal from '@/app/modals/ChordReferencesModal.vue';
import ChordModalsContainer from '@/domains/chord/library/components/ChordModalsContainer.vue';
import GroupModalsContainer from '@/domains/chord/library/components/GroupModalsContainer.vue';
import GroupSection from '@/domains/chord/library/components/GroupSection.vue';
import SongModalsContainer from '@/domains/score/library/components/SongModalsContainer.vue';
import SongSection from '@/domains/score/library/components/SongSection.vue';
import BaseBadge from '@/platform/ui/badge/BaseBadge.vue';
import ActionButton from '@/platform/ui/button/ActionButton.vue';
import EmptyState from '@/platform/ui/feedback/EmptyState.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import BaseInput from '@/platform/ui/input/BaseInput.vue';
import PopoverMenu from '@/platform/ui/popover/PopoverMenu.vue';
import { useBackupModals } from '@/app/modals/useBackupModals';
import { useChordGroupModals } from '@/domains/chord/library/composables/useChordGroupModals';
import { CHORD_REFERENCE_LOOKUP } from '@/domains/chord/library/injectionKeys';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { getChordName } from '@/domains/chord/theory/theory';
import { useSongModals } from '@/domains/score/library/composables/useSongModals';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { useScrollEdgeFades } from '@/platform/composables/useScrollEdgeFades';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { useUiStore } from '@/platform/store/uiStore';
import { closeAllPopovers } from '@/platform/ui/popover/popoverRegistry';
import { LEFT_SIDEBAR_WIDTH_PIXEL, ROUTE_PATHS } from '@/platform/utils/constants';
import { pickFile } from '@/platform/utils/filePicker';

import type { GroupedChordCard } from '@/domains/chord/types';
import type { ContextMenuItem } from '@/platform/ui/context-menu/ContextMenuItems.vue';
import type { IconName } from '@/platform/ui/icons/icons.registry';

defineOptions({ inheritAttrs: false });

const searchQuery = ref('');
const settingsStore = useSettingsStore();

/** 搜索无结果文案：含当前查询词，抽出 computed 避免模板内长串 */
const noResultText = computed(() => `未找到与“${searchQuery.value.trim()}”相关的和弦`);

const getSearchItemTitle = (item: { card: GroupedChordCard; groupName: string }) => {
  const chordName = getChordName(item.card.mainChord, {
    shorthand: settingsStore.workbenchChordShorthand,
  });
  const parts = [chordName, `分组：${item.groupName}`];
  if (item.card.variantCount > 1) {
    parts.push(`共 ${item.card.variantCount} 个指法`);
  }
  if (isCardActive(item.card)) {
    parts.push('当前编辑中');
  }
  return parts.join(' · ');
};

const handleSelectSearchIndex = (index: number) => {
  const item = searchResults.value[index];
  if (item) selectSearchResult(item.card);
  // 选中后清空搜索词：下拉随 v-model 清空自然收敛，输入框回到待搜索状态
  searchQuery.value = '';
};

const scrollRef = useTemplateRef<HTMLElement>('scrollRef');

const route = useRoute();
const uiStore = useUiStore();
const chordStore = useChordStore();
const songStore = useSongStore();

const { topFade, bottomFade, syncEdgeFades } = useScrollEdgeFades(scrollRef);

// 两个 section（KeepAlive）共用同一个滚动容器，滚动位置无法随组件 DOM 天然保持：
// 按路由 key 手动缓存 scrollTop，切走时保存、切回时在内容重挂载后恢复
const SCROLL_CACHE = new Map<string, number>();

watch(
  () => route.path,
  (next, prev) => {
    if (prev) SCROLL_CACHE.set(prev, scrollRef.value?.scrollTop ?? 0);
    nextTick(() => {
      const el = scrollRef.value;
      if (!el) return;
      el.scrollTop = SCROLL_CACHE.get(next) ?? 0;
      syncEdgeFades();
    });
  }
);

watch(
  () => uiStore.isLeftOpen,
  isOpen => {
    if (isOpen) {
      nextTick(syncEdgeFades);
    }
  }
);

const groupModals = useChordGroupModals();
const songModals = useSongModals();
const backupModals = useBackupModals();
const editorStore = useChordEditorStore();

/** 搜索下拉：按卡片（多指法合并）匹配，附带分组名，截取前 30 张；
 *  收敛为单次 computed 计算，避免同一输入事件触发多次全库扫描 */
const SEARCH_RESULT_LIMIT = 30;
const searchResults = computed(() => {
  const q = searchQuery.value.trim();
  const items: { card: GroupedChordCard; groupName: string }[] = [];
  for (const group of chordStore.groups) {
    for (const card of chordStore.getGroupedCards(group.id, q)) {
      items.push({ card, groupName: group.name });
      if (items.length >= SEARCH_RESULT_LIMIT) return items;
    }
  }
  return items;
});

/** 卡片是否为正在编辑的和弦（主和弦或任一变体指法命中编辑器草稿） */
const isCardActive = (card: GroupedChordCard) => {
  const draftId = editorStore.draftChord.id;
  return Boolean(draftId) && (card.mainChord.id === draftId || card.variants.some(v => v.id === draftId));
};

/** 选中搜索结果：载入主和弦 + 切换到所在分组（单展开模式）；
 *  分组行视口对焦由 GroupSection 分组行上的 v-scroll-into-view 声明式响应激活态完成 */
const selectSearchResult = (card: GroupedChordCard) => {
  editorStore.setEditor(card.mainChord);
  chordStore.selectAndExpandGroup(card.mainChord.groupId);
};

provide('groupModals', groupModals);
// 跨领域桥接：和弦卡「引用反查」的能力实现由应用层注入（内部走乐谱域 songStore）
provide(CHORD_REFERENCE_LOOKUP, (chordIds: string[]) => songStore.getChordReferences(chordIds).length);
provide('songModals', songModals);
provide('backupModals', backupModals);

/** 用户点击"导入备份"：pickFile 打开系统文件选择框，选出 .json 备份后交给备份流程处理 */
const handleImportTrigger = async () => {
  const file = await pickFile({ accept: '.json' });
  if (!file) return;
  await backupModals.handleFileChange(file, () => {});
};

/** 乐谱排序菜单（交互参考主题切换：Popover + 菜单项，选中项带勾选标记） */
const songSortMenuItems = computed<ContextMenuItem[]>(() => [
  {
    label: '手动排序',
    icon: 'list',
    color: 'var(--text-title)',
    checked: songStore.songSortMethod === 'manual',
    action: () => songStore.setSongSortMethod('manual'),
  },
  {
    label: '拼音分组',
    icon: 'type',
    color: 'var(--color-primary)',
    checked: songStore.songSortMethod === 'title',
    action: () => songStore.setSongSortMethod('title'),
  },
  {
    label: '创建时间',
    icon: 'clock',
    color: 'var(--color-success)',
    checked: songStore.songSortMethod === 'createdAt',
    action: () => songStore.setSongSortMethod('createdAt'),
  },
]);

const SORT_ICON_MAP: Record<string, IconName> = {
  title: 'type',
  createdAt: 'clock',
};

/** 排序按钮图标随当前排序方式切换（与菜单项图标一致），颜色保持默认不换 */
const currentSortIcon = computed<IconName>(() => SORT_ICON_MAP[songStore.songSortMethod] ?? 'list');
</script>
