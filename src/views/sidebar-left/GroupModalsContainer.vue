<template>
  <!-- 1. 新建分组 Modal -->
  <BaseModal v-model:visible="groupModals.modals.create" title="新建分组" @confirm="groupModals.handleCreateGroup">
    <BaseInput
      v-model="groupModals.modalData.inputValue"
      placeholder="请输入分组名称..."
      clearable
      autofocus
      @enter="groupModals.handleCreateGroup"
    />
  </BaseModal>

  <!-- 2. 重命名分组 Modal -->
  <BaseModal v-model:visible="groupModals.modals.rename" title="修改组名" @confirm="groupModals.handleRenameGroup">
    <BaseInput
      v-model="groupModals.modalData.inputValue"
      placeholder="请输入新名称..."
      autofocus
      clearable
      @enter="groupModals.handleRenameGroup"
    />
  </BaseModal>

  <!-- 3. 删除分组 Modal -->
  <BaseModal
    v-model:visible="groupModals.modals.delete"
    :title="`删除分组 ${groupModals.modalData.activeGroup?.name}`"
    confirm-type="danger"
    @confirm="groupModals.handleDeleteGroup"
  >
    <p class="modal-description-text">确定要执行此删除操作吗？删除后组内的所有和弦都将清空。</p>
  </BaseModal>

  <!-- 4. 移动分组 Modal -->
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
          v-wave
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

  <!-- 5. 排序配置 Modal -->
  <BaseModal
    v-model:visible="groupModals.modals.sort"
    title="分组和弦排序配置"
    @confirm="groupModals.handleSaveSort"
    width="w-md"
  >
    <div class="sort-modal-body">
      <div class="sort-config-row">
        <label class="config-label">排序规则</label>
        <BaseSegmentedControl
          v-model="groupModals.modalData.sortRule"
          :options="[
            { label: 'C-B 音名', value: 'ROOT_PITCH' },
            { label: '调内级数', value: 'KEY_DEGREE' },
            { label: '名称 A-Z', value: 'NAME_ASC' },
          ]"
        />
      </div>
      <div v-if="groupModals.modalData.sortRule === 'KEY_DEGREE'" class="sort-config-row">
        <label class="config-label">调式设定</label>
        <div class="key-selector-wrapper">
          <BaseSelector
            v-model="groupModals.modalData.sortKey"
            :options="['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']"
            default-value="C"
            :label-formatter="val => `${val} 调`"
          />
        </div>
      </div>
    </div>
  </BaseModal>

  <!-- 6. 多指法和弦删除选择 Modal -->
  <BaseModal
    v-model:visible="groupModals.modals.chordVariantsDelete"
    :title="`删除和弦 &quot;${groupModals.modalData.activeGroupCard?.mainChord.chordName}&quot; 的指法`"
    width="w-large"
    :show-footer="false"
  >
    <div class="variants-delete-modal-content">
      <div class="variants-header-row">
        <p class="modal-description-text">
          请点击选择要删除的指法，共
          <strong class="variants-count-highlight">
            {{ groupModals.modalData.activeGroupCard?.variants.length || 0 }}
          </strong>
          个
        </p>
        <ActionButton :primary="isAllVariantsSelected" size="sm" @click="handleToggleSelectAllVariants">
          {{ isAllVariantsSelected ? '取消全选' : '全选' }}
        </ActionButton>
      </div>
      <div class="variants-checkbox-list no-scrollbar">
        <div
          v-for="variant in groupModals.modalData.activeGroupCard?.variants"
          :key="variant.id"
          class="variant-checkbox-item"
          :class="{ 'is-selected': groupModals.modalData.selectedVariantIds.has(variant.id) }"
          @click="groupModals.toggleVariantSelection(variant.id)"
          role="button"
          tabindex="0"
          v-wave
        >
          <div class="variant-meta-info">
            <span class="variant-details"> capo {{ variant.capo }} </span>
          </div>
          <div class="variant-preview-thumb">
            <Fretboard
              :bordered="false"
              bg-color="transparent"
              fret-number-size="lg"
              :interactive="false"
              :scale="0.32"
              :show-open-strings="false"
              :show-fret-numbers="false"
              :strings="variant.strings"
              :capo="variant.capo"
              :fret-count="variant.fretCount"
              :is-dark-mode="settingsStore.isDarkMode"
            />
          </div>
        </div>
      </div>
      <div class="modal-footer-zone custom-footer">
        <ActionButton size="sm" variant="ghost" @click="groupModals.modals.chordVariantsDelete = false">
          取消
        </ActionButton>
        <div class="actions-right-group">
          <ActionButton size="sm" danger variant="subtle" @click="groupModals.handleDeleteAllVariants()">
            全部删除
          </ActionButton>
          <ActionButton
            size="sm"
            danger
            :disabled="groupModals.modalData.selectedVariantIds.size === 0"
            @click="groupModals.handleDeleteSelectedVariants()"
          >
            确认删除所选 ({{ groupModals.modalData.selectedVariantIds.size }})
          </ActionButton>
        </div>
      </div>
    </div>
  </BaseModal>

  <!-- 7. 自定义导入内容选择 Modal -->
  <BaseModal
    v-model:visible="ioService.isImportSelectionModalOpen.value"
    title="自定义选择导入内容"
    width="w-lg"
    :confirm-text="importConfirmText"
    @confirm="ioService.applySelectedImport"
    :confirm-disabled="!hasAnyImportSelection"
  >
    <div class="variants-delete-modal-content">
      <div class="import-tab-bar">
        <BaseSegmentedControl v-model="importActiveTab" :options="IMPORT_TAB_OPTIONS" size="sm" />
      </div>

      <!-- 和弦资产 Tab -->
      <div v-show="importActiveTab === 'chords'" class="import-panel-scroll no-scrollbar">
        <div
          v-if="ioService.pendingImportData.value?.groups && ioService.pendingImportData.value.groups.length > 0"
          class="import-groups-grid"
        >
          <div
            v-for="group in ioService.pendingImportData.value.groups"
            :key="group.id"
            class="import-group-simple-card"
            :class="{ 'is-selected': isImportGroupAllSelected(group.id) }"
            @click="toggleImportGroup(group.id)"
            role="button"
            tabindex="0"
            v-wave
          >
            <div class="import-group-info-box">
              <span class="import-group-title">{{ group.name }}</span>
              <span class="import-group-meta">{{ getImportGroupChords(group.id).length }} 个和弦</span>
            </div>
          </div>
        </div>
        <EmptyState v-else description="备份文件中未检测到和弦资产" size="sm" />
      </div>

      <div v-show="importActiveTab === 'songs'" class="import-panel-scroll no-scrollbar">
        <template v-if="ioService.pendingImportData.value?.songs && ioService.pendingImportData.value.songs.length > 0">
          <div class="import-songs-grid">
            <div
              v-for="song in ioService.pendingImportData.value.songs"
              :key="song.id"
              class="import-song-item-card"
              :class="{ 'is-selected': ioService.selectedImportState.songIds.has(song.id) }"
              @click="toggleImportSong(song.id)"
              role="button"
              tabindex="0"
              v-wave
            >
              <div class="import-song-info-box">
                <span class="import-song-title">{{ song.title }}</span>
                <span class="import-song-meta">{{ song.key }}调 capo {{ song.capo }}</span>
              </div>
            </div>
          </div>
        </template>
        <EmptyState v-else description="备份文件中未检测到乐谱数据" size="sm" />
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import BaseInput from '@/components/BaseInput.vue';
import BaseMarquee from '@/components/BaseMarquee.vue';
import BaseModal from '@/components/BaseModal.vue';
import BaseSegmentedControl, { type SegmentOption } from '@/components/BaseSegmentedControl.vue';
import BaseSelector from '@/components/BaseSelector.vue';
import EmptyState from '@/components/EmptyState.vue';
import Fretboard from '@/components/Fretboard.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { useChordGroupModals } from '@/services/useChordGroupModals';
import { useImportExportService } from '@/services/useImportExportService';
import { useChordStore } from '@/stores/chordStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Chord } from '@/types';
import { computed, ref } from 'vue';

