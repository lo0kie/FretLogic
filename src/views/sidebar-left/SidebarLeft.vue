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
        <ActionButton width="100%" size="sm" @click="handleImportTrigger">
          <template #prefix><Download :size="13" :stroke-width="2" /></template>
          导入备份
        </ActionButton>

        <ActionButton width="100%" size="sm" @click="ioService.triggerFullExport()">
          <template #prefix><Upload :size="13" :stroke-width="2" /></template>
          全量导出
        </ActionButton>
      </div>
    </div>
  </div>

  <!-- 和弦分组 Modals -->
  <BaseModal v-model:visible="groupModals.modals.create" title="新建分组" @confirm="groupModals.handleCreateGroup">
    <BaseInput
      v-model="groupModals.modalData.inputValue"
      ref="groupModals.createInputRef"
      placeholder="请输入分组名称..."
      clearable
      @enter="groupModals.handleCreateGroup"
    />
  </BaseModal>

  <BaseModal v-model:visible="groupModals.modals.rename" title="修改组名" @confirm="groupModals.handleRenameGroup">
    <BaseInput
      v-model="groupModals.modalData.inputValue"
      ref="groupModals.renameInputRef"
      placeholder="请输入新名称..."
      clearable
      @enter="groupModals.handleRenameGroup"
    />
  </BaseModal>

  <BaseModal
    v-model:visible="groupModals.modals.delete"
    :title="`删除分组 ${groupModals.modalData.activeGroup?.name}`"
    confirm-type="danger"
    @confirm="groupModals.handleDeleteGroup"
  >
    <p class="modal-description-text">确定要执行此删除操作吗？删除后组内的所有和弦都将清空。</p>
  </BaseModal>

  <BaseModal v-model:visible="groupModals.modals.move" title="移动至新分组" @confirm="groupModals.handleMoveChord">
    <div class="move-group-grid no-scrollbar">
      <GlobalTooltip
        v-for="group in chordStore.groups"
        :key="group.id"
        :content="group.id === groupModals.modalData.activeChord?.groupId ? '和弦当前已在此分组中' : ''"
        placement="top"
        class="move-tooltip-item"
      >
        <button
          :disabled="group.id === groupModals.modalData.activeChord?.groupId"
          @click="groupModals.modalData.moveTargetId = group.id"
          class="move-target-btn"
          :class="groupModals.getGroupClass(group.id)"
          :title="group.name"
        >
          <BaseMarquee class="move-marquee">
            <span class="group-btn-text">{{ group.name }}</span>
          </BaseMarquee>
        </button>
      </GlobalTooltip>
    </div>
  </BaseModal>

  <!-- 新建乐谱 Modal -->
  <BaseModal
    v-model:visible="songModals.isSongCreateOpen.value"
    title="新建乐谱"
    @confirm="songModals.handleCreateSong"
  >
    <BaseInput
      ref="songTitleInputRef"
      v-model="songModals.newSongTitle.value"
      placeholder="请输入乐谱名称..."
      clearable
      @enter="songModals.handleCreateSong"
    />
  </BaseModal>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import BaseInput from '@/components/BaseInput.vue';
import BaseMarquee from '@/components/BaseMarquee.vue';
import BaseModal from '@/components/BaseModal.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { useChordGroupModals } from '@/services/useChordGroupModals';
import { useImportExportService } from '@/services/useImportExportService';
import { useSongModals } from '@/services/useSongModals';
import { useChordStore } from '@/stores/chordStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import { Download, Eye, EyeOff, Plus, Search, Upload } from '@lucide/vue';
import { refDebounced } from '@vueuse/core';
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import LeftGroupList from './LeftGroupList.vue';

defineOptions({ inheritAttrs: false });

const searchQuery = ref('');
const debouncedQuery = refDebounced(searchQuery, 150);
const fileInputRef = ref<HTMLInputElement | null>(null);
const songTitleInputRef = ref<InstanceType<typeof BaseInput> | null>(null);

const route = useRoute();
const uiStore = useUiStore();
const chordStore = useChordStore();
const songStore = useSongStore();
const ioService = useImportExportService();

const groupModals = useChordGroupModals();
const songModals = useSongModals(songTitleInputRef);

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

:deep(.left-group-list) {
  flex: 1 !important;
  min-height: 0 !important;
  height: 0 !important;
  overflow-y: auto !important;
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
  gap: 0.4rem;
  box-sizing: border-box;
}

.modal-description-text {
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.6;
  color: var(--text-body);
  margin: 0;
}

.move-group-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.6rem;
  overflow-y: auto;
  max-height: 50vh;
  padding: 0.1rem;
  box-sizing: border-box;
}

.move-tooltip-item {
  width: 100%;
  min-width: 0;
  display: flex;
}

.move-target-btn {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border-radius: @radius-md;
  font-size: 0.75rem;
  font-weight: 700;
  border: 1px solid var(--border-base);
  display: flex;
  align-items: center;
  min-width: 0;
  box-sizing: border-box;
  cursor: pointer;
  transition: @transition-fast;

  &.is-disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background-color: var(--bg-main);
    border-color: var(--border-light);
    color: var(--text-disabled);
    :global(.dark) & {
      background-color: rgba(255, 255, 255, 0.05);
      color: rgba(255, 255, 255, 0.4);
    }
  }

  &.is-selected {
    background-color: var(--color-primary);
    color: #ffffff;
    border-color: var(--color-primary);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary), transparent 60%);
    transform: scale(1.02);
  }

  &:active:not(.is-disabled) {
    transform: scale(0.95);
  }

  &.is-normal {
    background-color: var(--bg-body);
    color: var(--text-body);

    &:hover {
      border-color: @primary;
      background-color: var(--bg-panel-hover);
    }
  }
}

.move-marquee {
  min-width: 0;
  width: 100%;

  span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
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
