<template>
  <BaseModal
    v-model:visible="backupModals.modals.export"
    :confirm-button-disabled="!hasExportSelection"
    @confirm="backupModals.handleExportConfirm"
    title="导出备份"
  >
    <template #header-extra>
      <BaseCheckbox
        :indeterminate="isExportIndeterminate"
        :model-value="isExportAll"
        @update:model-value="backupModals.handleExportSelectAll"
        label="全选"
        size="sm"
      />
    </template>
    <div class="flex flex-col gap-md py-xs">
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

      <BaseFormRow :label-width="FORM_LABEL_WIDTH" label="同步配置">
        <template #help>
          <div class="flex h-[18px] items-center text-2xs leading-none">
            <span
              v-if="backupModals.modalData.exportSelection.syncSettings && hasCredentials"
              class="flex items-center gap-1 font-medium text-warning"
            >
              <BaseIcon :icon-size="11" class="shrink-0" name="alert-triangle" />
              <span>包含 Token / 密码明文，请妥善保管勿公开分享</span>
            </span>
            <span v-else>云端同步的后端与账号信息</span>
          </div>
        </template>
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
      <BaseCheckbox
        :indeterminate="isImportIndeterminate"
        :model-value="isImportAll"
        @update:model-value="backupModals.handleImportSelectAll"
        label="全选"
        size="sm"
      />
    </template>
    <div class="flex flex-col gap-md py-xs">
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

<script setup lang="ts">
import { computed } from 'vue';

import BaseCheckbox from '@/platform/ui/checkbox/BaseCheckbox.vue';
import BaseFormRow from '@/platform/ui/form/BaseFormRow.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import BaseModal from '@/platform/ui/modal/BaseModal.vue';
import BaseSwitch from '@/platform/ui/switch/BaseSwitch.vue';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { injectModalController } from '@/platform/store/useModalController';

import type { useBackupModals } from '@/app/modals/useBackupModals';

const backupModals = injectModalController<ReturnType<typeof useBackupModals>>('backupModals');
const settingsStore = useSettingsStore();

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
const isExportIndeterminate = backupModals.isExportIndeterminate;
const isImportIndeterminate = backupModals.isImportIndeterminate;

/** 当前是否存在非空凭证（Token / 密码），用于决定是否展示安全警告 */
const hasCredentials = computed(() =>
  [settingsStore.githubToken, settingsStore.giteeToken, settingsStore.webdavPassword, settingsStore.serverToken].some(
    v => typeof v === 'string' && v.trim().length > 0
  )
);
</script>
