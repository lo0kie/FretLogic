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
          class="header-search-input min-w-0 flex-1"
          clearable
          font-size="xs"
          placeholder="搜索和弦..."
          prefix-icon="search"
          show-count
        />

        <div class="header-actions gap-xs flex shrink-0 items-center">
          <ActionButton
            v-tooltip="'新建分组'"
            @click="groupModals.openCreate"
            aria-label="新建分组"
            icon-only
            variant="ghost"
          >
            <BaseIcon :stroke-width="2.5" name="plus" size="xl" />
          </ActionButton>
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
              <BaseIcon :name="currentSortIcon" :stroke-width="2.5" size="xl" />
            </template>
          </PopoverMenu>

          <ActionButton
            v-tooltip="'新建乐谱'"
            @click="songModals.openCreateSongModal"
            aria-label="新建乐谱"
            icon-only
            variant="ghost"
          >
            <BaseIcon :stroke-width="2.5" name="plus" size="xl" />
          </ActionButton>
        </div>
      </div>
    </div>

    <div
      class="left-group-list-container left-group-list relative box-border flex min-h-0 w-full flex-1 flex-col overflow-hidden"
    >
      <div
        v-scroll-cache="`sidebar-scroll:${route.path}`"
        class="scroll-body no-scrollbar p-md box-border flex-1 overflow-y-auto"
        ref="scrollRef"
      >
        <div v-if="route.path === '/workbench'" class="v-fade-in-quick min-w-0" key="workbench">
          <LeftChordGroupSection
            :search-query="searchQuery"
            @open-delete="groupModals.openDelete"
            @open-delete-variants="groupModals.openChordVariantsDelete"
            @open-move="groupModals.openMove"
            @open-references="groupModals.openChordReferences"
            @open-rename="groupModals.openRename"
            @open-sort="groupModals.openSort"
          />
        </div>

        <div v-else-if="route.path === '/score'" class="v-fade-in-quick min-w-0" key="score">
          <LeftSongListSection @open-clear="songModals.openClear" @open-config="songModals.openConfig" />
        </div>
      </div>

      <!-- 顶部滚动渐隐：仅可上滚时显示，避免未滚动时遮挡首项 -->
      <div
        v-show="!atTop"
        aria-hidden="true"
        class="z-panel pointer-events-none absolute inset-x-0 top-0 h-[20px] [background:linear-gradient(to_bottom,var(--bg-panel),transparent)]"
      />
      <!-- 底部滚动渐隐：仅未滚到底时显示，滚到底时隐藏避免遮挡末项 -->
      <div
        v-show="!atBottom"
        aria-hidden="true"
        class="z-panel pointer-events-none absolute inset-x-0 bottom-0 h-[20px] [background:linear-gradient(to_top,var(--bg-panel),transparent)]"
      />
    </div>

    <div class="left-panel-footer p-md px-lg border-glass-border box-border w-full shrink-0 border-t">
      <input @change="handleFileChange" accept=".json" class="hidden-input hidden" ref="fileInputRef" type="file" />

      <div class="footer-actions-row gap-sm box-border grid grid-cols-2 items-stretch">
        <ActionButton @click="handleImportTrigger" prefix-icon="download" width="100%"> 导入备份 </ActionButton>

        <ActionButton @click="backupModals.openExport" prefix-icon="upload" width="100%"> 导出备份 </ActionButton>
      </div>
    </div>
  </aside>

  <GroupModalsContainer />
  <ChordModalsContainer />
  <SongModalsContainer />
  <BackupModalsContainer />
</template>

<script lang="ts" setup>
import { computed, nextTick, provide, ref, useTemplateRef, watch } from 'vue';
import { useRoute } from 'vue-router';

import BackupModalsContainer from '@/app/modals/BackupModalsContainer.vue';
import ActionButton from '@/components/ui/ActionButton.vue';
import BaseBadge from '@/components/ui/BaseBadge.vue';
import BaseIcon from '@/components/ui/BaseIcon.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import { type ContextMenuItem } from '@/components/ui/context-menu/ContextMenuItems.vue';
import type { IconName } from '@/components/ui/icons.registry';
import PopoverMenu from '@/components/ui/PopoverMenu.vue';
import ChordModalsContainer from '@/features/chord-library/ChordModalsContainer.vue';
import { useChordGroupModals } from '@/features/chord-library/composables/useChordGroupModals';
import GroupModalsContainer from '@/features/chord-library/GroupModalsContainer.vue';
import LeftChordGroupSection from '@/features/chord-library/GroupSection.vue';
import { useSongModals } from '@/features/song-library/composables/useSongModals';
import SongModalsContainer from '@/features/song-library/SongModalsContainer.vue';
import LeftSongListSection from '@/features/song-library/SongSection.vue';
import { useBackupModals } from '@/shared/composables/useBackupModals';
import { useScrollEdgeFades } from '@/shared/composables/useScrollEdgeFades';
import { useChordStore } from '@/stores/chordStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import { LEFT_SIDEBAR_WIDTH_PIXEL } from '@/utils/core/constants';

defineOptions({ inheritAttrs: false });

const searchQuery = ref('');
const fileInputRef = useTemplateRef<HTMLInputElement>('fileInputRef');
const scrollRef = useTemplateRef<HTMLElement>('scrollRef');

const route = useRoute();
const uiStore = useUiStore();
const chordStore = useChordStore();
const songStore = useSongStore();

const { atTop, atBottom, syncEdgeFades } = useScrollEdgeFades(scrollRef);

watch(
  () => route.path,
  () => {
    nextTick(syncEdgeFades);
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
