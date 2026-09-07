<template>
  <PromptInputModal
    v-model="groupModals.modalData.inputValue"
    v-model:visible="groupModals.modals.create"
    :maxlength="MAX_GROUP_NAME_LENGTH"
    @confirm="groupModals.handleCreateGroup"
    placeholder="请输入分组名称..."
    title="新建分组"
  />

  <PromptInputModal
    v-model="groupModals.modalData.inputValue"
    v-model:visible="groupModals.modals.rename"
    :maxlength="MAX_GROUP_NAME_LENGTH"
    @confirm="groupModals.handleRenameGroup"
    select-on-focus
    placeholder="请输入新名称..."
    title="修改组名"
  />

  <BaseModal
    v-model:visible="groupModals.modals.delete"
    :title="deleteGroupTitle"
    @confirm="groupModals.handleDeleteGroup"
    confirm-type="danger"
  >
    <p class="modal-description-text m-0 text-xs/relaxed font-medium text-fg-body">
      确定要执行此删除操作吗？删除后组内的所有和弦都将清空。
    </p>
  </BaseModal>

  <BaseModal
    v-model:visible="groupModals.modals.sort"
    @confirm="groupModals.handleSaveSort"
    title="分组和弦排序配置"
    width="w-md"
  >
    <div class="sort-modal-body flex flex-col gap-lg py-xs">
      <BaseFormRow :label-width="FORM_LABEL_WIDTH" label="排序规则">
        <BaseSegmentedControl v-model="groupModals.modalData.sortRule" :options="SORT_RULE_CONFIG" />
      </BaseFormRow>

      <BaseFormRow :label-width="FORM_LABEL_WIDTH" label="调式设定">
        <KeySelector
          v-model="groupModals.modalData.sortKey"
          :disabled="groupModals.modalData.sortRule !== 'KEY_DEGREE'"
          width="md"
        />
      </BaseFormRow>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import KeySelector from '@/domains/chord/components/KeySelector.vue';
import BaseFormRow from '@/platform/ui/form/BaseFormRow.vue';
import BaseModal from '@/platform/ui/modal/BaseModal.vue';
import PromptInputModal from '@/platform/ui/prompt/PromptInputModal.vue';
import BaseSegmentedControl from '@/platform/ui/segmented/BaseSegmentedControl.vue';
import { SORT_RULE_CONFIG } from '@/domains/chord/theory/theory';
import { injectModalController } from '@/platform/store/useModalController';

import type { useChordGroupModals } from '@/domains/chord/library/composables/useChordGroupModals';

const groupModals = injectModalController<ReturnType<typeof useChordGroupModals>>('groupModals');

/** 表单行统一 Label 宽度 */
const FORM_LABEL_WIDTH = '4.2rem';
/** 分组名称最大长度 */
const MAX_GROUP_NAME_LENGTH = 15;

/** 删除分组弹窗标题：拼接被删分组名 */
const deleteGroupTitle = computed(() => `删除分组 ${groupModals.modalData.activeGroup?.name}`);
</script>
