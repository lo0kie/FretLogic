<template>
  <aside
    class="panel-left absolute top-0 bottom-0 left-0 z-sidebar bg-bg-panel/90 backdrop-blur-xl border-r border-glass-border h-full box-border overflow-hidden flex flex-col will-change-transform transition-[transform,opacity] duration-slow ease-sidebar"
    :aria-label="route.path === '/score' ? '乐谱库' : '指法库'"
    :style="{
      width: LEFT_SIDEBAR_WIDTH_PIXEL,
      transform: uiStore.isLeftOpen ? 'translateX(0)' : 'translateX(-100%)',
      opacity: uiStore.isLeftOpen ? 1 : 0,
      pointerEvents: uiStore.isLeftOpen ? 'auto' : 'none',
      boxShadow: uiStore.isLeftOpen ? 'var(--shadow-panel)' : 'none',
    }"
    v-bind="$attrs"
  >
    <div
      class="panel-header px-lg h-10 border-b border-glass-border flex items-center justify-between gap-sm box-border shrink-0"
    >
      <div
        v-if="route.path === '/workbench'"
        key="workbench"
        class="v-fade-in-quick w-full min-w-0 flex items-center justify-between gap-sm"
      >
        <BaseInput
          v-model="searchQuery"
          :disabled="chordStore.savedChordsList.length === 0"
          placeholder="搜索和弦..."
          clearable
          font-size="xs"
          class="header-search-input flex-1 min-w-0"
          :maxlength="15"
          show-count
        >
          <template #prefix>
            <Search class="search-icon text-text-disabled" :size="14" :stroke-width="2.5" />
          </template>
        </BaseInput>

        <div class="header-actions flex items-center gap-xs shrink-0">
          <ActionButton
            v-tooltip="'新建分组'"
            variant="ghost"
            icon-only
            aria-label="新建分组"
            @click="groupModals.openCreate"
          >
            <Plus :size="16" :stroke-width="2.5" />
          </ActionButton>
        </div>
      </div>

      <div
        v-else-if="route.path === '/score'"
        key="score"
        class="v-fade-in-quick w-full min-w-0 flex items-center justify-between gap-sm"
      >
        <div class="header-title-zone flex items-center gap-sm min-w-0">
          <span class="sidebar-title text-xs font-bold text-text-title tracking-tight whitespace-nowrap">乐谱列表</span>
          <BaseBadge variant="neutral" appearance="filled" size="xs">
            {{ songStore.songs.length }}
          </BaseBadge>
        </div>

        <div class="header-actions flex items-center gap-xs shrink-0">
          <BasePopover trigger="hover" placement="bottom">
            <template #trigger="{ isOpen, pinToggle }">
              <ActionButton
                icon-only
                :variant="isOpen ? 'subtle' : 'ghost'"
                :color="isOpen ? 'primary' : 'default'"
                aria-label="切换乐谱排序方式"
                title="切换乐谱排序方式"
                aria-haspopup="menu"
                :aria-expanded="isOpen"
                @click="pinToggle()"
              >
                <component :is="currentSortIcon" :size="16" :stroke-width="2.5" />
              </ActionButton>
            </template>

            <template #default="{ close }">
              <ContextMenuItems :items="songSortMenuItems" @select="item => (item.action?.(), close())" />
            </template>
          </BasePopover>

          <ActionButton
            v-tooltip="'新建乐谱'"
            variant="ghost"
            icon-only
            aria-label="新建乐谱"
            @click="songModals.openCreateSongModal"
          >
            <Plus :size="16" :stroke-width="2.5" />
          </ActionButton>
        </div>
      </div>
    </div>

    <div
      class="left-group-list-container left-group-list flex flex-col flex-1 min-h-0 overflow-hidden box-border w-full"
    >
      <div
        v-scroll-cache="`sidebar-scroll:${route.path}`"
        class="scroll-body no-scrollbar flex-1 overflow-y-auto p-md box-border"
      >
        <div v-if="route.path === '/workbench'" key="workbench" class="v-fade-in-quick min-w-0">
          <LeftChordGroupSection
            :search-query="searchQuery"
            @open-rename="groupModals.openRename"
            @open-delete="groupModals.openDelete"
            @open-move="groupModals.openMove"
            @open-sort="groupModals.openSort"
            @open-delete-variants="groupModals.openChordVariantsDelete"
            @open-references="groupModals.openChordReferences"
          />
        </div>

        <div v-else-if="route.path === '/score'" key="score" class="v-fade-in-quick min-w-0">
          <LeftSongListSection @open-config="songModals.openConfig" @open-clear="songModals.openClear" />
        </div>
      </div>
    </div>

    <div class="left-panel-footer p-md px-lg border-t border-glass-border box-border shrink-0 w-full">
      <input ref="fileInputRef" type="file" accept=".json" class="hidden-input hidden" @change="handleFileChange" />

      <div class="footer-actions-row grid grid-cols-2 gap-sm items-stretch box-border">
        <ActionButton width="100%" @click="handleImportTrigger">
          <template #prefix>
            <Download :size="13" :stroke-width="2" />
          </template>
          导入备份
        </ActionButton>

        <ActionButton width="100%" @click="backupModals.openExport">
          <template #prefix>
            <Upload :size="13" :stroke-width="2" />
          </template>
          导出备份
        </ActionButton>
      </div>
    </div>
  </aside>

  <GroupModalsContainer />
  <ChordModalsContainer />
  <SongModalsContainer />
  <BackupModalsContainer />
