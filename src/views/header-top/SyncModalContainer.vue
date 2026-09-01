<template>
  <BaseModal
    v-model:visible="isSyncModalOpen"
    title="同步设置"
    width="w-80"
    :close-on-mask="modalCloseable"
    :show-close="modalCloseable"
    :keyboard="modalCloseable"
  >
    <template #header-extra>
      <BaseSelector
        v-model="selectedProvider"
        :disabled="!modalCloseable"
        :options="providerOptions"
        class="w-36"
        width="md"
      />
    </template>

    <template #default>
      <div class="flex flex-col gap-md">
        <div
          class="sync-panel-card w-full flex flex-col gap-md bg-bg-panel p-md rounded-lg border border-glass-border box-border"
        >
          <div class="panel-header flex items-center justify-between box-border">
            <h3 class="panel-title text-xs font-semibold text-text-disabled m-0">云端同步</h3>
          </div>

          <template v-if="selectedProvider === 'server'">
            <div class="flex flex-col gap-sm py-xs box-border">
              <p class="form-hint m-0">
                免配置开箱即用，由系统自动连接云端数据库。直接点击下方按钮进行测试、拉取或同步。
              </p>
            </div>
          </template>

          <template v-else-if="selectedProvider === 'github'">
            <div class="flex flex-col gap-sm py-xs box-border">
              <BaseInput
                v-model="settingsStore.githubToken"
                placeholder="GitHub Token (ghp_...)"
                is-password
                clearable
                :disabled="isBusy"
                :maxlength="100"
                show-count
              />

              <p class="form-hint m-0">提示：推送写回分支需配置 Token；拉取公开分支无需 Token。</p>
            </div>
          </template>

          <template v-else-if="selectedProvider === 'webdav'">
            <div class="flex flex-col gap-sm py-xs box-border">
              <BaseInput
                v-model="settingsStore.webdavServerUrl"
                placeholder="WebDAV 地址 (https://...)"
                clearable
                :disabled="isBusy"
                :maxlength="200"
                show-count
              />

              <BaseInput
                v-model="settingsStore.webdavUsername"
                placeholder="用户名"
                clearable
                :disabled="isBusy"
                :maxlength="100"
              />

              <BaseInput
                v-model="settingsStore.webdavPassword"
                placeholder="密码"
                is-password
                clearable
                :disabled="isBusy"
                :maxlength="100"
                show-count
              />
            </div>
          </template>
        </div>

        <div v-if="selectedProvider === 'webdav'" class="flex flex-col gap-xs px-xs box-border">
          <div class="flex items-center justify-between py-0.5">
            <span class="text-xs font-medium text-text-secondary">使用预设代理</span>
            <BaseSwitch v-model="settingsStore.webdavUseDefaultProxy" :disabled="isBusy" aria-label="使用预设代理" />
          </div>

          <BaseInput
            v-if="!settingsStore.webdavUseDefaultProxy"
            v-model="settingsStore.webdavProxyUrl"
            placeholder="自定义代理地址 (留空则直连)"
            clearable
            :disabled="isBusy"
            :maxlength="200"
            show-count
          />

          <p class="form-hint m-0">
            {{
              settingsStore.webdavUseDefaultProxy
                ? '已启用预设代理，自动转发跨域请求。'
                : '关闭预设代理后可填写自定义代理，留空则浏览器直接连接。'
            }}
          </p>
        </div>
      </div>
    </template>

    <template #footer>
      <ActionButton
        v-tooltip="testConnectionTooltip"
        :disabled="isTestDisabled || isBusy"
        :loading="isTestingConnection"
        @click="handleTestConnectionClick"
      >
        <template #prefix>
          <PlugZap :size="13" :stroke-width="2.5" />
        </template>
        测试连接
      </ActionButton>

      <ActionButton
        v-tooltip="pullTooltip"
        :disabled="isPullDisabled || isBusy"
        :loading="isPulling"
        @click="handlePullClick"
      >
        <template #prefix>
          <CloudDownload :size="13" :stroke-width="2.5" />
        </template>
        拉取
      </ActionButton>

      <ActionButton
        v-tooltip="syncTooltip"
        :disabled="isSyncDisabled || isBusy"
        :loading="isSyncing"
        @click="handleSyncClick"
      >
        <template #prefix>
          <CloudUpload :size="13" :stroke-width="2.5" />
        </template>
        同步
      </ActionButton>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import ActionButton from '@/components/base/ActionButton.vue';