const props = defineProps<{ groupModals: ReturnType<typeof useChordGroupModals> }>();

const chordStore = useChordStore();
const settingsStore = useSettingsStore();
const ioService = useImportExportService();

// 多指法和弦删除全选逻辑
const isAllVariantsSelected = computed(() => {
  const variants = props.groupModals.modalData.activeGroupCard?.variants;
  if (!variants || variants.length === 0) return false;
  return variants.every(v => props.groupModals.modalData.selectedVariantIds.has(v.id));
});

const handleToggleSelectAllVariants = () => {
  const variants = props.groupModals.modalData.activeGroupCard?.variants;
  if (!variants) return;
  if (isAllVariantsSelected.value) {
    props.groupModals.modalData.selectedVariantIds.clear();
  } else {
    variants.forEach(v => props.groupModals.modalData.selectedVariantIds.add(v.id));
  }
};

// 按需导入选择逻辑
const importActiveTab = ref<'chords' | 'songs'>('chords');
const IMPORT_TAB_OPTIONS: SegmentOption<'chords' | 'songs'>[] = [
  { label: '和弦', value: 'chords' },
  { label: '乐谱', value: 'songs' },
];

const getImportGroupChords = (groupId: string): Chord[] => {
  return (ioService.pendingImportData.value?.chords || []).filter(c => c.groupId === groupId);
};

