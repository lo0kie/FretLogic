<template>
  <BaseModal
    v-model:visible="backupModals.modals.export"
    :confirm-button-disabled="!isExportConfirmReady"
    :confirm-loading="backupModals.modalData.exportBusy"
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
    <BaseForm :label-width="FORM_LABEL_WIDTH" class="py-xs" gap="md">
      <BaseFormRow
        :disabled="!exportAvailability.chords"
        :help="`全部分组与和弦（当前 ${exportStats.groupCount} 组 / ${exportStats.chordCount} 个）`"
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
        label="乐谱库"
      >
        <BaseSwitch
          v-model="backupModals.modalData.exportSelection.songs"
          :disabled="!exportAvailability.songs"
          aria-label="导出乐谱库"
        />
      </BaseFormRow>

      <BaseFormRow label="同步配置">
        <template #help>
          <div class="flex h-[18px] items-center text-2xs leading-none">
            <span
              v-if="backupModals.modalData.exportSelection.syncSettings && backupModals.hasCredentials.value"
              class="flex items-center gap-1 font-medium text-warning"
            >
              <BaseIcon :icon-size="11" class="shrink-0" name="alert-triangle" />
              <span>Token / 密码将以导出密码加密（AES-GCM），导入时需输入同一密码</span>
            </span>
            <span v-else>云端同步的后端与账号信息</span>
          </div>
        </template>
        <BaseSwitch v-model="backupModals.modalData.exportSelection.syncSettings" aria-label="导出同步配置" />
      </BaseFormRow>

      <!-- O7：密码行只看「是否勾选同步配置」，不再看内存态 hasCredentials——
           Token 为纯内存态，刷新后恒空；按 hasCredentials 显隐会让刷新后「导出同步配置」
           无处输入密码、服务侧硬拒绝，成为死路。本地无凭据时勾选导出也只是空 secrets。 -->
      <BaseFormRow
        v-if="backupModals.modalData.exportSelection.syncSettings"
        help="用于加密备份包内的 Token / 密码，导入这些凭据时必须输入同一密码；请勿与备份文件一起分享"
        label="导出密码"
      >
        <BaseInput
          v-model="backupModals.modalData.exportPassphrase"
          aria-label="导出密码"
          placeholder="输入导出密码以加密凭据"
          type="password"
        />
      </BaseFormRow>

      <BaseFormRow help="工作台与乐谱的乐理显示偏好" label="偏好设置">
        <BaseSwitch v-model="backupModals.modalData.exportSelection.preferences" aria-label="导出偏好设置" />
      </BaseFormRow>
    </BaseForm>
  </BaseModal>

  <BaseModal
    v-model:visible="backupModals.modals.import"
    :confirm-button-disabled="!hasImportSelection"
    :confirm-loading="backupModals.modalData.importBusy"
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
    <BaseForm :label-width="FORM_LABEL_WIDTH" class="py-xs" gap="md">
      <!-- O8：导入覆盖不可逆，明示本机将被整体替换的规模（和弦库/乐谱库是覆盖式写入） -->
      <BaseFormRow
        v-if="importAvailability.chords || importAvailability.songs"
        help="导入按所选类别整库覆盖：本机对应类别现有数据将被替换且不可恢复"
        label="覆盖范围"
      >
        <div class="text-2xs whitespace-nowrap text-fg-muted">
          将整库覆盖本地 {{ exportStats.groupCount }} 组 / {{ exportStats.chordCount }} 个和弦 /
          {{ exportStats.songCount }}
          份乐谱
        </div>
      </BaseFormRow>
      <BaseFormRow
        :disabled="!importAvailability.chords"
        :help="`备份包含 ${importStats?.groupCount ?? 0} 组 / ${importStats?.chordCount ?? 0} 个和弦`"
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
        :help="`云端后端：${importStats?.syncTargetLabel ?? '-'}${
          backupModals.hasEncryptedSecrets.value ? '（凭据已加密，需输入导出密码）' : '（不含凭据）'
        }`"
        label="同步配置"
      >
        <BaseSwitch
          v-model="backupModals.modalData.importSelection.syncSettings"
          :disabled="!importAvailability.syncSettings"
          aria-label="导入同步配置"
        />
      </BaseFormRow>

      <BaseFormRow
        v-if="backupModals.hasEncryptedSecrets.value && backupModals.modalData.importSelection.syncSettings"
        :help="
          backupModals.modalData.secretDecryptFailed
            ? '解密失败：请确认密码与导出时一致'
            : '输入该备份导出时设置的密码，用于解密 Token / 密码'
        "
        label="解密密码"
      >
        <BaseInput
          v-model="backupModals.modalData.importPassphrase"
          aria-label="凭据解密密码"
          placeholder="输入导出时设置的密码"
          type="password"
        />
      </BaseFormRow>

      <BaseFormRow :disabled="!importAvailability.preferences" help="工作台与乐谱的乐理显示偏好" label="偏好设置">
        <BaseSwitch
          v-model="backupModals.modalData.importSelection.preferences"
          :disabled="!importAvailability.preferences"
          aria-label="导入偏好设置"
        />
      </BaseFormRow>
    </BaseForm>
  </BaseModal>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';

import BaseCheckbox from '@/platform/ui/checkbox/BaseCheckbox.vue';
import BaseForm from '@/platform/ui/form/BaseForm.vue';
import BaseFormRow from '@/platform/ui/form/BaseFormRow.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import BaseInput from '@/platform/ui/input/BaseInput.vue';
import BaseModal from '@/platform/ui/modal/BaseModal.vue';
import BaseSwitch from '@/platform/ui/switch/BaseSwitch.vue';
import { injectModalController } from '@/platform/store/useModalController';
import { prefetch } from '@/platform/utils/prefetch';

import type { useBackupModals } from '@/app/modals/useBackupModals';

const backupModals = injectModalController<ReturnType<typeof useBackupModals>>('backupModals');

// 弹窗打开即预取备份动作 chunk：点「确认导出/导入」时模块已在缓存，loading 立即出现。
// 经 prefetch 吞掉失败：预取失败不应产生未处理 rejection，点击时会按原路径重新加载。
onMounted(() => prefetch(backupModals.preloadBackupActions, 'BackupModalsContainer'));

/** 表单行统一 Label 宽度：由 BaseForm 容器下发，各行无需重复声明 */
const FORM_LABEL_WIDTH = '4.5rem';

// computed 解构到顶层，模板中才会自动解包
const {
  exportStats,
  exportAvailability,
  importAvailability,
  importStats,
  hasImportSelection,
  isExportAll,
  isImportAll,
  isExportIndeterminate,
  isImportIndeterminate,
  isExportConfirmReady,
} = backupModals;
</script>
