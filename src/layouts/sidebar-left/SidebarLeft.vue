<template>
  <div class="panel-left" :class="{ 'is-open': uiStore.isLeftOpen }" v-bind="$attrs">
    <!-- 1. 顶栏：搜索与操作区 -->
    <div class="panel-header">
      <BaseInput
        v-model="searchQuery"
        :disabled="chordStore.savedChordsList.length === 0"
        placeholder="搜索和弦..."
        clearable
        fontSize="xs"
      >
        <template #prefix>
          <Search class="search-icon" :size="16" stroke-width="2.5" />
        </template>
      </BaseInput>

      <div class="header-actions-single">
        <GlobalTooltip
          placement="bottom"
          :content="uiStore.isPreviewEnabled ? '关闭和弦悬浮预览' : '开启和弦悬浮预览'"
          class="hidden-mobile"
        >
          <ActionButton
            @click="uiStore.isPreviewEnabled = !uiStore.isPreviewEnabled"
            :variant="uiStore.isPreviewEnabled ? 'subtle' : 'ghost'"
            icon-only
            size="md"
          >
            <component :is="uiStore.isPreviewEnabled ? Eye : EyeOff" :size="16" :stroke-width="2.5" />
          </ActionButton>
        </GlobalTooltip>

        <GlobalTooltip placement="bottom" content="新建分组">
          <ActionButton @click="openCreate" variant="subtle" icon-only>
            <Plus :size="18" :stroke-width="3" />
          </ActionButton>
        </GlobalTooltip>
      </div>
    </div>

    <!-- 2. 分组及和弦列表容器 (自动撑满剩余高度并内部滚动) -->
    <LeftGroupList
      :search-query="debouncedQuery"
      @open-rename="openRename"
      @open-delete="openDelete"
      @open-move="openMove"
    />

    <!-- 3. 底栏：导入/导出操作区 (绝对锁定在最底端) -->
    <div class="left-panel-footer">
      <input type="file" ref="fileInputRef" accept=".json" @change="handleFileChange" class="hidden-input" />

      <div class="footer-grid">
        <GlobalTooltip content="从本地选择 JSON 备份恢复数据" placement="top">
          <ActionButton width="100%" @click="handleImportTrigger" size="md">
            <template #prefix>
              <Download :size="16" :stroke-width="2.5" />
            </template>
            <span>导入备份</span>
          </ActionButton>
        </GlobalTooltip>

        <GlobalTooltip content="导出当前所有分组与和弦为本地文件" placement="top">
          <ActionButton width="100%" @click="ioService.triggerFullExport()" size="md">
            <template #prefix>
              <Upload :size="16" :stroke-width="2.5" />
            </template>
            <span>全量导出</span>
          </ActionButton>
        </GlobalTooltip>
      </div>
    </div>
  </div>

  <!-- Modal 弹窗 -->
  <BaseModal v-model:visible="modals.create" title="新建分组" @confirm="handleCreateGroup">
    <BaseInput
      v-model="modalData.inputValue"
      ref="createInputRef"
      placeholder="请输入分组名称..."
      clearable
      @enter="handleCreateGroup"
    />
  </BaseModal>

  <BaseModal v-model:visible="modals.rename" title="修改组名" @confirm="handleRenameGroup">
    <BaseInput
      v-model="modalData.inputValue"
      ref="renameInputRef"
      placeholder="请输入新名称..."
      clearable
      @enter="handleRenameGroup"
    />
  </BaseModal>

  <BaseModal
    v-model:visible="modals.delete"
    :title="`删除分组 ${modalData.activeGroup?.name}`"
    confirm-type="danger"
    @confirm="handleDeleteGroup"
  >
    <p class="modal-description-text">确定要执行此删除操作吗？删除后组内的所有和弦都将清空。</p>
  </BaseModal>

  <BaseModal v-model:visible="modals.move" title="移动至新分组" @confirm="handleMoveChord">
    <div class="move-group-grid no-scrollbar">
      <GlobalTooltip
        v-for="group in chordStore.groups"
        :key="group.id"
        :content="group.id === modalData.activeChord?.groupId ? '和弦当前已在此分组中' : ''"
        placement="top"
        class="move-tooltip-item"
      >
        <button
          :disabled="group.id === modalData.activeChord?.groupId"
          @click="modalData.moveTargetId = group.id"
          class="move-target-btn"
          :class="getGroupClass(group.id)"
          :title="group.name"
        >
          <BaseMarquee class="move-marquee"
            ><span>{{ group.name }}</span></BaseMarquee
          >
        </button>
      </GlobalTooltip>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import BaseInput from '@/components/BaseInput.vue';
import BaseMarquee from '@/components/BaseMarquee.vue';
import BaseModal from '@/components/BaseModal.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import LeftGroupList from '@/layouts/sidebar-left/LeftGroupList.vue';
import { useImportExportService } from '@/services/useImportExportService';
import { useChordStore } from '@/stores/chordStore';
import { useEditorStore } from '@/stores/editorStore';
import { useUiStore } from '@/stores/uiStore';
import type { Chord, Group } from '@/types';
import { generateUUID } from '@/utils/validators';
import { Download, Eye, EyeOff, Plus, Search, Upload } from '@lucide/vue';
import { refDebounced } from '@vueuse/core';
import { nextTick, reactive, ref } from 'vue';

defineOptions({ inheritAttrs: false });