import BaseInput from '@/components/base/BaseInput.vue';
import BaseModal from '@/components/base/BaseModal.vue';
import BaseSelector, { type BaseSelectorOption } from '@/components/base/BaseSelector.vue';
import BaseSwitch from '@/components/base/BaseSwitch.vue';
import { useBackupModals } from '@/composables/app/useBackupModals';
import { useSyncService } from '@/composables/app/useSyncService';
import type { SyncProviderKind } from '@/services/sync/provider';
import { useSettingsStore } from '@/stores/settingsStore';
import { CloudDownload, CloudUpload, FolderSync, GitBranch, PlugZap, Server } from '@lucide/vue';
import { computed, ref, watch } from 'vue';

const isSyncModalOpen = defineModel<boolean>('isSyncModalOpen', { required: true });
const { triggerGlobalSync, pullFromRemote, testConnection, isSyncing, isPulling, isTestingConnection } =
  useSyncService();
const settingsStore = useSettingsStore();
const backupModals = useBackupModals();

// 弹窗内的方案选择器仅用于切换当前查看与配置的表单，不直接修改全局激活的方案
const selectedProvider = ref<SyncProviderKind>(settingsStore.syncTarget);

watch(isSyncModalOpen, isOpen => {
  if (isOpen) {
    selectedProvider.value = settingsStore.syncTarget;
  }
});

const handleSyncClick = async () => {
  const ok = await triggerGlobalSync(selectedProvider.value);
  if (ok) isSyncModalOpen.value = false;
};

const handlePullClick = async () => {
  const payload = await pullFromRemote(selectedProvider.value);
  if (payload) {
    isSyncModalOpen.value = false;
    backupModals.openImportWithPayload(payload, '云端同步数据');
  }
};

const providerOptions: BaseSelectorOption<SyncProviderKind>[] = [
  { label: '线上服务器', value: 'server', icon: Server },
  { label: 'GitHub', value: 'github', icon: GitBranch },
  { label: 'WebDAV', value: 'webdav', icon: FolderSync },
];

/** 任一同异步操作进行中时，锁定全部操作按钮并禁止关闭弹窗 */
const isBusy = computed(() => isSyncing.value || isPulling.value || isTestingConnection.value);

const modalCloseable = computed(() => !isBusy.value);

// 拉取配置禁用判断：服务器与预设 GitHub 随时可拉取，WebDAV 需填服务器地址
const isPullDisabled = computed(() => {
  if (selectedProvider.value === 'webdav') return !settingsStore.webdavServerUrl.trim();
  return false;
});

// 同步（推送）配置禁用判断：GitHub 需填 Token，WebDAV 需填服务器地址，服务器免密
const isSyncDisabled = computed(() => {
  if (selectedProvider.value === 'github') return !settingsStore.githubToken.trim();
  if (selectedProvider.value === 'webdav') return !settingsStore.webdavServerUrl.trim();
  return false;
});

const handleTestConnectionClick = async () => {
  await testConnection(selectedProvider.value);
};

// 测试连接禁用判断：WebDAV 需填服务器地址，服务器与预设 GitHub 随时可测
const isTestDisabled = computed(() => {
  if (selectedProvider.value === 'webdav') return !settingsStore.webdavServerUrl.trim();
  return false;
});

/** 测试连接按钮提示：按测试中状态与配置完整性给说明 */
const testConnectionTooltip = computed(() => {
  if (isTestingConnection.value) return '测试中';
  if (isBusy.value) return '其他操作进行中';
  if (isTestDisabled.value) return '请先填写 WebDAV 服务器地址';
  return '验证云端地址与凭据（不读写数据）';
});

/** 拉取按钮提示：按拉取状态与配置完整性给说明 */
const pullTooltip = computed(() => {
  if (isPulling.value) return '同步中';
  if (isBusy.value) return '其他操作进行中';
  if (isPullDisabled.value) return '请先填写 WebDAV 服务器地址';
  return '从云端获取数据并弹窗确认导入';
});

/** 同步按钮提示：按同步状态与配置完整性给说明 */
const syncTooltip = computed(() => {
  if (isSyncing.value) return '同步中';
  if (isBusy.value) return '其他操作进行中';
  if (isSyncDisabled.value) {
    if (selectedProvider.value === 'github') return '推送写回分支需先填写 GitHub Token';
    return '请先填写 WebDAV 服务器地址';
  }
  return '将本地数据推送到云端';
});
</script>
