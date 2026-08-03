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

  <BaseModal
    v-model:visible="groupModals.modals.sort"
    title="分组和弦排序配置"
    @confirm="groupModals.handleSaveSort"
    width="w-lg"
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
        <label class="config-label">设定基准调</label>
        <div class="key-selector-wrapper">
          <BaseSelector
            v-model="groupModals.modalData.sortKey"
            :options="['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']"
            default-value="C"
            :label-formatter="val => `${val} 调级数 (1-7级)`"
          />
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import BaseInput from '@/components/BaseInput.vue';
import BaseMarquee from '@/components/BaseMarquee.vue';
import BaseModal from '@/components/BaseModal.vue';
import BaseSegmentedControl from '@/components/BaseSegmentedControl.vue';
import BaseSelector from '@/components/BaseSelector.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { useChordGroupModals } from '@/services/useChordGroupModals';
import { useChordStore } from '@/stores/chordStore';

defineProps<{ groupModals: ReturnType<typeof useChordGroupModals> }>();

const chordStore = useChordStore();
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
  justify-content: flex-start; /* 🌟 改为左对齐 */
  gap: 1.2rem; /* 🌟 增大 Label 与控件之间的固定间距 */
}

.config-label {
  width: 4.2rem; /* 🌟 固定 Label 宽度，确保上下两行的控件起始位置对齐 */
  flex-shrink: 0;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-title);
  white-space: nowrap;
}

.key-selector-wrapper {
  width: 12rem; /* 🌟 给选择器固定宽度，保持与分段控件视觉协调 */
  flex-shrink: 0;
}
</style>
