<template>
  <div class="panel-left" :class="{ 'is-open': uiStore.isLeftOpen }">
    <div class="panel-header">
      <h1 class="header-title">Fret Logic</h1>

      <div class="header-actions">
        <GlobalTooltip placement="bottom" :content="uiStore.isPreviewEnabled ? '关闭和弦悬浮预览' : '开启和弦悬浮预览'">
          <button
            @click="uiStore.isPreviewEnabled = !uiStore.isPreviewEnabled"
            class="header-preview-btn"
            :class="{ 'is-active': uiStore.isPreviewEnabled }"
          >
            <component :is="uiStore.isPreviewEnabled ? Eye : EyeOff" :size="16" :stroke-width="2.5" />
          </button>
        </GlobalTooltip>

        <GlobalTooltip placement="bottom" content="新建分组">
          <button @click="openCreate" class="header-add-btn">
            <Plus :size="18" :stroke-width="3" />
          </button>
        </GlobalTooltip>
      </div>
    </div>

    <LeftGroupList @open-rename="openRename" @open-delete="openDelete" @open-move="openMove" />
    <LeftPanelFooter />
  </div>

  <button
    @click="uiStore.isLeftOpen = !uiStore.isLeftOpen"
    class="sidebar-toggle-btn-left"
    :title="uiStore.isLeftOpen ? '收起左侧边栏' : '展开左侧边栏'"
    :class="{ 'is-open': uiStore.isLeftOpen }"
  >
    <Triangle :size="12" fill="currentColor" :style="{ rotate: uiStore.isLeftOpen ? '270deg' : '90deg' }" />
  </button>

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
          :class="[
            group.id === modalData.activeChord?.groupId
              ? 'is-disabled'
              : modalData.moveTargetId === group.id
                ? 'is-selected'
                : 'is-normal',
          ]"
        >
          <BaseMarquee class="move-marquee">
            <span>{{ group.name }}</span>
          </BaseMarquee>
        </button>
      </GlobalTooltip>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { LEFT_SIDEBAR_WIDTH_PIXEL } from '@/constants';
import { useChordStore } from '@/stores/chordStore';
import { useEditorStore } from '@/stores/editorStore';
import { useUiStore } from '@/stores/uiStore';
import type { Chord, Group } from '@/types';
import { nextTick, reactive, ref } from 'vue';

import BaseInput from '@/components/BaseInput.vue';
import BaseMarquee from '@/components/BaseMarquee.vue';
import BaseModal from '@/components/BaseModal.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import LeftGroupList from '@/views/sidebar-left/LeftGroupList.vue';
import LeftPanelFooter from '@/views/sidebar-left/LeftPanelFooter.vue';
import { Eye, EyeOff, Plus, Triangle } from '@lucide/vue';

const uiStore = useUiStore();
const chordStore = useChordStore();
const editorStore = useEditorStore();

const modals = reactive({
  create: false,
  rename: false,
  delete: false,
  move: false,
});

const modalData = reactive({
  inputValue: '',
  activeGroup: null as Group | null,
  activeChord: null as Chord | null,
  moveTargetId: '',
});

const createInputRef = ref<InstanceType<typeof BaseInput> | null>(null);
const renameInputRef = ref<InstanceType<typeof BaseInput> | null>(null);

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
  const newId = 'g_' + crypto.randomUUID().slice(0, 8);
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
  if (modalData.activeGroup) {
    modalData.activeGroup.name = val;
  }
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
    if (editingChord && editingChord.groupId === targetGid) {
      editorStore.resetEditor();
    }
  }

  chordStore.overwriteChords(chordStore.savedChordsList.filter(c => c.groupId !== targetGid));
  chordStore.overwriteGroups(chordStore.groups.filter(g => g.id !== targetGid));
  if (chordStore.selectedGroupId === targetGid) {
    chordStore.selectedGroupId = chordStore.groups[0]?.id || null;
  }

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

.panel-header,
:deep(.left-group-list),
:deep(.left-panel-footer) {
  min-width: v-bind(LEFT_SIDEBAR_WIDTH_PIXEL);
}

.panel-left {
  background-color: var(--bg-panel);
  border: @border-solid-light;
  box-shadow: @shadow-panel;
  height: calc(100% - 24px);
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 10;
  border-radius: @radius-xl;
  box-sizing: border-box;
  flex-shrink: 0;
  overflow: hidden;
  width: 0px;
  opacity: 0;
  margin: 12px 0;
  transition:
    width @duration-slow @bezier-sidebar,
    opacity @duration-base ease,
    margin @duration-slow @bezier-sidebar;

  :global(.dark) & {
    box-shadow: @shadow-panel-dark;
  }

  &.is-open {
    width: v-bind(LEFT_SIDEBAR_WIDTH_PIXEL);
    opacity: 1;
    margin: 12px;
  }
}