const uiStore = useUiStore();
const chordStore = useChordStore();
const editorStore = useEditorStore();
const ioService = useImportExportService();

const searchQuery = ref('');
const debouncedQuery = refDebounced(searchQuery, 150);
const fileInputRef = ref<HTMLInputElement | null>(null);

const modals = reactive({ create: false, rename: false, delete: false, move: false });
const modalData = reactive({
  inputValue: '',
  activeGroup: null as Group | null,
  activeChord: null as Chord | null,
  moveTargetId: '',
});

const createInputRef = ref<InstanceType<typeof BaseInput> | null>(null);
const renameInputRef = ref<InstanceType<typeof BaseInput> | null>(null);

const getGroupClass = (groupId: string) => {
  if (groupId === modalData.activeChord?.groupId) return 'is-disabled';
  if (modalData.moveTargetId === groupId) return 'is-selected';
  return 'is-normal';
};

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

const openCreate = async () => {
  modalData.inputValue = '';
  modals.create = true;
  await nextTick();
  setTimeout(() => createInputRef.value?.focus(), 50);
};

const handleCreateGroup = () => {
  const val = modalData.inputValue.trim();

  if (!val) {
    uiStore.toast.error('确认失败：请输入有效内容');
    return;
  }
  if (chordStore.groups.some(g => g.name === val)) {
    uiStore.toast.warning('创建失败：该分组名称已存在');
    return;
  }
  const newId = 'g_' + generateUUID().slice(0, 8);
  chordStore.groups.forEach(g => {
    g.collapsed = true;
  });

  chordStore.groups.push({ id: newId, name: val, collapsed: false });
  chordStore.selectedGroupId = newId;
  modals.create = false;
  uiStore.toast.success('操作成功完成');
};

const openRename = async (group: Group) => {
  modalData.activeGroup = group;
  modalData.inputValue = group.name;
  modals.rename = true;
  await nextTick();
  setTimeout(() => renameInputRef.value?.focus(), 50);
};

const handleRenameGroup = () => {
  const val = modalData.inputValue.trim();
  if (!val) {
    uiStore.toast.error('确认失败：请输入有效内容');
    return;
  }
  if (modalData.activeGroup) modalData.activeGroup.name = val;
  modals.rename = false;
  uiStore.toast.success('操作成功完成');
};

const openDelete = (group: Group) => {
  modalData.activeGroup = group;
  modals.delete = true;
};

const handleDeleteGroup = () => {
  if (!modalData.activeGroup) return;
  const targetGid = modalData.activeGroup.id;
  if (editorStore.editingId) {
    const editingChord = chordStore.savedChordsList.find(c => c.id === editorStore.editingId);
    if (editingChord && editingChord.groupId === targetGid) editorStore.resetEditor();
  }
  chordStore.overwriteChords(chordStore.savedChordsList.filter(c => c.groupId !== targetGid));
  chordStore.overwriteGroups(chordStore.groups.filter(g => g.id !== targetGid));
  if (chordStore.selectedGroupId === targetGid) chordStore.selectedGroupId = chordStore.groups[0]?.id || null;
  uiStore.clearActionToasts();
  modals.delete = false;
  uiStore.toast.success('操作成功完成');
};

const openMove = (chord: Chord) => {
  modalData.activeChord = chord;
  modalData.moveTargetId = '';
  modals.move = true;
};

const handleMoveChord = () => {
  if (!modalData.moveTargetId) {
    uiStore.toast.error('确认失败：请选择有效分组');
    return;
  }
  if (!modalData.activeChord) return;
  const chordIdx = chordStore.savedChordsList.findIndex(c => c.id === modalData.activeChord!.id);
  if (chordIdx !== -1) {
    chordStore.savedChordsList[chordIdx].groupId = modalData.moveTargetId;
    uiStore.clearActionToasts();
  }
  modals.move = false;
  uiStore.toast.success('操作成功完成');
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
  padding: 0 1rem;
  height: 76px;
  border-bottom: 1px solid var(--control-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  box-sizing: border-box;
  flex-shrink: 0;
  position: relative;

  :deep(.input-wrapper) {
    flex: 1;
    min-width: 0;
  }
}

/* 🌟 核心 1：强制中间的列表容器缩回剩余高度，内部溢出滚动 */
:deep(.left-group-list) {
  flex: 1 !important;
  min-height: 0 !important;
  height: 0 !important; /* 强制拉回 flex 计算基准 */
  overflow-y: auto !important;
}

.header-actions-single {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}
.search-icon {
  color: var(--text-disabled);
}

.left-panel-footer {
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--control-border);
  background-color: var(--bg-panel);
  box-sizing: border-box;
  flex-shrink: 0 !important; /* 🌟 核心 2：严禁底栏被压缩 */
  width: 100%;
}

.hidden-input {
  display: none;
}
.footer-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;
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

/* 📱 移动端抽屉精准高度计算修补 */
@media (max-width: 768px) {
  .panel-left {
    height: calc(100vh - 3.2rem) !important; /* 🌟 扣除 Header 高度，保证 Drawer 底部完全落在可视区域以内 */
  }

  .panel-header {
    height: 3.5rem !important;
    padding: 0 0.8rem;
    display: flex;
    align-items: center;
  }

  .left-panel-footer {
    padding: 0.75rem 1rem;
    padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
  }

  .panel-left.is-open {
    width: 85vw !important;
  }

  .hidden-mobile {
    display: none !important;
  }
}
</style>
