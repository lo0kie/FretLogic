<template>
  <div class="panel-left" :class="{ 'is-open': uiStore.isLeftOpen }" v-bind="$attrs">
    <!-- 1. 规范化顶栏 -->
    <div class="panel-header">
      <!-- 工作台模式 Header -->
      <template v-if="route.path === '/workbench'">
        <BaseInput
          v-model="searchQuery"
          :disabled="chordStore.savedChordsList.length === 0"
          placeholder="搜索和弦..."
          clearable
          font-size="xs"
          class="header-search-input"
          :maxlength="15"
          show-count
        >
          <template #prefix>
            <Search class="search-icon" :size="14" stroke-width="2.5" />
          </template>
        </BaseInput>

        <div class="header-actions">
          <ActionButton v-tooltip="'新建分组'" variant="ghost" icon-only @click="groupModals.openCreate">
            <Plus :size="16" :stroke-width="2.5" />
          </ActionButton>
        </div>
      </template>

      <!-- 乐谱库模式 Header -->
      <template v-else-if="route.path === '/score'">
        <div class="header-title-zone">
          <span class="sidebar-title">乐谱列表</span>
          <BaseBadge variant="neutral" appearance="filled" size="xs">
            {{ songStore.songs.length }}
          </BaseBadge>
        </div>

        <ActionButton v-tooltip="'新建乐谱'" variant="ghost" icon-only @click="songModals.openCreateSongModal">
          <Plus :size="16" :stroke-width="2.5" />
        </ActionButton>
      </template>
    </div>

    <!-- 2. 内容主体列表 -->
    <div class="left-group-list-container left-group-list">
      <div class="scroll-body no-scrollbar">
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

    <!-- 3. 底栏：统一提供数据备份与恢复 -->
    <div class="left-panel-footer">
      <input ref="fileInputRef" type="file" accept=".json" class="hidden-input" @change="handleFileChange" />

      <div class="footer-actions-row">
        <ActionButton width="100%" @click="handleImportTrigger">
          <template #prefix>
            <Download :size="13" :stroke-width="2" />
          </template>
          导入备份
        </ActionButton>

        <ActionButton width="100%" @click="ioService.triggerFullExport">
          <template #prefix>
            <Upload :size="13" :stroke-width="2" />
          </template>
          全量导出
        </ActionButton>
      </div>
    </div>
  </div>

  <!-- 4. 业务弹窗组件集 -->
  <GroupModalsContainer />
  <ChordModalsContainer />
  <SongModalsContainer />
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import BaseBadge from '@/components/BaseBadge.vue';
import BaseInput from '@/components/BaseInput.vue';
import { useChordGroupModals } from '@/composables/useChordGroupModals';
import { useImportExportService } from '@/composables/useImportExportService';
import { useSongModals } from '@/composables/useSongModals';
import { useChordStore } from '@/stores/chordStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import { LEFT_SIDEBAR_WIDTH_PIXEL } from '@/utils/constants';
import { Download, Plus, Search, Upload } from '@lucide/vue';
import { provide, ref, useTemplateRef } from 'vue';
import { useRoute } from 'vue-router';
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
const ioService = useImportExportService();

const groupModals = useChordGroupModals();
const songModals = useSongModals();

provide('groupModals', groupModals);
provide('songModals', songModals);

const handleImportTrigger = () => fileInputRef.value?.click();

const handleFileChange = async (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (!target.files?.length) return;
  const file = target.files[0];
  if (!file) return;
  const resetInput = () => {
    if (fileInputRef.value) fileInputRef.value.value = '';
  };
  await ioService.processImport(file, resetInput);
};
</script>

<style scoped lang="scss">
.panel-left {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: var(--z-sidebar);
  background-color: var(--bg-panel);
  backdrop-filter: var(--blur-xl);
  -webkit-backdrop-filter: var(--blur-xl);
  border-right: 1px solid var(--glass-border);
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
  width: 0px;
  opacity: 0;
  transition:
    width $duration-slow $bezier-sidebar,
    opacity $duration-base ease;

  &.is-open {
    width: v-bind('LEFT_SIDEBAR_WIDTH_PIXEL');
    opacity: 1;
    box-shadow: var(--shadow-panel);
  }
}

.panel-header {
  padding: 0 $space-lg;
  height: 2.5rem;
  border-bottom: 1px solid var(--glass-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $space-sm;
  box-sizing: border-box;
  flex-shrink: 0;
}

.header-title-zone {
  display: flex;
  align-items: center;
  gap: $space-sm;
}

.sidebar-title {
  font-size: $fs-xs;
  font-weight: 700;
  color: var(--text-title);
  letter-spacing: -0.01em;
  white-space: nowrap;
}

.header-search-input {
  flex: 1;
  min-width: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: $space-xs;
  flex-shrink: 0;
}

.search-icon {
  color: var(--text-disabled);
}

.left-group-list-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  box-sizing: border-box;
  width: 100%;
}

.scroll-body {
  flex: 1;
  overflow-y: auto;
  padding: $space-md $space-md;
  box-sizing: border-box;
}

.left-panel-footer {
  padding: $space-md $space-lg;
  border-top: 1px solid var(--glass-border);
  box-sizing: border-box;
  flex-shrink: 0;
  width: 100%;
}

.hidden-input {
  display: none;
}

.footer-actions-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: $space-sm;
  align-items: stretch;
  box-sizing: border-box;
}
</style>