.panel-header {
  padding: 1rem 1.25rem;
  height: 76px;
  border-bottom: 1px solid var(--control-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  flex-shrink: 0;
  position: relative;
}

.header-title {
  font-size: 1rem;
  font-weight: 900;
  letter-spacing: -0.025em;
  text-transform: uppercase;
  color: var(--text-title);
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.sidebar-toggle-btn-left {
  position: absolute;
  top: 50%;
  width: 20px;
  height: 60px;
  background-color: var(--bg-panel);
  border: @border-solid-base;
  box-shadow: @shadow-sm;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  color: var(--text-disabled);
  cursor: pointer;
  border-radius: 0 6px 6px 0;
  transform: translateY(-50%) scale(1);
  transform-origin: left;
  left: 0px;
  transition:
    color @duration-base @bezier-standard,
    border-color @duration-base @bezier-standard,
    background-color @duration-base @bezier-standard,
    left @duration-slow @bezier-sidebar,
    transform 0.2s ease;

  &:hover {
    color: @primary;
    border-color: color-mix(in srgb, @primary, transparent 75%);
    background-color: var(--bg-main);
  }

  :global(.dark) &:hover {
    background-color: var(--bg-panel-hover);
  }

  &.is-open {
    left: calc(v-bind(LEFT_SIDEBAR_WIDTH_PIXEL) + 11px);
  }

  &:active {
    transform: translateY(-50%) scale(0.93);
  }
}

.header-add-btn {
  width: 1.6rem;
  height: 1.6rem;
  border-radius: @radius-md;
  color: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  border: @border-solid-light;
  background-color: color-mix(in srgb, @primary, transparent 90%);
  padding: 0;
  cursor: pointer;
  transition: @transition-fast;

  &:hover {
    background-color: color-mix(in srgb, @primary, transparent 80%);
    border-color: color-mix(in srgb, @primary, transparent 50%);
  }

  &:active {
    transform: scale(0.95);
  }
}

.header-preview-btn {
  width: 1.6rem;
  height: 1.6rem;
  border-radius: @radius-md;
  background-color: transparent;
  border: 1px solid transparent;
  color: var(--text-disabled);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  transition: @transition-fast;

  &:hover {
    color: var(--text-muted);
    background-color: var(--bg-panel-hover);
    border-color: var(--border-light);
  }

  &:active {
    transform: scale(0.95);
  }

  &.is-active {
    color: @primary;
    background-color: color-mix(in srgb, @primary, transparent 92%);
    border-color: color-mix(in srgb, @primary, transparent 85%);

    &:hover {
      background-color: color-mix(in srgb, @primary, transparent 84%);
      border-color: color-mix(in srgb, @primary, transparent 60%);
    }
  }
}

.modal-description-text {
  font-size: 0.7rem;
  font-weight: 600;
  opacity: 0.8;
  line-height: 1.625;
  color: var(--text-body);
  margin: 0;
}

.move-group-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.6rem;
  overflow-y: auto;
  max-height: 50vh;
  padding: 0.025rem;
  box-sizing: border-box;

  &.no-scrollbar {
    scrollbar-width: none;
    &::-webkit-scrollbar {
      display: none;
    }
  }
}

.move-tooltip-item {
  width: 100%;
  min-width: 0;
  display: flex;
}

.move-target-btn {
  width: 100%;
  padding-left: 0.75rem;
  padding-right: 0.75rem;
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
  border-radius: @radius-md;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  font-weight: 700;
  text-align: left;
  border-style: solid;
  border-width: 1px;
  display: flex;
  align-items: center;
  min-width: 0;
  box-sizing: border-box;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  transition: all 0.2s @bezier-standard;

  &.is-disabled {
    opacity: 0.4;
    cursor: not-allowed;
    filter: grayscale(100%);
    background-color: var(--bg-main);
    border-color: var(--control-border);
    color: #64748b;

    :global(.dark) & {
      background-color: #1e293b !important;
      border-color: rgba(255, 255, 255, 0.08) !important;
      color: #64748b !important;
    }
  }

  &.is-selected {
    background-color: var(--color-primary);
    color: #ffffff;
    border-color: var(--color-primary);
    box-shadow: @shadow-md;
  }

  &.is-normal {
    background-color: var(--bg-body);
    color: var(--text-body);
    border-color: var(--control-border);

    &:hover {
      border-color: color-mix(in srgb, #60a5fa, transparent 50%);
      box-shadow: @shadow-sm;
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
</style>
