<template>
  <BaseModal
    v-model:visible="backupModals.modals.export"
    :confirm-button-disabled="!hasExportSelection"
    @confirm="backupModals.handleExportConfirm"
    title="导出备份"
  >
    <template #header-extra>
      <ActionButton
        :color="isExportAll ? 'primary' : 'default'"
        :variant="isExportAll ? 'subtle' : 'ghost'"
        @click="backupModals.handleExportSelectAll"
        size="sm"
      >
        全选
      </ActionButton>
    </template>
    <div class="gap-md py-xs flex flex-col">
      <BaseFormRow
        :disabled="!exportAvailability.chords"
        :help="`全部分组与和弦（当前 ${exportStats.groupCount} 组 / ${exportStats.chordCount} 个）`"
        :label-width="FORM_LABEL_WIDTH"
        label="和弦库"
      >
        <BaseSwitch
          v-model="backupModals.modalData.exportSelection.chords"
          :disabled="!exportAvailability.chords"
          aria-label="导出和弦库"
        />
      </BaseFormRow>

      <BaseFormRow
        :disabled="!exportAvailability.songs"
        :help="`全部乐谱（当前 ${exportStats.songCount} 份）`"
        :label-width="FORM_LABEL_WIDTH"
        label="乐谱库"
      >
        <BaseSwitch
          v-model="backupModals.modalData.exportSelection.songs"
          :disabled="!exportAvailability.songs"
          aria-label="导出乐谱库"
        />
      </BaseFormRow>

      <BaseFormRow :label-width="FORM_LABEL_WIDTH" help="云端同步的后端与账号信息" label="同步配置">
        <BaseSwitch v-model="backupModals.modalData.exportSelection.syncSettings" aria-label="导出同步配置" />
      </BaseFormRow>

      <BaseFormRow :label-width="FORM_LABEL_WIDTH" help="工作台与乐谱的乐理显示偏好" label="偏好设置">
        <BaseSwitch v-model="backupModals.modalData.exportSelection.preferences" aria-label="导出偏好设置" />
      </BaseFormRow>
    </div>
  </BaseModal>

  <BaseModal
    v-model:visible="backupModals.modals.import"
    :confirm-button-disabled="!hasImportSelection"
    @confirm="backupModals.handleImportConfirm"
    confirm-type="danger"
    title="导入备份"
  >
    <template #header-extra>
      <ActionButton
        :color="isImportAll ? 'primary' : 'default'"
        :variant="isImportAll ? 'subtle' : 'ghost'"
        @click="backupModals.handleImportSelectAll"
        size="sm"
      >
        全选
      </ActionButton>
    </template>
    <div class="gap-md py-xs flex flex-col">
      <BaseFormRow
        :disabled="!importAvailability.chords"
        :help="`备份包含 ${importStats?.groupCount ?? 0} 组 / ${importStats?.chordCount ?? 0} 个和弦`"
        :label-width="FORM_LABEL_WIDTH"
        label="和弦库"
      >
        <BaseSwitch
          v-model="backupModals.modalData.importSelection.chords"
          :disabled="!importAvailability.chords"
          aria-label="导入和弦库"
        />
      </BaseFormRow>

      <BaseFormRow
        :disabled="!importAvailability.songs"
        :help="`备份包含 ${importStats?.songCount ?? 0} 份乐谱`"
        :label-width="FORM_LABEL_WIDTH"
        label="乐谱库"
      >
        <BaseSwitch
          v-model="backupModals.modalData.importSelection.songs"
          :disabled="!importAvailability.songs"
          aria-label="导入乐谱库"
        />
      </BaseFormRow>

      <BaseFormRow
        :disabled="!importAvailability.syncSettings"
        :help="`云端后端：${importStats?.syncTargetLabel ?? '-'}（含凭据）`"
        :label-width="FORM_LABEL_WIDTH"
        label="同步配置"
      >
        <BaseSwitch
          v-model="backupModals.modalData.importSelection.syncSettings"
          :disabled="!importAvailability.syncSettings"
          aria-label="导入同步配置"
        />
      </BaseFormRow>

      <BaseFormRow
        :disabled="!importAvailability.preferences"
        :label-width="FORM_LABEL_WIDTH"
        help="工作台与乐谱的乐理显示偏好"
        label="偏好设置"
      >
        <BaseSwitch
          v-model="backupModals.modalData.importSelection.preferences"
          :disabled="!importAvailability.preferences"
          aria-label="导入偏好设置"
        />
      </BaseFormRow>
    </div>
  </BaseModal>
</template>

<script lang="ts" setup>
import { inject } from 'vue';

import ActionButton from '@/components/ui/ActionButton.vue';
import BaseFormRow from '@/components/ui/BaseFormRow.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import BaseSwitch from '@/components/ui/BaseSwitch.vue';
import type { useBackupModals } from '@/shared/composables/useBackupModals';

type BackupModals = ReturnType<typeof useBackupModals>;
const backupModals = inject<BackupModals>('backupModals')!;

/** 表单行统一 Label 宽度 */
const FORM_LABEL_WIDTH = '4.5rem';

// computed 解构到顶层，模板中才会自动解包
const exportStats = backupModals.exportStats;
const exportAvailability = backupModals.exportAvailability;
const importAvailability = backupModals.importAvailability;
const importStats = backupModals.importStats;
const hasExportSelection = backupModals.hasExportSelection;
const hasImportSelection = backupModals.hasImportSelection;
const isExportAll = backupModals.isExportAll;
const isImportAll = backupModals.isImportAll;
</script>
