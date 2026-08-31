<template>
  <BaseModal
    v-model:visible="backupModals.modals.export"
    title="导出备份"
    :confirm-button-disabled="!hasExportSelection"
    @confirm="backupModals.handleExportConfirm"
  >
    <template #header-extra>
      <ActionButton
        size="sm"
        :variant="isExportAll ? 'subtle' : 'ghost'"
        :color="isExportAll ? 'primary' : 'default'"
        @click="backupModals.handleExportSelectAll"
      >
        全选
      </ActionButton>
    </template>
    <div class="flex flex-col gap-md py-xs">
      <BaseFormRow
        label="和弦库"
        label-width="4.5rem"
        :help="`全部分组与和弦（当前 ${exportStats.groupCount} 组 / ${exportStats.chordCount} 个）`"
        :disabled="!exportAvailability.chords"
      >
        <BaseSwitch
          v-model="backupModals.modalData.exportSelection.chords"
          aria-label="导出和弦库"
          :disabled="!exportAvailability.chords"
        />
      </BaseFormRow>

      <BaseFormRow
        label="乐谱库"
        label-width="4.5rem"
        :help="`全部乐谱（当前 ${exportStats.songCount} 份）`"
        :disabled="!exportAvailability.songs"
      >
        <BaseSwitch
          v-model="backupModals.modalData.exportSelection.songs"
          aria-label="导出乐谱库"
          :disabled="!exportAvailability.songs"
        />
      </BaseFormRow>

      <BaseFormRow label="同步配置" label-width="4.5rem" help="云端同步的后端与账号信息">
        <BaseSwitch v-model="backupModals.modalData.exportSelection.syncSettings" aria-label="导出同步配置" />
      </BaseFormRow>

      <BaseFormRow label="偏好设置" label-width="4.5rem" help="工作台与乐谱的乐理显示偏好">
        <BaseSwitch v-model="backupModals.modalData.exportSelection.preferences" aria-label="导出偏好设置" />
      </BaseFormRow>
    </div>
  </BaseModal>

  <BaseModal
    v-model:visible="backupModals.modals.import"
    title="导入备份"
    confirm-type="danger"
    :confirm-button-disabled="!hasImportSelection"
    @confirm="backupModals.handleImportConfirm"
  >
    <template #header-extra>
      <ActionButton
        size="sm"
        :variant="isImportAll ? 'subtle' : 'ghost'"
        :color="isImportAll ? 'primary' : 'default'"
        @click="backupModals.handleImportSelectAll"
      >
        全选
      </ActionButton>
    </template>
    <div class="flex flex-col gap-md py-xs">
      <BaseFormRow
        label="和弦库"
        label-width="4.5rem"
        :help="`备份包含 ${importStats?.groupCount ?? 0} 组 / ${importStats?.chordCount ?? 0} 个和弦`"
        :disabled="!importAvailability.chords"
      >
        <BaseSwitch
          v-model="backupModals.modalData.importSelection.chords"
          aria-label="导入和弦库"
          :disabled="!importAvailability.chords"
        />
      </BaseFormRow>

      <BaseFormRow
        label="乐谱库"
        label-width="4.5rem"
        :help="`备份包含 ${importStats?.songCount ?? 0} 份乐谱`"
        :disabled="!importAvailability.songs"
      >
        <BaseSwitch
          v-model="backupModals.modalData.importSelection.songs"
          aria-label="导入乐谱库"
          :disabled="!importAvailability.songs"
        />
      </BaseFormRow>

      <BaseFormRow
        label="同步配置"
        label-width="4.5rem"
        :help="`云端后端：${importStats?.syncTargetLabel ?? '-'}（含凭据）`"
        :disabled="!importAvailability.syncSettings"
      >
        <BaseSwitch
          v-model="backupModals.modalData.importSelection.syncSettings"
          aria-label="导入同步配置"
          :disabled="!importAvailability.syncSettings"
        />
      </BaseFormRow>

      <BaseFormRow
        label="偏好设置"
        label-width="4.5rem"
        help="工作台与乐谱的乐理显示偏好"
        :disabled="!importAvailability.preferences"
      >
        <BaseSwitch
          v-model="backupModals.modalData.importSelection.preferences"
          aria-label="导入偏好设置"
          :disabled="!importAvailability.preferences"
        />
      </BaseFormRow>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import ActionButton from '@/components/base/ActionButton.vue';
import BaseFormRow from '@/components/base/BaseFormRow.vue';
import BaseModal from '@/components/base/BaseModal.vue';
import BaseSwitch from '@/components/base/BaseSwitch.vue';
import type { useBackupModals } from '@/composables/app/useBackupModals';
import { inject } from 'vue';

type BackupModals = ReturnType<typeof useBackupModals>;
const backupModals = inject<BackupModals>('backupModals')!;

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
