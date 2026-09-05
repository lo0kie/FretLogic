<template>
  <aside
    v-bind="$attrs"
    :aria-label="route.path === '/score' ? '乐谱库' : '指法库'"
    :style="{
      width: LEFT_SIDEBAR_WIDTH_PIXEL,
      transform: uiStore.isLeftOpen ? 'translateX(0)' : 'translateX(-100%)',
      opacity: uiStore.isLeftOpen ? 1 : 0,
      pointerEvents: uiStore.isLeftOpen ? 'auto' : 'none',
      boxShadow: uiStore.isLeftOpen ? 'var(--shadow-panel)' : 'none',
    }"
    class="panel-left z-sidebar bg-bg-panel/90 border-glass-border duration-slow ease-sidebar absolute top-0 bottom-0 left-0 box-border flex h-full flex-col overflow-hidden border-r backdrop-blur-xl transition-[transform,opacity] will-change-transform"
  >
    <div
      class="panel-header px-lg border-glass-border gap-sm box-border flex h-10 shrink-0 items-center justify-between border-b"
    >
      <div
        v-if="route.path === '/workbench'"
        class="v-fade-in-quick gap-sm flex w-full min-w-0 items-center justify-between"
        key="workbench"
      >
        <BaseInput
          v-model="searchQuery"
          :disabled="chordStore.savedChordsList.length === 0"
          :maxlength="15"
          clearable
          show-count
          class="header-search-input min-w-0 flex-1"
          font-size="xs"
          placeholder="搜索和弦..."
          prefix-icon="search"
        />

        <div class="header-actions gap-xs flex shrink-0 items-center">
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
        v-else-if="route.path === '/score'"
        class="v-fade-in-quick gap-sm flex w-full min-w-0 items-center justify-between"
        key="score"
      >
        <div class="header-title-zone gap-sm flex min-w-0 items-center">
          <span class="sidebar-title text-text-title text-xs font-bold tracking-tight whitespace-nowrap">乐谱列表</span>
          <BaseBadge appearance="filled" size="xs" variant="neutral">
            {{ songStore.songs.length }}
          </BaseBadge>
        </div>

        <div class="header-actions gap-xs flex shrink-0 items-center">
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
      <div class="scroll-body no-scrollbar p-md box-border flex-1 overflow-y-auto" ref="scrollRef">
        <KeepAlive :max="12">
          <GroupSection
            v-if="route.path === '/workbench'"
            :search-query
            @open-delete="groupModals.openDelete"
            @open-delete-variants="groupModals.openChordVariantsDelete"
            @open-move="groupModals.openMove"
            @open-references="groupModals.openChordReferences"
            @open-rename="groupModals.openRename"
            @open-sort="groupModals.openSort"
            key="workbench"
          />

          <SongSection
            v-else-if="route.path === '/score'"
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

    <div class="left-panel-footer p-md px-lg border-glass-border box-border w-full shrink-0 border-t">
      <input @change="handleFileChange" accept=".json" class="hidden-input hidden" ref="fileInputRef" type="file" />

      <div class="footer-actions-row gap-md box-border grid grid-cols-2 items-stretch">
        <ActionButton @click="handleImportTrigger" icon="download" label="导入备份" width="100%" />
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
import { useBackupModals } from '@/app/modals/useBackupModals';
import ChordModalsContainer from '@/domains/chord/library/components/ChordModalsContainer.vue';
import GroupModalsContainer from '@/domains/chord/library/components/GroupModalsContainer.vue';
import GroupSection from '@/domains/chord/library/components/GroupSection.vue';
import { useChordGroupModals } from '@/domains/chord/library/composables/useChordGroupModals';
import { CHORD_REFERENCE_LOOKUP } from '@/domains/chord/library/injectionKeys';
import { useChordStore } from '@/domains/chord/store/chordStore';
import SongModalsContainer from '@/domains/score/library/components/SongModalsContainer.vue';
import SongSection from '@/domains/score/library/components/SongSection.vue';
import { useSongModals } from '@/domains/score/library/composables/useSongModals';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { useScrollEdgeFades } from '@/platform/composables/useScrollEdgeFades';
import { useUiStore } from '@/platform/store/uiStore';
import BaseBadge from '@/platform/ui/badge/BaseBadge.vue';
import ActionButton from '@/platform/ui/button/ActionButton.vue';
import { type ContextMenuItem } from '@/platform/ui/context-menu/ContextMenuItems.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import type { IconName } from '@/platform/ui/icons/icons.registry';
import BaseInput from '@/platform/ui/input/BaseInput.vue';
import PopoverMenu from '@/platform/ui/popover/PopoverMenu.vue';
import { LEFT_SIDEBAR_WIDTH_PIXEL } from '@/platform/utils/constants';

defineOptions({ inheritAttrs: false });

const searchQuery = ref('');
const fileInputRef = useTemplateRef<HTMLInputElement>('fileInputRef');
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

provide('groupModals', groupModals);
// 跨领域桥接：和弦卡「引用反查」的能力实现由应用层注入（内部走乐谱域 songStore）
provide(CHORD_REFERENCE_LOOKUP, (chordIds: string[]) => songStore.getChordReferences(chordIds).length);
provide('songModals', songModals);
provide('backupModals', backupModals);

/** 用户点击"导入备份"：触发隐藏的文件选择框 */
const handleImportTrigger = () => fileInputRef.value?.click();

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

/** 用户选定备份文件后交给备份弹窗流程处理；完成后清空 input 以便重复导入同一文件 */
const handleFileChange = async (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (!target.files?.length) return;
  const file = target.files[0];
  if (!file) return;
  const resetInput = () => {
    if (fileInputRef.value) fileInputRef.value.value = '';
  };
  await backupModals.handleFileChange(file, resetInput);
};
</script>
