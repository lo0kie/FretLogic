<template>
  <BaseModal v-model:visible="groupModals.modals.create" title="新建分组" @confirm="groupModals.handleCreateGroup">
    <BaseInput
      v-model="groupModals.modalData.inputValue"
      v-focus
      placeholder="请输入分组名称..."
      clearable
      :maxlength="MAX_GROUP_NAME_LENGTH"
      @enter="groupModals.handleCreateGroup"
    />
  </BaseModal>

  <BaseModal v-model:visible="groupModals.modals.rename" title="修改组名" @confirm="groupModals.handleRenameGroup">
    <BaseInput
      v-model="groupModals.modalData.inputValue"
      v-focus.select
      placeholder="请输入新名称..."
      clearable
      :maxlength="MAX_GROUP_NAME_LENGTH"
      @enter="groupModals.handleRenameGroup"
    />
  </BaseModal>

  <BaseModal
    v-model:visible="groupModals.modals.delete"
    :title="deleteGroupTitle"
    confirm-type="danger"
    @confirm="groupModals.handleDeleteGroup"
  >
    <p class="modal-description-text text-xs font-medium leading-relaxed text-text-body m-0">
      确定要执行此删除操作吗？删除后组内的所有和弦都将清空。
    </p>
  </BaseModal>

  <BaseModal
    v-model:visible="groupModals.modals.sort"
    title="分组和弦排序配置"
    width="w-md"
    @confirm="groupModals.handleSaveSort"
  >
    <div class="sort-modal-body flex flex-col gap-lg py-xs">
      <BaseFormRow label="排序规则" :label-width="FORM_LABEL_WIDTH">
        <BaseSegmentedControl v-model="groupModals.modalData.sortRule" :options="SORT_RULE_CONFIG" />
      </BaseFormRow>

      <BaseFormRow label="调式设定" :label-width="FORM_LABEL_WIDTH">
        <BaseSelector
          v-model="groupModals.modalData.sortKey"
          :options="KEY_OPTIONS"
          default-value="C"
          :disabled="groupModals.modalData.sortRule !== 'KEY_DEGREE'"
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

<script setup lang="ts">
import BaseFormRow from '@/components/ui/BaseFormRow.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import BaseSegmentedControl from '@/components/ui/BaseSegmentedControl.vue';
import BaseSelector from '@/components/ui/BaseSelector.vue';
import type { useChordGroupModals } from '@/features/chord-library/composables/useChordGroupModals';
import { KEY_OPTIONS, SORT_RULE_CONFIG } from '@/utils/music/musicTheory';
import { computed, inject } from 'vue';

type GroupModals = ReturnType<typeof useChordGroupModals>;
const groupModals = inject<GroupModals>('groupModals')!;

/** 表单行统一 Label 宽度 */
const FORM_LABEL_WIDTH = '4.2rem';
/** 分组名称最大长度 */
const MAX_GROUP_NAME_LENGTH = 15;

/** 删除分组弹窗标题：拼接被删分组名 */
const deleteGroupTitle = computed(() => `删除分组 ${groupModals.modalData.activeGroup?.name}`);
</script>
