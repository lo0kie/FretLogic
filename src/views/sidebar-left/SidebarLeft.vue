<template>
  <div class="panel-left" :class="{ 'is-open': uiStore.isLeftOpen }" v-bind="$attrs">
    <!-- 1. 规范化顶栏 -->
    <div class="panel-header">
      <!-- 工作台模式 Header -->
      <template v-if="route.path === '/'">
        <BaseInput
          v-model="searchQuery"
          :disabled="chordStore.savedChordsList.length === 0"
          placeholder="搜索和弦..."
          clearable
          size="sm"
          fontSize="xs"
          class="header-search-input"
        >
          <template #prefix>
            <Search class="search-icon" :size="14" stroke-width="2.5" />
          </template>
        </BaseInput>

        <div class="header-actions">
          <GlobalTooltip
            placement="bottom"
            :content="uiStore.isPreviewEnabled ? '关闭和弦悬浮预览' : '开启和弦悬浮预览'"
            class="hidden-mobile"
          >
            <ActionButton
              @click="uiStore.isPreviewEnabled = !uiStore.isPreviewEnabled"
              :variant="uiStore.isPreviewEnabled ? 'subtle' : 'ghost'"
              icon-only
              size="sm"
            >
              <component :is="uiStore.isPreviewEnabled ? Eye : EyeOff" :size="15" :stroke-width="2.2" />
            </ActionButton>
          </GlobalTooltip>

          <GlobalTooltip placement="bottom" content="新建分组">
            <ActionButton @click="groupModals.openCreate" variant="subtle" icon-only size="sm">
              <Plus :size="16" :stroke-width="2.5" />
            </ActionButton>
          </GlobalTooltip>
        </div>
      </template>

      <!-- 乐谱库模式 Header -->
      <template v-else-if="route.path === '/score'">
        <div class="header-title-zone">
          <span class="sidebar-title">乐谱列表</span>
          <span class="sidebar-count-badge">{{ songStore.songs.length }}</span>
        </div>

        <GlobalTooltip placement="bottom" content="新建乐谱">
          <ActionButton @click="songModals.openCreateSongModal" variant="subtle" icon-only size="sm">
            <Plus :size="16" :stroke-width="2.5" />
          </ActionButton>
        </GlobalTooltip>
      </template>
    </div>

    <!-- 2. 内容主体列表 -->
    <LeftGroupList
      :search-query="debouncedQuery"
      @open-rename="groupModals.openRename"
      @open-delete="groupModals.openDelete"
      @open-move="groupModals.openMove"
    />

    <!-- 3. 底栏：统一提供数据备份与恢复 -->
    <div class="left-panel-footer">
      <input type="file" ref="fileInputRef" accept=".json" @change="handleFileChange" class="hidden-input" />

      <div class="footer-actions-row">
        <ActionButton width="100%" @click="handleImportTrigger">
          <template #prefix><Download :size="13" :stroke-width="2" /></template>
          导入备份
        </ActionButton>

        <ActionButton width="100%" @click="ioService.triggerFullExport()">
          <template #prefix><Upload :size="13" :stroke-width="2" /></template>
          全量导出
        </ActionButton>
      </div>
    </div>
  </div>

  <!-- 4. 业务弹窗组件集 -->
  <GroupModalsContainer :group-modals="groupModals" />
  <SongCreateModal :song-modals="songModals" />
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import BaseInput from '@/components/BaseInput.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { useChordGroupModals } from '@/services/useChordGroupModals';
import { useImportExportService } from '@/services/useImportExportService';
import { useSongModals } from '@/services/useSongModals';
import { useChordStore } from '@/stores/chordStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import { Download, Eye, EyeOff, Plus, Search, Upload } from '@lucide/vue';
import { refDebounced } from '@vueuse/core';
import { ref, useTemplateRef } from 'vue';
import { useRoute } from 'vue-router';
import GroupModalsContainer from './GroupModalsContainer.vue';
import LeftGroupList from './LeftGroupList.vue';
import SongCreateModal from './SongCreateModal.vue';

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

const handleFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (!target.files || target.files.length === 0) return;
  const file = target.files[0];
  const resetInput = () => {
    if (fileInputRef.value) fileInputRef.value.value = '';
  };
  ioService.processImport(file, resetInput);
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.panel-left {
  background-color: var(--bg-panel);
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
  border-right: 1px solid var(--glass-border);
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 10;
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
  font-weight: 800;
  color: var(--text-title);
  letter-spacing: -0.01em;
  white-space: nowrap; /* 🌟 强制文字不换行 */
}

.sidebar-count-badge {
  font-size: 0.6rem;
  font-weight: 700;
  padding: 0.05rem 0.35rem;
  border-radius: 9999px;
  background-color: var(--bg-body);
  color: var(--text-disabled);
  border: 1px solid var(--border-light);
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
  padding: 0.5rem 0.85rem;
  border-top: 1px solid var(--glass-border);
  background-color: var(--bg-panel);
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
  .panel-left {
    height: calc(100vh - 3.2rem) !important;
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

  .hidden-mobile {
    display: none !important;
  }
}
</style>