const isImportGroupAllSelected = (groupId: string) => {
  const chords = getImportGroupChords(groupId);
  if (chords.length === 0) return ioService.selectedImportState.groupIds.has(groupId);
  return chords.every(c => ioService.selectedImportState.chordIds.has(c.id));
};

const toggleImportGroup = (groupId: string) => {
  const chords = getImportGroupChords(groupId);
  const allSelected = isImportGroupAllSelected(groupId);

  if (allSelected) {
    ioService.selectedImportState.groupIds.delete(groupId);
    chords.forEach(c => ioService.selectedImportState.chordIds.delete(c.id));
  } else {
    ioService.selectedImportState.groupIds.add(groupId);
    chords.forEach(c => ioService.selectedImportState.chordIds.add(c.id));
  }
};

const toggleImportSong = (songId: string) => {
  if (ioService.selectedImportState.songIds.has(songId)) {
    ioService.selectedImportState.songIds.delete(songId);
  } else {
    ioService.selectedImportState.songIds.add(songId);
  }
};

// const totalImportSelectedCount = computed(() => ioService.selectedImportState.groupIds.size + ioService.selectedImportState.songIds.size);
const selectedGroupCount = computed(() => ioService.selectedImportState.groupIds.size);
const selectedSongCount = computed(() => ioService.selectedImportState.songIds.size);

const importConfirmText = computed(() => {
  const parts: string[] = [];
  if (selectedGroupCount.value > 0) parts.push(`${selectedGroupCount.value} 个分组`);
  if (selectedSongCount.value > 0) parts.push(`${selectedSongCount.value} 首乐谱`);
  return parts.length > 0 ? `导入 ${parts.join('、')}` : '导入';
});

const hasAnyImportSelection = computed(() => selectedGroupCount.value + selectedSongCount.value > 0);
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

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

.sort-modal-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0.2rem 0;
}

.sort-config-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.config-label {
  width: 4.2rem;
  flex-shrink: 0;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-title);
  white-space: nowrap;
}

.key-selector-wrapper {
  width: 8rem;
  flex-shrink: 0;
}

.variants-delete-modal-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.variants-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.variants-checkbox-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
  gap: 1.2rem 1rem;
  max-height: 52vh;
  overflow-y: auto;
  padding: 0.15rem;
  box-sizing: border-box;
}

