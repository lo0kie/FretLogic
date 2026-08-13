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
          fontSize="xs"
          class="header-search-input"
          :maxlength="15"
          show-count
        >
          <template #prefix>
            <Search class="search-icon" :size="14" stroke-width="2.5" />
          </template>
        </BaseInput>

        <div class="header-actions">
          <ActionButton @click="groupModals.openCreate" variant="ghost" icon-only v-tooltip="'新建分组'">
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

        <ActionButton @click="songModals.openCreateSongModal" variant="ghost" icon-only v-tooltip="'新建乐谱'">
          <Plus :size="16" :stroke-width="2.5" />
        </ActionButton>
      </template>
    </div>

    <!-- 2. 内容主体列表 -->
    <LeftGroupList
      :search-query="debouncedQuery"
      @open-rename="groupModals.openRename"
      @open-delete="groupModals.openDelete"
      @open-move="groupModals.openMove"
      @open-sort="groupModals.openSort"
      @open-config-song="songModals.openConfig"
      @open-clear-song="songModals.openClear"
      @open-delete-variants="groupModals.openChordVariantsDelete"
    />

    <!-- 3. 底栏：统一提供数据备份与恢复 -->
    <div class="left-panel-footer">
      <input type="file" ref="fileInputRef" accept=".json" @change="handleFileChange" class="hidden-input" />

      <div class="footer-actions-row">
        <ActionButton width="100%" @click="handleImportTrigger">
          <template #prefix><Download :size="13" :stroke-width="2" /></template>
          导入备份
        </ActionButton>

        <ActionButton width="100%" @click="ioService.triggerFullExport">
          <template #prefix><Upload :size="13" :stroke-width="2" /></template>
          全量导出
        </ActionButton>
      </div>
    </div>
  </div>

  <!-- 4. 业务弹窗组件集 -->
  <GroupModalsContainer :group-modals />
  <SongModalsContainer :song-modals />
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import BaseBadge from '@/components/BaseBadge.vue';
import BaseInput from '@/components/BaseInput.vue';
import { useChordGroupModals } from '@/services/useChordGroupModals';
import { useImportExportService } from '@/services/useImportExportService';
import { useSongModals } from '@/services/useSongModals';
import { useChordStore } from '@/stores/chordStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import { Download, Plus, Search, Upload } from '@lucide/vue';
import { refDebounced } from '@vueuse/core';
import { ref, useTemplateRef } from 'vue';
import { useRoute } from 'vue-router';
import GroupModalsContainer from './GroupModalsContainer.vue';
import LeftGroupList from './LeftGroupList.vue';
import SongModalsContainer from './SongModalsContainer.vue';

defineOptions({ inheritAttrs: false });

const searchQuery = ref('');
const debouncedQuery = refDebounced(searchQuery, 150);
const fileInputRef = useTemplateRef<HTMLInputElement>('fileInputRef');

const route = useRoute();
const uiStore = useUiStore();
const chordStore = useChordStore();
const songStore = useSongStore();
const ioService = useImportExportService();

const groupModals = useChordGroupModals();
const songModals = useSongModals();

const handleImportTrigger = () => fileInputRef.value?.click();

const handleFileChange = async (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (!target.files?.length) return;
  const file = target.files[0];
  const resetInput = () => {
    if (fileInputRef.value) fileInputRef.value.value = '';
  };
  await ioService.processImport(file, resetInput);
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.panel-left {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 50;
  background-color: var(--bg-panel);
  backdrop-filter: blur(32px) saturate(180%);
  -webkit-backdrop-filter: blur(32px) saturate(180%);
  border-right: 1px solid var(--glass-border);
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
  width: 0px;
  opacity: 0;
  transition:
    width @duration-slow @bezier-sidebar,
    opacity @duration-base ease;

  &.is-open {
    width: 335px;
    opacity: 1;
  }
}

.panel-header {
  padding: 0 0.85rem;
  height: 2.5rem;
  border-bottom: 1px solid var(--glass-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  box-sizing: border-box;
  flex-shrink: 0;
}

.header-title-zone {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.sidebar-title {
  font-size: 0.78rem;
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
  gap: 0.2rem;
  flex-shrink: 0;
}

.search-icon {
  color: var(--text-disabled);
}

.left-panel-footer {
  padding: 0.8rem;
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
  gap: 0.5rem;
  box-sizing: border-box;
}

@media (max-width: 768px) {
  .panel-left.is-mobile-drawer {
    position: fixed;
    top: calc(52px + env(safe-area-inset-top, 0px)) !important;
    bottom: 0;
    left: 0;
    height: calc(100vh - 52px - env(safe-area-inset-top, 0px)) !important;
    z-index: 100;
    box-shadow: var(--shadow-xl);
  }

  .panel-header {
    height: 3.2rem !important;
    padding: 0 0.8rem;
  }

  .left-panel-footer {
    padding: 0.6rem 0.85rem;
    padding-bottom: calc(0.6rem + env(safe-area-inset-bottom, 0px));
  }

  .panel-left.is-open {
    width: 85vw !important;
  }

  .sidebar-title {
    font-size: 0.9rem;
  }
}
</style>
