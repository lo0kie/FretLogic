<template>
  <!-- 1. 新建分组 Modal -->
  <BaseModal v-model:visible="groupModals.modals.create" title="新建分组" @confirm="groupModals.handleCreateGroup">
    <BaseInput
      v-model="groupModals.modalData.inputValue"
      v-focus
      placeholder="请输入分组名称..."
      clearable
      :maxlength="15"
      @enter="groupModals.handleCreateGroup"
    />
  </BaseModal>

  <!-- 2. 重命名分组 Modal -->
  <BaseModal v-model:visible="groupModals.modals.rename" title="修改组名" @confirm="groupModals.handleRenameGroup">
    <BaseInput
      v-model="groupModals.modalData.inputValue"
      v-focus.select
      placeholder="请输入新名称..."
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
    <p class="modal-description-text text-xs font-medium leading-relaxed text-text-body m-0">
      确定要执行此删除操作吗？删除后组内的所有和弦都将清空。
    </p>
  </BaseModal>

  <!-- 4. 排序配置 Modal -->
  <BaseModal
    v-model:visible="groupModals.modals.sort"
    title="分组和弦排序配置"
    width="w-md"
    @confirm="groupModals.handleSaveSort"
  >
    <div class="sort-modal-body flex flex-col gap-lg py-xs">
      <BaseFormRow label="排序规则" label-width="4.2rem">
        <BaseSegmentedControl v-model="groupModals.modalData.sortRule" :options="SORT_RULE_CONFIG" />
      </BaseFormRow>

      <BaseFormRow label="调式设定" label-width="4.2rem">
        <BaseSelector
          v-model="groupModals.modalData.sortKey"
          :options="KEY_OPTIONS"
          default-value="C"
          :format-option="(val: string | number) => `${val} 调`"
          :disabled="groupModals.modalData.sortRule !== 'KEY_DEGREE'"
          width="md"
        />
      </BaseFormRow>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import BaseFormRow from '@/components/base/BaseFormRow.vue';
import BaseInput from '@/components/base/BaseInput.vue';
import BaseModal from '@/components/base/BaseModal.vue';
import BaseSegmentedControl from '@/components/base/BaseSegmentedControl.vue';
import BaseSelector from '@/components/base/BaseSelector.vue';
import type { useChordGroupModals } from '@/composables/app/useChordGroupModals';
import { KEY_OPTIONS, SORT_RULE_CONFIG } from '@/utils/music/musicTheory';
import { inject } from 'vue';

type GroupModals = ReturnType<typeof useChordGroupModals>;
const groupModals = inject<GroupModals>('groupModals')!;
</script>