</template>

<script setup lang="ts">
import ActionButton from '@/components/ui/ActionButton.vue';
import BaseBadge from '@/components/ui/BaseBadge.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BasePopover from '@/components/ui/BasePopover.vue';
import ContextMenuItems, { type ContextMenuItem } from '@/components/ui/context-menu/ContextMenuItems.vue';
import { useBackupModals } from '@/shared/composables/useBackupModals';
import { useChordGroupModals } from '@/features/chord-library/composables/useChordGroupModals';
import { useSongModals } from '@/features/song-library/composables/useSongModals';
import { useChordStore } from '@/stores/chordStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import { LEFT_SIDEBAR_WIDTH_PIXEL } from '@/utils/core/constants';
import type { LucideIcon } from '@lucide/vue';
import { Clock, Download, List, Plus, Search, Type, Upload } from '@lucide/vue';
import { computed, provide, ref, useTemplateRef } from 'vue';
import { useRoute } from 'vue-router';
import BackupModalsContainer from '@/app/modals/BackupModalsContainer.vue';
import ChordModalsContainer from '@/features/chord-library/ChordModalsContainer.vue';
import GroupModalsContainer from '@/features/chord-library/GroupModalsContainer.vue';
import LeftChordGroupSection from '@/features/chord-library/GroupSection.vue';
import SongModalsContainer from '@/features/song-library/SongModalsContainer.vue';
import LeftSongListSection from '@/features/song-library/SongSection.vue';

defineOptions({ inheritAttrs: false });

const searchQuery = ref('');
const fileInputRef = useTemplateRef<HTMLInputElement>('fileInputRef');

const route = useRoute();
const uiStore = useUiStore();
const chordStore = useChordStore();
const songStore = useSongStore();

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
    icon: List,
    color: 'var(--text-title)',
    checked: songStore.songSortMethod === 'manual',
    action: () => songStore.setSongSortMethod('manual'),
  },
  {
    label: '拼音分组',
    icon: Type,
    color: 'var(--color-primary)',
    checked: songStore.songSortMethod === 'title',
    action: () => songStore.setSongSortMethod('title'),
  },
  {
    label: '创建时间',
    icon: Clock,
    color: 'var(--color-success)',
    checked: songStore.songSortMethod === 'createdAt',
    action: () => songStore.setSongSortMethod('createdAt'),
  },
]);

const SORT_ICON_MAP: Record<string, LucideIcon> = {
  title: Type,
  createdAt: Clock,
};

/** 排序按钮图标随当前排序方式切换（与菜单项图标一致），颜色保持默认不换 */
const currentSortIcon = computed(() => SORT_ICON_MAP[songStore.songSortMethod] ?? List);

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
