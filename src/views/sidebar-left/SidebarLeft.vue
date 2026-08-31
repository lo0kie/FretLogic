<template>
  <aside
    class="panel-left absolute top-0 bottom-0 left-0 z-sidebar bg-bg-panel/90 backdrop-blur-xl border-r border-glass-border h-full box-border overflow-hidden flex flex-col transition-[width,opacity] duration-slow ease-sidebar"
    :aria-label="route.path === '/score' ? '乐谱库' : '指法库'"
    :style="{
      width: uiStore.isLeftOpen ? LEFT_SIDEBAR_WIDTH_PIXEL : '0px',
      opacity: uiStore.isLeftOpen ? 1 : 0,
      boxShadow: uiStore.isLeftOpen ? 'var(--shadow-panel)' : 'none',
    }"
    v-bind="$attrs"
  >
    <div
      class="panel-header px-lg h-10 border-b border-glass-border flex items-center justify-between gap-sm box-border shrink-0"
    >
      <template v-if="route.path === '/workbench'">
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
      </template>

      <template v-else-if="route.path === '/score'">
        <div class="header-title-zone flex items-center gap-sm">
          <span class="sidebar-title text-xs font-bold text-text-title tracking-tight whitespace-nowrap">乐谱列表</span>
          <BaseBadge variant="neutral" appearance="filled" size="xs">
            {{ songStore.songs.length }}
          </BaseBadge>
        </div>

        <ActionButton
          v-tooltip="'新建乐谱'"
          variant="ghost"
          icon-only
          aria-label="新建乐谱"
          @click="songModals.openCreateSongModal"
        >
          <Plus :size="16" :stroke-width="2.5" />
        </ActionButton>
      </template>
    </div>

    <div
      class="left-group-list-container left-group-list flex flex-col flex-1 min-h-0 overflow-hidden box-border w-full"
    >
      <div
        v-scroll-cache="`sidebar-scroll:${route.path}`"
        class="scroll-body no-scrollbar flex-1 overflow-y-auto p-md box-border"
      >
        <LeftChordGroupSection
          v-if="route.path === '/workbench'"
          :search-query="searchQuery"
          @open-rename="groupModals.openRename"
          @open-delete="groupModals.openDelete"
          @open-move="groupModals.openMove"
          @open-sort="groupModals.openSort"
          @open-delete-variants="groupModals.openChordVariantsDelete"
          @open-references="groupModals.openChordReferences"
        />

        <LeftSongListSection
          v-else-if="route.path === '/score'"
          @open-config="songModals.openConfig"
          @open-clear="songModals.openClear"
        />
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
import ActionButton from '@/components/base/ActionButton.vue';
import BaseBadge from '@/components/base/BaseBadge.vue';
import BaseInput from '@/components/base/BaseInput.vue';
import { useBackupModals } from '@/composables/app/useBackupModals';
import { useChordGroupModals } from '@/composables/app/useChordGroupModals';
import { useSongModals } from '@/composables/app/useSongModals';
import { useChordStore } from '@/stores/chordStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import { LEFT_SIDEBAR_WIDTH_PIXEL } from '@/utils/core/constants';
import { Download, Plus, Search, Upload } from '@lucide/vue';
import { provide, ref, useTemplateRef } from 'vue';
import { useRoute } from 'vue-router';
import BackupModalsContainer from './BackupModalsContainer.vue';
import ChordModalsContainer from './ChordModalsContainer.vue';
import GroupModalsContainer from './GroupModalsContainer.vue';
import LeftChordGroupSection from './GroupSection.vue';
import SongModalsContainer from './SongModalsContainer.vue';
import LeftSongListSection from './SongSection.vue';

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

const handleImportTrigger = () => fileInputRef.value?.click();

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
