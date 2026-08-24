<template>
  <!-- 1. 新建分组 Modal -->
  <BaseModal v-model:visible="groupModals.modals.create" title="新建分组" @confirm="groupModals.handleCreateGroup">
    <BaseInput
      v-model="groupModals.modalData.inputValue"
      placeholder="请输入分组名称..."
      clearable
      autofocus
      :maxlength="15"
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
      :maxlength="15"
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

  <!-- 4. 排序配置 Modal -->
  <BaseModal
    v-model:visible="groupModals.modals.sort"
    title="分组和弦排序配置"
    width="w-md"
    @confirm="groupModals.handleSaveSort"
  >
    <div class="sort-modal-body">
      <div class="sort-config-row">
        <label class="config-label">排序规则</label>
        <BaseSegmentedControl v-model="groupModals.modalData.sortRule" :options="SORT_RULE_CONFIG" />
      </div>
      <div class="sort-config-row">
        <label class="config-label">调式设定</label>
        <div class="key-selector-wrapper">
          <BaseSelector
            v-model="groupModals.modalData.sortKey"
            :options="KEY_OPTIONS"
            default-value="C"
            :label-formatter="val => `${val} 调`"
            :disabled="groupModals.modalData.sortRule !== 'KEY_DEGREE'"
          />
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import BaseInput from '@/components/BaseInput.vue';
import BaseModal from '@/components/BaseModal.vue';
import BaseSegmentedControl from '@/components/BaseSegmentedControl.vue';
import BaseSelector from '@/components/BaseSelector.vue';
import type { useChordGroupModals } from '@/composables/useChordGroupModals';
import { KEY_OPTIONS, SORT_RULE_CONFIG } from '@/utils/musicTheory';
import { inject } from 'vue';

type GroupModals = ReturnType<typeof useChordGroupModals>;
const groupModals = inject<GroupModals>('groupModals')!;
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.modal-description-text {
  font-size: @fs-xs;
  font-weight: 500;
  line-height: 1.6;
  color: var(--text-body);
  margin: 0;
}

.sort-modal-body {
  display: flex;
  flex-direction: column;
  gap: @space-lg;
  padding: @space-xs 0;
}

.sort-config-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.config-label {
  width: 4.2rem;
  flex-shrink: 0;
  font-size: @fs-xs;
  font-weight: 600;
  color: var(--text-title);
  white-space: nowrap;
}

.key-selector-wrapper {
  width: 8rem;
  flex-shrink: 0;
}
</style>
