<template>
  <BaseModal
    v-model:visible="isSyncModalOpen"
    title="云端同步设置"
    width="w-80"
    :close-on-mask="!isSyncing && !isPulling && !isFetchingBranches"
  >
    <template #header-extra>
      <BaseSegmentedControl v-model="settingsStore.syncTarget" :options="providerOptions" />
    </template>

    <template #default>
      <div
        class="sync-panel-card w-full flex flex-col gap-md bg-bg-panel p-md rounded-lg border border-glass-border box-border"
      >
        <div class="panel-header flex items-center justify-between box-border">
          <h3 class="panel-title text-xs font-semibold text-text-disabled m-0">云端同步</h3>
        </div>

        <template v-if="settingsStore.syncTarget === 'github'">
          <BaseInput
            v-model="settingsStore.githubToken"
            v-focus
            placeholder="GitHub Token (ghp_...)"
            is-password
            clearable
            :maxlength="100"
            show-count
          />

          <div class="grid-columns grid grid-cols-2 gap-md box-border">
            <BaseInput
              v-model="settingsStore.githubOwner"
              placeholder="Username"
              clearable
              :maxlength="39"
              show-count
            />

            <BaseInput
              v-model="settingsStore.githubRepo"
              placeholder="Repository"
              clearable
              :maxlength="100"
              show-count
            />
          </div>

          <div class="grid-columns grid grid-cols-2 gap-md box-border">
            <BaseSelector
              v-model="settingsStore.githubBranch"
              clearable
              placeholder="请选择或获取分支"
              :options="settingsStore.githubBranches"
              default-value=""
            />

            <ActionButton
              :disabled="isFetchBranchesDisabled"
              :loading="isFetchingBranches"
              @click="handleFetchBranchesClick"
            >
              查询分支
            </ActionButton>
          </div>
        </template>

        <template v-else>
          <BaseInput
            v-model="settingsStore.webdavServerUrl"
            placeholder="WebDAV 地址"
            clearable
            :maxlength="200"
            show-count
          />

          <BaseInput v-model="settingsStore.webdavUsername" placeholder="用户名" clearable :maxlength="100" />

          <BaseInput
            v-model="settingsStore.webdavPassword"
            placeholder="密码"
            is-password
            clearable
            :maxlength="100"
            show-count
          />

          <BaseInput
            v-model="settingsStore.webdavProxyUrl"
            v-tooltip="'可选：CORS 代理地址，用于绕开浏览器跨域限制'"
            placeholder="CORS 非必填"
            clearable
            :maxlength="200"
            show-count
          />

          <p class="form-hint">
            提示：浏览器直连 WebDAV 常被跨域(CORS)拦截。可在服务器开启 CORS，或填写上方「CORS 代理」经代理转发请求。
          </p>
        </template>
      </div>
    </template>

    <template #footer>
      <ActionButton
        v-tooltip="isPulling ? '同步中' : isPullConfigComplete ? '请先填写配置' : '从云端下载并覆盖本地数据'"
        :disabled="isPullConfigComplete || isSyncing"
        :loading="isPulling"
        @click="handlePullClick"
      >
        <template #prefix>
          <CloudDownload :size="13" stroke-width="2.5" />
        </template>
        拉取
      </ActionButton>

      <ActionButton
        v-tooltip="isSyncing ? '同步中' : isPushConfigComplete ? '请先填写配置' : '将本地数据推送到云端'"
        :disabled="isPushConfigComplete || isSyncing"
        :loading="isSyncing"
        @click="handleSyncClick"
      >
        <template #prefix>
          <CloudUpload :size="13" stroke-width="2.5" />
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
import BaseSegmentedControl from '@/components/base/BaseSegmentedControl.vue';
import BaseSelector from '@/components/base/BaseSelector.vue';
import { useSyncService } from '@/composables/app/useSyncService';
import type { SyncProviderKind } from '@/services/sync/provider';
import { useSettingsStore } from '@/stores/settingsStore';
import { CloudDownload, CloudUpload } from '@lucide/vue';
import { computed, ref } from 'vue';

const isSyncModalOpen = defineModel<boolean>('isSyncModalOpen', { required: true });
const { triggerGlobalSync, pullFromRemote, fetchGithubBranches, isSyncing, isPulling } = useSyncService();
const settingsStore = useSettingsStore();
const isFetchingBranches = ref(false);

const handleSyncClick = async () => {
  const ok = await triggerGlobalSync();
  if (ok) isSyncModalOpen.value = false;
};

const handlePullClick = async () => {
  const ok = await pullFromRemote();
  if (ok) isSyncModalOpen.value = false;
};

const providerOptions: { label: string; value: SyncProviderKind }[] = [
  { label: 'GitHub', value: 'github' },
  { label: 'WebDAV', value: 'webdav' },
];

// 控制获取分支按钮的禁用状态（只要填了账号和仓库名即可获取，不需要 Token）
const isFetchBranchesDisabled = computed(() => {
  return !settingsStore.githubOwner.trim() || !settingsStore.githubRepo.trim() || isFetchingBranches.value;
});

// 拉取只需要账号、仓库、分支和文件路径（公开仓库无需 Token）
const isPullConfigComplete = computed(() => {
  if (settingsStore.syncTarget === 'webdav') {
    return !settingsStore.webdavServerUrl.trim();
  }
  return (
    !settingsStore.githubOwner.trim() ||
    !settingsStore.githubRepo.trim() ||
    !settingsStore.githubBranch.trim() ||
    !settingsStore.githubPath.trim()
  );
});

// 同步（推送）写回仓库，因此必须校验 Token 是否填写
const isPushConfigComplete = computed(() => {
  if (settingsStore.syncTarget === 'webdav') {
    return isPullConfigComplete.value;
  }
  return isPullConfigComplete.value || !settingsStore.githubToken.trim();
});

const handleFetchBranchesClick = async () => {
  isFetchingBranches.value = true;
  settingsStore.githubBranches = [];
  settingsStore.githubBranch = '';

  try {
    await fetchGithubBranches();
  } finally {
    isFetchingBranches.value = false;
  }
};
</script>
