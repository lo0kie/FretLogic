<template>
  <BaseModal v-model:visible="groupModals.modals.create" @confirm="groupModals.handleCreateGroup" title="新建分组">
    <BaseInput
      v-focus
      v-model="groupModals.modalData.inputValue"
      :maxlength="MAX_GROUP_NAME_LENGTH"
      @enter="groupModals.handleCreateGroup"
      clearable
      placeholder="请输入分组名称..."
    />
  </BaseModal>

  <BaseModal v-model:visible="groupModals.modals.rename" @confirm="groupModals.handleRenameGroup" title="修改组名">
    <BaseInput
      v-focus.select
      v-model="groupModals.modalData.inputValue"
      :maxlength="MAX_GROUP_NAME_LENGTH"
      @enter="groupModals.handleRenameGroup"
      clearable
      placeholder="请输入新名称..."
    />
  </BaseModal>

  <BaseModal
    v-model:visible="groupModals.modals.delete"
    :title="deleteGroupTitle"
    @confirm="groupModals.handleDeleteGroup"
    confirm-type="danger"
  >
    <p class="modal-description-text text-text-body m-0 text-xs leading-relaxed font-medium">
      确定要执行此删除操作吗？删除后组内的所有和弦都将清空。
    </p>
  </BaseModal>

  <BaseModal
    v-model:visible="groupModals.modals.sort"
    @confirm="groupModals.handleSaveSort"
    title="分组和弦排序配置"
    width="w-md"
  >
    <div class="sort-modal-body gap-lg py-xs flex flex-col">
      <BaseFormRow :label-width="FORM_LABEL_WIDTH" label="排序规则">
        <BaseSegmentedControl v-model="groupModals.modalData.sortRule" :options="SORT_RULE_CONFIG" />
      </BaseFormRow>

      <BaseFormRow :label-width="FORM_LABEL_WIDTH" label="调式设定">
        <BaseSelector
          v-model="groupModals.modalData.sortKey"
          :disabled="groupModals.modalData.sortRule !== 'KEY_DEGREE'"
          :options="KEY_OPTIONS"
          default-value="C"
          width="md"
        >
          <template #label="{ selected }">
            <span v-chord-name="{ name: `${selected}调` }" />
          </template>

          <template #option="{ option }">
            <span v-chord-name="{ name: `${option}调` }" />
          </template>
        </BaseSelector>
      </BaseFormRow>
    </div>
  </BaseModal>
</template>

<script lang="ts" setup>
import { computed, inject } from 'vue';

import BaseFormRow from '@/components/ui/BaseFormRow.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import BaseSegmentedControl from '@/components/ui/BaseSegmentedControl.vue';
import BaseSelector from '@/components/ui/BaseSelector.vue';
import type { useChordGroupModals } from '@/features/chord-library/composables/useChordGroupModals';
import { KEY_OPTIONS, SORT_RULE_CONFIG } from '@/services/music/theory';

type GroupModals = ReturnType<typeof useChordGroupModals>;
const groupModals = inject<GroupModals>('groupModals')!;

/** 表单行统一 Label 宽度 */
const FORM_LABEL_WIDTH = '4.2rem';
/** 分组名称最大长度 */
const MAX_GROUP_NAME_LENGTH = 15;

/** 删除分组弹窗标题：拼接被删分组名 */
const deleteGroupTitle = computed(() => `删除分组 ${groupModals.modalData.activeGroup?.name}`);
</script>