.variant-checkbox-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  padding: 0.65rem 0.5rem 0.55rem;
  background-color: var(--bg-body);
  border: 1.5px solid var(--border-light);
  border-radius: @radius-md;
  cursor: pointer;
  user-select: none;
  transition:
    background-color @duration-fast ease,
    border-color @duration-fast ease,
    box-shadow @duration-fast ease,
    transform @duration-fast ease;
  box-sizing: border-box;
  outline: none;
  min-width: 0;

  &:hover {
    border-color: var(--border-base);
    background-color: var(--bg-panel-hover);
    transform: translateY(-1px);
  }

  &:focus-visible {
    box-shadow: @focus-ring-primary;
    border-color: var(--border-base);
  }

  &:active {
    transform: scale(0.98);
  }

  &.is-selected {
    border-color: var(--color-danger);
    background-color: color-mix(in srgb, var(--color-danger), transparent 90%);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-danger), transparent 50%);
  }

  :deep(*) {
    cursor: inherit !important;
    pointer-events: inherit !important;
  }
}

.check-badge-pop-enter-active {
  transition:
    transform @duration-fast @bezier-bounce,
    opacity @duration-fast ease;
}

.check-badge-pop-leave-active {
  transition:
    transform @duration-fast ease-in,
    opacity @duration-fast ease-in;
}

.check-badge-pop-enter-from,
.check-badge-pop-leave-to {
  transform: scale(0.4);
  opacity: 0;
}

.variants-count-highlight {
  color: var(--color-danger);
  font-weight: 700;
}

.variant-preview-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 0.5rem 0.25rem;
  pointer-events: none;
  box-sizing: border-box;
}

.variant-meta-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
  min-width: 0;

  .variant-details {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-body);
    text-align: center;
    line-height: 1.3;

    &.subtle {
      color: var(--text-disabled);
      font-weight: 500;
    }
  }
}

/* 🌟 按需导入 Modal 专属交互与排版 */
.import-tab-bar {
  display: flex;
  justify-content: center;
  margin-bottom: 0.2rem;
}

.import-panel-scroll {
  max-height: 54vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 0.2rem;
  box-sizing: border-box;
}

/* 🌟 更改为固定一行三列网格布局 */
.import-groups-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.import-group-simple-card {
  position: relative;
  display: flex;
  align-items: center;
  padding: 0.4rem 0.9rem;
  background-color: var(--bg-body);
  border: 1.5px solid var(--border-light);
  border-radius: @radius-md;
  cursor: pointer;
  transition: @transition-fast;

  &:hover {
    border-color: var(--border-base);
    background-color: var(--bg-panel-hover);
    transform: translateY(-1px);
  }

  &.is-selected {
    border-color: var(--color-primary);
    background-color: color-mix(in srgb, var(--color-primary), transparent 92%);
  }
}

.import-group-info-box {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
  flex: 1;

  .import-group-title {
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--text-title);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .import-group-meta {
    font-size: 0.68rem;
    font-weight: 500;
    color: var(--text-disabled);
  }
}

/* 🌟 更改为固定一行三列网格布局 */
.import-songs-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.import-song-item-card {
  position: relative;
  display: flex;
  align-items: center;
  padding: 0.75rem 0.9rem;
  background-color: var(--bg-body);
  border: 1.5px solid var(--border-light);
  border-radius: @radius-md;
  cursor: pointer;
  transition: @transition-fast;

  &:hover {
    border-color: var(--border-base);
    background-color: var(--bg-panel-hover);
    transform: translateY(-1px);
  }

  &.is-selected {
    border-color: var(--color-primary);
    background-color: color-mix(in srgb, var(--color-primary), transparent 92%);
  }
}

.import-song-info-box {
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
  min-width: 0;
  flex: 1;

  .import-song-title {
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--text-title);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .import-song-meta {
    font-size: 0.68rem;
    font-weight: 500;
    color: var(--text-disabled);
  }
}

.custom-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.65rem 0 0.1rem;
  border-top: 1px solid var(--border-light);
  margin-top: 0.15rem;
}

.actions-right-group {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-shrink: 0;
}
</style>
